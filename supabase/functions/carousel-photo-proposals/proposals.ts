import { callAnthropic, HAIKU_MODEL, SONNET_MODEL, type UsageSink } from "../_shared/anthropic.ts";
import {
  acceptableAlt, distributeCandidates, parseChoices, QUERY_RULES, searchPexels, VERIFY_RULES, verifyTool,
  type StockAmbientPhoto,
} from "../_shared/stock-photo-verified.ts";

/**
 * Images proposées d'office sur un carrousel écrit sans photo (26/11/2026,
 * demande de Laetitia : « qu'il y ait déjà des images, on n'a plus qu'à
 * modifier »). Pour chaque slide encore « Image à choisir » :
 *
 * 1. une photo de la BIBLIOTHÈQUE de l'utilisatrice si sa description montre
 *    vraiment le passage (correspondance stricte, jamais deux fois la même) ;
 * 2. sinon une photo libre de droit (Pexels) sans personne ni produit, vérifiée
 *    sur ses pixels par les mêmes règles que les photos d'ambiance
 *    (carousel-ai/stock-ambient.ts) ;
 * 3. sinon rien : la slide reste « Image à choisir », avec une vraie description
 *    de l'image idéale (`ideal`) à la place du texte de la slide recopié.
 *
 * Le serveur ne fait que proposer : l'écran télécharge et pose les photos.
 * Tout échec laisse le carrousel tel quel.
 */
export const PHOTO_PROPOSALS_VERSION = "photo-proposals-v1";
export const MAX_TARGETS = 10;
const PLAN_CALL_MS = 20_000;
const VERIFY_CALL_MS = 30_000;

export interface ProposalInput {
  subject?: string;
  brand?: string;
  slides: { slide: number; text: string }[];
  targets: number[];
  library?: { index: number; description: string; kind?: string }[];
}

export interface Proposal {
  slide: number;
  /** L'image idéale, en français, pour une slide restée sans image. */
  ideal: string | null;
  library_index: number | null;
  stock: StockAmbientPhoto | null;
  /** Autres photos libres de droit vérifiées pour cette slide (« Une autre »). */
  alternates: StockAmbientPhoto[];
}

type Deps = {
  usage: UsageSink;
  call?: typeof callAnthropic;
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
  logger?: (m: string) => void;
};

const PLAN_RULES = `${QUERY_RULES}

En plus, pour chaque slide demandée :
- "ideal" : une phrase courte EN FRANÇAIS (15 mots au plus) qui décrit l'image idéale pour ce passage, concrète, comme on la dirait à quelqu'un qui va prendre la photo. Ne recopie pas le texte de la slide. Exemple : « Un plan d'appartement annoté posé sur une table, un mètre à côté ».
- "library_photo" : si un catalogue de photos de l'utilisatrice est joint (library), le numéro de LA photo dont la description montre VRAIMENT ce passage (même sujet, pas seulement le même thème), sinon null. Au moindre doute, null : une slide sans image vaut mieux qu'une photo à côté du sujet. Ne donne jamais deux fois le même numéro. Les photos de l'utilisatrice peuvent montrer des personnes ou ses produits : l'interdit ci-dessus ne vaut que pour la requête Pexels.
- "query" reste obligatoire même quand tu donnes un library_photo.`;

const planTool = (slides: number[], libraryIds: number[]) => ({
  name: "plan_images",
  description: "Pour chaque slide demandée : l'image idéale, une photo de la bibliothèque si elle convient, une requête Pexels.",
  input_schema: {
    type: "object", required: ["plans"], properties: { plans: {
      type: "array", minItems: slides.length, maxItems: slides.length, items: {
        type: "object", required: ["slide", "ideal", "library_photo", "query"], properties: {
          slide: { type: "integer", enum: slides },
          ideal: { type: "string", maxLength: 200 },
          library_photo: libraryIds.length ? { type: ["integer", "null"], enum: [...libraryIds, null] } : { type: "null" },
          query: { type: "string", maxLength: 60 },
        },
      },
    } },
  },
});

export interface Plan { ideal: string | null; library: number | null; query: string | null }

/** Lecture stricte : slide hors liste ou en double ignorée, photo de bibliothèque jamais donnée deux fois. */
export function parsePlans(raw: string, targets: number[], libraryIds: number[]): Map<number, Plan> {
  const out = new Map<number, Plan>();
  const list = JSON.parse(raw)?.plans;
  if (!Array.isArray(list)) return out;
  const usedLibrary = new Set<number>();
  for (const p of list) {
    if (!targets.includes(p?.slide) || out.has(p.slide)) continue;
    const ideal = typeof p.ideal === "string" ? p.ideal.trim().replace(/\s+/g, " ").slice(0, 200) : "";
    const query = typeof p.query === "string" ? p.query.trim().replace(/\s+/g, " ") : "";
    let library: number | null = null;
    if (Number.isInteger(p.library_photo) && libraryIds.includes(p.library_photo) && !usedLibrary.has(p.library_photo)) {
      library = p.library_photo;
      usedLibrary.add(p.library_photo);
    }
    out.set(p.slide, {
      ideal: ideal.length >= 8 ? ideal : null,
      library,
      // Une requête qui nomme une personne ou un produit trahit la consigne : pas de recherche.
      query: query.length >= 3 && query.length <= 60 && acceptableAlt(query) ? query : null,
    });
  }
  return out;
}

/** Photos dont le contrôle dit explicitement « ni personne, ni produit, ni texte ». */
export function cleanPhotoIds(raw: string): Set<string> {
  const clean = new Set<string>();
  const flagged = new Set<string>();
  const checks = JSON.parse(raw)?.checks;
  for (const c of Array.isArray(checks) ? checks : []) {
    if (typeof c?.photo !== "string") continue;
    if (c.people === false && c.products_or_text === false) clean.add(c.photo);
    else flagged.add(c.photo);
  }
  for (const id of flagged) clean.delete(id);
  return clean;
}

function addUsage(target: UsageSink, sink: UsageSink) {
  for (const key of ["input_tokens", "output_tokens", "total_tokens"] as const) target[key] = (target[key] || 0) + (sink[key] || 0);
}

export async function proposePhotos(input: ProposalInput, deps: Deps): Promise<{ proposals: Proposal[]; receipt: Record<string, unknown> }> {
  const log = deps.logger || ((m: string) => console.log(m));
  const call = deps.call || callAnthropic;
  const fetchImpl = deps.fetchImpl || fetch;
  const apiKey = deps.apiKey === undefined ? Deno.env.get("PEXELS_API_KEY") : deps.apiKey;
  const known = new Set(input.slides.map((s) => s.slide));
  const targets = [...new Set(input.targets)].filter((t) => known.has(t)).slice(0, MAX_TARGETS);
  const library = (input.library || []).filter((p) => Number.isInteger(p.index) && p.description.trim());
  const libraryIds = library.map((p) => p.index);
  const t0 = Date.now();
  const finish = (status: string, proposals: Proposal[], extra: Record<string, unknown> = {}) => {
    const receipt = {
      version: PHOTO_PROPOSALS_VERSION, status, requested: targets, elapsed_ms: Date.now() - t0,
      library: proposals.filter((p) => p.library_index !== null).map((p) => p.slide),
      stock: proposals.filter((p) => p.stock).map((p) => p.slide),
      ...extra,
    };
    log(JSON.stringify({ event: "carousel_photo_proposals", ...receipt }));
    return { proposals, receipt };
  };
  if (!targets.length) return finish("skipped", [], { reason: "no-targets" });

  const brand = String(input.brand || "").slice(0, 1200);
  const sink: UsageSink = {};
  const rawPlans = await call({
    model: HAIKU_MODEL, system: PLAN_RULES, max_tokens: 1500, maxRetries: 0, abortTimeoutMs: PLAN_CALL_MS,
    tool: planTool(targets, libraryIds),
    messages: [{ role: "user", content: JSON.stringify({
      subject: String(input.subject || "").slice(0, 400), brand, carousel: input.slides,
      slides_to_illustrate: targets,
      ...(library.length ? { library: library.map((p) => ({ photo: p.index, kind: p.kind || undefined, description: p.description.slice(0, 400) })) } : {}),
    }) }],
  }, sink);
  addUsage(deps.usage, sink);
  const plans = parsePlans(rawPlans, targets, libraryIds);
  const proposals: Proposal[] = targets.map((slide) => ({
    slide, ideal: plans.get(slide)?.ideal ?? null, library_index: plans.get(slide)?.library ?? null, stock: null, alternates: [],
  }));

  const stockTargets = targets.filter((t) => plans.get(t)?.library == null && plans.get(t)?.query);
  if (!stockTargets.length) return finish("completed", proposals);
  if (!apiKey) return finish("partial", proposals, { reason: "no-pexels-key" });
  try {
    const queries = new Map(stockTargets.map((t) => [t, plans.get(t)!.query!]));
    const results = new Map<string, StockAmbientPhoto[]>();
    await Promise.all([...new Set(queries.values())].map(async (q) => {
      try { results.set(q, await searchPexels(q, apiKey, fetchImpl)); } catch (e) { log(`[photo-proposals] pexels ${q}: ${(e as Error).message}`); }
    }));
    const candidates = distributeCandidates(stockTargets, queries, results);
    if (!candidates.size) return finish("partial", proposals, { reason: "no-candidates", queries: Object.fromEntries(queries) });

    const slides = [...candidates.keys()];
    const ids = [...candidates.values()].flat().map((p) => p.id);
    const content: any[] = [{ type: "text", text: JSON.stringify({ brand, carousel: input.slides, slides_to_check: slides }) }];
    for (const [slide, pool] of candidates) {
      content.push({ type: "text", text: `SLIDE ${slide} — candidates :` });
      for (const p of pool) content.push({ type: "text", text: `PHOTO ${p.id}` }, { type: "image", source: { type: "url", url: p.thumbnail } });
    }
    const vSink: UsageSink = {};
    const rawChoices = await call({
      model: SONNET_MODEL, system: VERIFY_RULES, max_tokens: 2500, maxRetries: 0, abortTimeoutMs: VERIFY_CALL_MS,
      tool: verifyTool(slides, ids), messages: [{ role: "user", content }],
    }, vSink);
    addUsage(deps.usage, vSink);
    const chosen = parseChoices(rawChoices, candidates);
    const clean = cleanPhotoIds(rawChoices);
    const taken = new Set([...chosen.values()].map((p) => p.id));
    for (const p of proposals) {
      const pick = chosen.get(p.slide);
      if (!pick) continue;
      p.stock = pick;
      p.alternates = (candidates.get(p.slide) || []).filter((c) => c.id !== pick.id && clean.has(c.id) && !taken.has(c.id));
    }
    return finish(chosen.size === stockTargets.length ? "completed" : "partial", proposals, { queries: Object.fromEntries(queries) });
  } catch (e) {
    return finish("partial", proposals, { reason: "error", error: String((e as Error)?.message || e).slice(0, 160) });
  }
}
