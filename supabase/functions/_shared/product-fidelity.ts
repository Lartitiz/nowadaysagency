/**
 * Fidélité produit (03/10/2026) — deux étapes partagées par product-on-model
 * et le Studio visuel :
 *
 * 1. prepareProductReference : la photo produit envoyée au générateur est
 *    recadrée sur le produit (localisé par la vision) puis détourée sur fond
 *    blanc. Un petit bijou perdu dans une grande photo, entouré d'objets
 *    (grains d'argent, emballage…), était réinventé : le générateur mélangeait
 *    les objets voisins au produit et n'en voyait pas assez de pixels.
 *
 * 2. refineProductRegion : passe zoomée après génération. Le produit est
 *    localisé dans l'image obtenue, la zone est recadrée et régénérée seule avec
 *    la référence (le générateur n'a plus que le produit à dessiner), puis
 *    recollée en fondu dans l'image complète.
 *
 * Chaque étape dégrade proprement : en cas d'échec, on garde l'image précédente
 * (jamais perdre une image payée). Les journaux ne contiennent ni prompt ni URL.
 */
import { callAnthropic } from "./anthropic.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export type Box = { x: number; y: number; w: number; h: number };
export type ProductLocation = {
  box: Box | null;
  /** Shape description from the vision model (English, for the image prompt). */
  description: string;
  /** Objects visible near the product that are NOT part of it. */
  extraneous: string;
};
export type PreparedReference = {
  blob: Blob;
  description: string;
  extraneous: string;
  cropped: boolean;
  detoured: boolean;
};

const VISION_MODEL = "claude-sonnet-4-6" as const;
const VISION_WIDTH = 1024;
const PHOTOROOM_URL = "https://image-api.photoroom.com/v2/edit";

async function imagescript() {
  // Loaded on demand (same library and version as image-downscale.ts).
  return (await import("https://deno.land/x/imagescript@1.3.0/mod.ts")).Image;
}

async function decode(blob: Blob) {
  const Image = await imagescript();
  return await Image.decode(new Uint8Array(await blob.arrayBuffer()));
}

async function toJpeg(image: { encodeJPEG(q?: number): Promise<Uint8Array> }, quality = 92) {
  return new Blob([new Uint8Array(await image.encodeJPEG(quality))], { type: "image/jpeg" });
}

/** Normalized box (0..1) → clamped, valid box, or null. */
export function normalizeBox(raw: unknown): Box | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : NaN;
  // The vision model answers on a 0..1000 grid (more reliable than decimals).
  let [x0, y0, x1, y1] = [n(r.x_min), n(r.y_min), n(r.x_max), n(r.y_max)].map((v) => v / 1000);
  if ([x0, y0, x1, y1].some(Number.isNaN)) return null;
  [x0, x1] = [Math.max(0, Math.min(x0, x1)), Math.min(1, Math.max(x0, x1))];
  [y0, y1] = [Math.max(0, Math.min(y0, y1)), Math.min(1, Math.max(y0, y1))];
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return null;
  const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
  return { x: r4(x0), y: r4(y0), w: r4(x1 - x0), h: r4(y1 - y0) };
}

const LOCATE_TOOL = {
  name: "locate_product",
  description: "Report where the product is in the image.",
  input_schema: {
    type: "object",
    properties: {
      found: { type: "boolean" },
      x_min: { type: "integer", minimum: 0, maximum: 1000 },
      y_min: { type: "integer", minimum: 0, maximum: 1000 },
      x_max: { type: "integer", minimum: 0, maximum: 1000 },
      y_max: { type: "integer", minimum: 0, maximum: 1000 },
      description: { type: "string", maxLength: 600 },
      extraneous: { type: "string", maxLength: 200 },
    },
    required: ["found", "description", "extraneous"],
  },
};

/** Vision call: tight bounding box of the product only (0..1000 grid). */
export async function locateProduct(image: Blob, product: string, mode: "reference" | "result"): Promise<ProductLocation | null> {
  try {
    const { downscaleToJpeg } = await import("./image-downscale.ts");
    const light = await downscaleToJpeg(image, VISION_WIDTH, 85);
    if (light.size > 5_000_000) return null;
    const ask = mode === "reference"
      ? `This photo is a product reference for an image generator. Its saved caption (possibly inaccurate: trust the image) is: ${product}. ` +
        "Give the tight bounding box of THIS product only (the main object; for a ring, the whole ring). " +
        "Exclude loose items lying around it (beads, grains, stones, packaging, props, hands). " +
        "description: in English, the product's exact geometry for someone redrawing it: overall size and bulk, " +
        "number of distinct parts, their shapes, relative sizes, arrangement, surface finish, material and color. Max 60 words, no marketing words. " +
        "extraneous: in English, the loose items visible near it that are NOT part of the product (empty string if none)."
      : `This photo was generated to feature a product (saved caption, possibly inaccurate: ${product}). ` +
        "Give the tight bounding box of where this product appears (for a ring: the ring on the finger). " +
        "found=false if it is not visible. description and extraneous: empty strings.";
    const raw = await callAnthropic({
      model: VISION_MODEL,
      max_tokens: 600,
      temperature: 0,
      abortTimeoutMs: 30_000,
      maxRetries: 1,
      keepDashes: true,
      tool: LOCATE_TOOL,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: light.type, data: encodeBase64(await light.arrayBuffer()) } },
          { type: "text", text: ask },
        ],
      }],
    });
    const data = JSON.parse(raw);
    return {
      box: data.found ? normalizeBox(data) : null,
      description: typeof data.description === "string" ? data.description.trim().slice(0, 600) : "",
      extraneous: typeof data.extraneous === "string" ? data.extraneous.trim().slice(0, 200) : "",
    };
  } catch (error) {
    console.warn("[product-fidelity] locate failed", JSON.stringify({ mode, error: error instanceof Error ? error.message : "unknown" }));
    return null;
  }
}

/** Box grown by `margin` (fraction of its size) on each side, clamped to the image. */
export function expandBox(box: Box, margin: number): Box {
  const x0 = Math.max(0, box.x - box.w * margin), y0 = Math.max(0, box.y - box.h * margin);
  const x1 = Math.min(1, box.x + box.w * (1 + margin)), y1 = Math.min(1, box.y + box.h * (1 + margin));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

async function photoroomCutout(blob: Blob): Promise<Blob | null> {
  const key = Deno.env.get("PHOTOROOM_API_KEY");
  if (!key) return null;
  try {
    const form = new FormData();
    form.append("imageFile", blob, "product.jpg");
    form.append("removeBackground", "true");
    form.append("background.color", "FFFFFF");
    // Subject box: the product fills the frame, with a small margin.
    form.append("referenceBox", "subjectBox");
    form.append("padding", "0.08");
    form.append("export.format", "jpg");
    const response = await fetch(PHOTOROOM_URL, {
      method: "POST",
      headers: { "x-api-key": key },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.warn("[product-fidelity] photoroom", JSON.stringify({ status: response.status }));
      return null;
    }
    const out = await response.blob();
    return /^image\/(jpeg|png|webp)$/.test(out.type) && out.size > 0 && out.size <= 15_000_000 ? out : null;
  } catch (error) {
    console.warn("[product-fidelity] photoroom", JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }));
    return null;
  }
}

export interface PrepareDeps {
  locate?: typeof locateProduct;
  cutout?: (blob: Blob) => Promise<Blob | null>;
}

/** Product crop + cutout. Always resolves: the original photo is the fallback. */
export async function prepareProductReference(original: Blob, product: string, deps: PrepareDeps = {}): Promise<PreparedReference> {
  const t0 = Date.now();
  const located = await (deps.locate ?? locateProduct)(original, product, "reference");
  let blob = original, cropped = false;
  // A product already filling the photo needs no crop.
  if (located?.box && located.box.w * located.box.h < 0.6) {
    try {
      const image = await decode(original);
      const box = expandBox(located.box, 0.2);
      const x = Math.floor(box.x * image.width), y = Math.floor(box.y * image.height);
      const w = Math.max(1, Math.round(box.w * image.width)), h = Math.max(1, Math.round(box.h * image.height));
      blob = await toJpeg(image.crop(x, y, Math.min(w, image.width - x), Math.min(h, image.height - y)));
      cropped = true;
    } catch (error) {
      console.warn("[product-fidelity] crop failed", JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }));
    }
  }
  const cut = await (deps.cutout ?? photoroomCutout)(blob);
  console.log("[product-fidelity] reference", JSON.stringify({
    located: !!located?.box, cropped, detoured: !!cut, described: !!located?.description, ms: Date.now() - t0,
  }));
  return {
    blob: cut ?? blob,
    description: located?.description ?? "",
    extraneous: located?.extraneous ?? "",
    cropped,
    detoured: !!cut,
  };
}

/** One sentence appended to an image prompt to pin the product's geometry. */
export function productFidelityLine(ref: Pick<PreparedReference, "description" | "extraneous">): string {
  return [
    ref.description ? `Exact product geometry to reproduce: ${ref.description}` : "",
    ref.extraneous ? `Not part of the product (never add them): ${ref.extraneous}.` : "",
  ].filter(Boolean).join(" ");
}

/** Square crop (pixels) around the product: room for context, clamped to the image. */
export function refineSquare(box: Box, width: number, height: number) {
  const short = Math.min(width, height);
  const side = Math.round(Math.min(short, Math.max(short * 0.3, Math.max(box.w * width, box.h * height) * 2.6)));
  const cx = (box.x + box.w / 2) * width, cy = (box.y + box.h / 2) * height;
  const x = Math.round(Math.min(Math.max(0, cx - side / 2), width - side));
  const y = Math.round(Math.min(Math.max(0, cy - side / 2), height - side));
  return { x, y, side };
}

/** Alpha ramp from the patch edges (0) to `feather` px inside (1), smoothstep. */
export function featherAlpha(distance: number, feather: number) {
  if (distance >= feather) return 1;
  const t = Math.max(0, distance / feather);
  return t * t * (3 - 2 * t);
}

export function refinePrompt(product: string, ref: Pick<PreparedReference, "description" | "extraneous">) {
  return [
    // A saved caption can be wrong (« bague avec perles » for loose grains next to
    // it): once the vision geometry exists, it replaces the caption.
    ref.description
      ? "Image 1 is a close crop of a finished photograph featuring the product shown in Image 2. Image 2 is the exact product reference."
      : `Image 1 is a close crop of a finished photograph featuring this product: ${product}. Image 2 is the exact product reference.`,
    "Redraw ONLY the product in Image 1 so it matches Image 2 exactly: same overall silhouette, number of parts, their shapes, relative sizes and arrangement, material, finish and color. Do not simplify, shrink, add or remove parts.",
    productFidelityLine(ref),
    "Keep the product where it is in Image 1, worn or placed the same way, at a believable real-world size. Adapt its reflections and contact shadows to the light of Image 1, not to the reference photo.",
    "Everything else in Image 1 stays identical: same framing (no zoom, shift or rotation), same skin, fingers, nails, fabric, background, light, colors and grain. Adjust only the pixels touching the product (contacts, occlusions, shadows).",
  ].filter(Boolean).join("\n");
}

export interface RefineRequest {
  /** Full generated image. */
  image: Blob;
  /** Prepared product reference (crop + cutout). */
  reference: Blob;
  product: string;
  ref: Pick<PreparedReference, "description" | "extraneous">;
  /** Generates the square patch from [crop, reference]; null = failed (keep the image). */
  generate: (prompt: string, inputs: Blob[]) => Promise<Blob | null>;
  locate?: typeof locateProduct;
}

export type RefineOutcome =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "not_found" | "already_large" | "generation_failed" | "composite_failed" };

/** Zoomed second pass. Never throws: on any failure the caller keeps its image. */
export async function refineProductRegion(req: RefineRequest): Promise<RefineOutcome> {
  const t0 = Date.now();
  const done = (outcome: RefineOutcome) => {
    console.log("[product-fidelity] refine", JSON.stringify({ ok: outcome.ok, ...(outcome.ok ? {} : { reason: outcome.reason }), ms: Date.now() - t0 }));
    return outcome;
  };
  const located = await (req.locate ?? locateProduct)(req.image, req.product, "result");
  if (!located?.box) return done({ ok: false, reason: "not_found" });
  // Product already dominant in the frame: a zoomed pass would add nothing.
  if (located.box.w > 0.45 && located.box.h > 0.45) return done({ ok: false, reason: "already_large" });
  let base, square;
  try {
    base = await decode(req.image);
    square = refineSquare(located.box, base.width, base.height);
  } catch {
    return done({ ok: false, reason: "composite_failed" });
  }
  const crop = await toJpeg(base.clone().crop(square.x, square.y, square.side, square.side));
  let patchBlob: Blob | null = null;
  try {
    patchBlob = await req.generate(refinePrompt(req.product, req.ref), [crop, req.reference]);
  } catch {
    patchBlob = null;
  }
  if (!patchBlob) return done({ ok: false, reason: "generation_failed" });
  try {
    const patch = await decode(patchBlob);
    patch.resize(square.side, square.side);
    const feather = Math.max(4, Math.round(square.side * 0.1));
    const bitmap = patch.bitmap;
    for (let py = 0; py < square.side; py++) {
      for (let px = 0; px < square.side; px++) {
        const d = Math.min(px, py, square.side - 1 - px, square.side - 1 - py);
        const a = featherAlpha(d, feather);
        if (a < 1) bitmap[(py * square.side + px) * 4 + 3] = Math.round(255 * a);
      }
    }
    base.composite(patch, square.x, square.y);
    return done({ ok: true, blob: await toJpeg(base) });
  } catch {
    return done({ ok: false, reason: "composite_failed" });
  }
}
