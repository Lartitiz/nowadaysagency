/**
 * Fidélité produit dans le Studio (03/10/2026), voir _shared/product-fidelity.ts.
 *
 * - Les références de rôle « product » partent au générateur recadrées et
 *   détourées. Le résultat (image + géométrie lue par la vision) est mis en
 *   cache à côté de l'original dans le bucket du Studio : une retouche ne
 *   repaie ni la vision ni Photoroom.
 * - Quand une intégration produit arrive chez Higgsfield, une passe zoomée
 *   redessine le produit avant l'enregistrement du résultat. Un verrou de
 *   stockage (upload sans écrasement) garantit une seule passe payée même si le
 *   rappel du fournisseur et le suivi de la session arrivent ensemble.
 */
import type { Proposal, Reference } from "./media.ts";
import type { getServiceClient } from "../_shared/plan-limiter.ts";
import {
  prepareProductReference, productFidelityLine, refineProductRegion, type PreparedReference,
} from "../_shared/product-fidelity.ts";
import { generateHiggsfieldImageSync, MARKETING_FIDELITY_MODEL } from "../_shared/higgsfield-image-api.ts";

type DB = ReturnType<typeof getServiceClient>;
const BUCKET = "visual-studio";
/** Past this age a refine lock is considered abandoned (worker killed). */
export const REFINE_LOCK_TTL_MS = 4 * 60_000;
const REFINE_BUDGET_MS = 110_000;

export function productReferences(proposal: Proposal): Reference[] {
  return (proposal.references || []).filter((ref) => ref.role === "product");
}

export function productLabel(ref: Pick<Reference, "name" | "description">) {
  return [ref.name, ref.description].filter(Boolean).join(" — ").slice(0, 300) || "the product";
}

/** Product integrations and product edits sent to Marketing Studio's fidelity model. */
export function refineEligible(proposal: Proposal | null | undefined) {
  if (!proposal || proposal.provider !== "higgsfield" || proposal.model !== MARKETING_FIDELITY_MODEL) return false;
  if (!productReferences(proposal).length) return false;
  return proposal.scene_workflow?.phase === "integration" || proposal.operation === "product";
}

type Cached = Pick<PreparedReference, "blob" | "description" | "extraneous">;

/** Prepared reference, from the cache or computed once (never throws). */
export async function preparedStudioReference(db: DB, path: string, original: Blob | null, label: string): Promise<Cached | null> {
  const image = `${path}.fidelity.jpg`, meta = `${path}.fidelity.json`;
  try {
    const [cachedImage, cachedMeta] = await Promise.all([
      db.storage.from(BUCKET).download(image), db.storage.from(BUCKET).download(meta),
    ]);
    if (cachedImage.data && cachedMeta.data && cachedImage.data.size) {
      const data = JSON.parse(await cachedMeta.data.text());
      return { blob: cachedImage.data, description: String(data.description || ""), extraneous: String(data.extraneous || "") };
    }
  } catch { /* cache miss */ }
  try {
    const source = original ?? (await db.storage.from(BUCKET).download(path)).data;
    if (!source) return null;
    const prepared = await prepareProductReference(source, label);
    // Only cache a real improvement: a raw copy would freeze a transient failure.
    if (prepared.cropped || prepared.detoured) {
      await Promise.all([
        db.storage.from(BUCKET).upload(image, prepared.blob, { contentType: prepared.blob.type, upsert: true }),
        db.storage.from(BUCKET).upload(meta, new Blob([JSON.stringify({
          description: prepared.description, extraneous: prepared.extraneous, cropped: prepared.cropped, detoured: prepared.detoured,
        })], { type: "application/json" }), { contentType: "application/json", upsert: true }),
      ]);
    }
    return prepared;
  } catch (error) {
    console.warn("[studio:product-fidelity] prepare", error instanceof Error ? error.message : "failed");
    return null;
  }
}

/**
 * Replaces product reference pixels by their prepared version, in place, and
 * pins their geometry in the proposal (only when the prompt still fits).
 * `paths` and `inputs` follow imageInputPaths(proposal).
 */
export async function applyPreparedReferences(
  db: DB, proposal: Proposal, paths: string[], inputs: Blob[],
  fits: (candidate: Proposal) => boolean = () => true,
) {
  const products = productReferences(proposal);
  if (!products.length) return;
  const protectedPaths = new Set([proposal.input_path, proposal.scene_workflow?.scene_path, proposal.photo_source_path].filter(Boolean));
  const notes: string[] = [];
  for (const ref of products) {
    if (protectedPaths.has(ref.path)) continue;
    const index = paths.indexOf(ref.path);
    if (index < 0) continue;
    const prepared = await preparedStudioReference(db, ref.path, inputs[index], productLabel(ref));
    if (!prepared) continue;
    // Aliases of the same path all receive the prepared pixels.
    paths.forEach((p, i) => { if (p === ref.path) inputs[i] = prepared.blob; });
    const line = productFidelityLine(prepared);
    if (line && !notes.includes(line)) notes.push(line);
  }
  if (!notes.length) return;
  const candidate = { ...proposal, image_prompt: [proposal.image_prompt, ...notes].filter(Boolean).join("\n") };
  if (fits(candidate)) proposal.image_prompt = candidate.image_prompt;
}

type LockState = "acquired" | "busy" | "stale";
async function takeRefineLock(db: DB, resultPath: string, now = Date.now()): Promise<LockState> {
  const lock = `${resultPath}.refine-lock`;
  const created = await db.storage.from(BUCKET).upload(lock, new Blob([String(now)], { type: "text/plain" }), {
    contentType: "text/plain", upsert: false,
  });
  if (!created.error) return "acquired";
  const existing = await db.storage.from(BUCKET).download(lock);
  const since = existing.data ? Number(await existing.data.text()) : NaN;
  return Number.isFinite(since) && now - since < REFINE_LOCK_TTL_MS ? "busy" : "stale";
}

/**
 * Zoomed pass on a finished provider image. Returns the image to store, or
 * null when another worker is already refining it (the caller must wait).
 * Any failure returns the provider image unchanged.
 */
export async function refineStudioResult(
  db: DB,
  version: { id: string; result_path: string; proposal: Proposal; user_id?: string; workspace_id?: string },
  image: Blob,
): Promise<Blob | null> {
  if (!refineEligible(version.proposal)) return image;
  const lock = await takeRefineLock(db, version.result_path);
  if (lock === "busy") return null;
  if (lock === "stale") return image; // The first worker died: deliver without a second payment.
  const t0 = Date.now();
  try {
    const ref = productReferences(version.proposal)[0];
    const prepared = await preparedStudioReference(db, ref.path, null, productLabel(ref));
    if (!prepared || !version.user_id) return image;
    const outcome = await refineProductRegion({
      image, reference: prepared.blob, product: productLabel(ref), ref: prepared,
      generate: async (prompt, inputs) => {
        const r = await generateHiggsfieldImageSync(db, {
          source: "visual-studio", userId: version.user_id!, workspaceId: version.workspace_id ?? null,
          model: MARKETING_FIDELITY_MODEL, prompt, format: "square", inputs, resolution: "1k",
          deadline: t0 + REFINE_BUDGET_MS,
        });
        return r.ok ? r.blob : null;
      },
    });
    console.log("[studio:product-fidelity] refine", JSON.stringify({ version: version.id, ok: outcome.ok, ...(outcome.ok ? {} : { reason: outcome.reason }), ms: Date.now() - t0 }));
    return outcome.ok ? outcome.blob : image;
  } catch (error) {
    console.warn("[studio:product-fidelity] refine", error instanceof Error ? error.message : "failed");
    return image;
  }
}
