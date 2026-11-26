import { callAnthropic, SONNET_MODEL, type UsageSink, HAIKU_MODEL } from "../_shared/anthropic.ts";
import {
  acceptableAlt, distributeCandidates, parseChoices, QUERY_RULES, searchPexels, VERIFY_RULES, verifyTool,
  type StockAmbientPhoto,
} from "../_shared/stock-photo-verified.ts";
export { acceptableAlt, distributeCandidates, parseChoices, QUERY_RULES, searchPexels, VERIFY_RULES, verifyTool };
export type { StockAmbientPhoto };

/**
 * Photos d'ambiance libres de droit (Pexels) pour un carrousel « Tes photos en
 * fond » (12/10/2026, choix de Laetitia). Quand aucune photo de l'utilisatrice
 * ne montre un passage, l'association finale reposait une de ses photos en
 * ambiance (`ambient_fallback`) : avec 3 photos pour 10 slides, la même photo
 * revenait 3 ou 4 fois. Ces slides reçoivent désormais une photo d'ambiance
 * SANS personne ni produit (matières, lumière, lieux), vérifiée sur ses pixels.
 *
 * - La couverture garde toujours une photo de l'utilisatrice.
 * - Le serveur ne fait que proposer (`stock_ambient` sur la slide) : la photo de
 *   l'utilisatrice reste dans `photo_index`, l'écran télécharge la photo libre
 *   de droit et ne la pose que si le téléchargement réussit.
 * - Tout échec (clé absente, Pexels, vérification, délai) laisse le carrousel
 *   tel quel : jamais de photo non vérifiée.
 */
export const STOCK_AMBIENT_VERSION = "stock-ambient-v2";
/** Photos qu'un carrousel peut porter (l'écran et l'association en lisent 10). */
export const MAX_CAROUSEL_PHOTOS = 10;
/** Au-delà, l'étape est sautée : le carrousel doit finir sous ~285 s. */
export const STOCK_AMBIENT_LATEST_START_MS = 230_000;
const QUERY_CALL_MS = 15_000;
const VERIFY_CALL_MS = 25_000;

type Options = {
  body: any;
  startedAt: number;
  usage: UsageSink;
  brandingContext?: string;
  call?: typeof callAnthropic;
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
  now?: () => number;
  logger?: (m: string) => void;
};

const isPhotoSlide = (s: any) => ["photo_full", "photo_integrated"].includes(s?.slide_type);
const passageOf = (s: any) =>
  [s?.overlay_text, s?.title, s?.body].filter((v) => typeof v === "string" && v.trim()).join("\n").slice(0, 600);

/** Slides qui recevront une photo d'ambiance : en ambiance, hors couverture, dans la limite des photos. */
export function stockAmbientTargets(doc: any, body: any): number[] {
  if (body?.carousel_type !== "photo" || body?.photos_only || body?.no_overlay) return [];
  if (!Array.isArray(doc?.slides)) return [];
  const own = (body.photos || []).slice(0, MAX_CAROUSEL_PHOTOS).filter((p: any) => p?.base64).length;
  const room = Math.max(0, MAX_CAROUSEL_PHOTOS - own);
  return doc.slides
    .map((s: any, i: number) => (i > 0 && isPhotoSlide(s) && s?.photo_match?.status === "ambient_fallback" ? i + 1 : 0))
    .filter(Boolean)
    .slice(0, room);
}

const queryTool = (slides: number[]) => ({
  name: "requetes_ambiance",
  description: "Une requête Pexels par slide demandée.",
  input_schema: {
    type: "object", required: ["queries"], properties: { queries: {
      type: "array", minItems: slides.length, maxItems: slides.length, items: {
        type: "object", required: ["slide", "query"], properties: {
          slide: { type: "integer", enum: slides }, query: { type: "string", maxLength: 60 },
        },
      },
    } },
  },
});

/** Lecture stricte : une slide manquante, en double ou hors liste n'a pas de requête. */
export function parseQueries(raw: string, slides: number[]): Map<number, string> {
  const out = new Map<number, string>();
  const list = JSON.parse(raw)?.queries;
  if (!Array.isArray(list)) return out;
  for (const q of list) {
    const query = typeof q?.query === "string" ? q.query.trim().replace(/\s+/g, " ") : "";
    if (!slides.includes(q?.slide) || out.has(q.slide) || query.length < 3 || query.length > 60) continue;
    // Une requête qui nomme une personne trahit la consigne : la slide reste sans requête.
    if (!acceptableAlt(query)) continue;
    out.set(q.slide, query);
  }
  return out;
}

function withReceipt(doc: any, receipt: Record<string, unknown>) {
  return { ...doc, photo_review: { ...(doc.photo_review || {}), stock_ambient: { version: STOCK_AMBIENT_VERSION, ...receipt } } };
}

export async function addStockAmbientPhotos(doc: any, options: Options): Promise<any> {
  const now = options.now || Date.now;
  const log = options.logger || ((m: string) => console.log(m));
  const targets = stockAmbientTargets(doc, options.body);
  if (!targets.length) return doc;
  const apiKey = options.apiKey === undefined ? Deno.env.get("PEXELS_API_KEY") : options.apiKey;
  const t0 = now();
  const done = (status: string, extra: Record<string, unknown> = {}) => {
    const receipt = { status, requested: targets, elapsed_ms: now() - t0, ...extra };
    log(JSON.stringify({ event: "carousel_stock_ambient", ...receipt }));
    return receipt;
  };
  if (!apiKey) return withReceipt(doc, done("skipped", { reason: "no-pexels-key" }));
  if (now() - options.startedAt > STOCK_AMBIENT_LATEST_START_MS) return withReceipt(doc, done("skipped", { reason: "time-budget" }));
  const call = options.call || callAnthropic;
  const fetchImpl = options.fetchImpl || fetch;
  const passages = doc.slides.map((s: any, i: number) => ({ slide: i + 1, text: passageOf(s) }));
  try {
    const qSink: UsageSink = {};
    const rawQueries = await call({
      model: HAIKU_MODEL, system: QUERY_RULES, max_tokens: 800, maxRetries: 0, abortTimeoutMs: QUERY_CALL_MS,
      tool: queryTool(targets),
      messages: [{ role: "user", content: JSON.stringify({
        subject: String(options.body?.subject || "").slice(0, 400),
        brand: String(options.brandingContext || "").slice(0, 1200),
        carousel: passages,
        slides_to_illustrate: targets,
      }) }],
    }, qSink);
    addUsage(options.usage, qSink);
    const queries = parseQueries(rawQueries, targets);
    if (!queries.size) return withReceipt(doc, done("unavailable", { reason: "no-queries" }));

    const unique = [...new Set(queries.values())];
    const results = new Map<string, StockAmbientPhoto[]>();
    await Promise.all(unique.map(async (q) => {
      try { results.set(q, await searchPexels(q, apiKey, fetchImpl)); } catch (e) { log(`[stock-ambient] pexels ${q}: ${(e as Error).message}`); }
    }));
    const candidates = distributeCandidates(targets, queries, results);
    if (!candidates.size) return withReceipt(doc, done("unavailable", { reason: "no-candidates", queries: Object.fromEntries(queries) }));

    const slides = [...candidates.keys()];
    const ids = [...candidates.values()].flat().map((p) => p.id);
    const content: any[] = [{ type: "text", text: JSON.stringify({
      brand: String(options.brandingContext || "").slice(0, 1200), carousel: passages, slides_to_check: slides,
    }) }];
    for (const [slide, pool] of candidates) {
      content.push({ type: "text", text: `SLIDE ${slide} — candidates :` });
      for (const p of pool) content.push({ type: "text", text: `PHOTO ${p.id}` }, { type: "image", source: { type: "url", url: p.thumbnail } });
    }
    const vSink: UsageSink = {};
    const rawChoices = await call({
      model: SONNET_MODEL, system: VERIFY_RULES, max_tokens: 2500, maxRetries: 0, abortTimeoutMs: VERIFY_CALL_MS,
      tool: verifyTool(slides, ids), messages: [{ role: "user", content }],
    }, vSink);
    addUsage(options.usage, vSink);
    const chosen = parseChoices(rawChoices, candidates);
    const out = {
      ...doc,
      slides: doc.slides.map((s: any, i: number) => chosen.has(i + 1) ? { ...s, stock_ambient: chosen.get(i + 1) } : s),
    };
    const receipt = done(chosen.size ? "completed" : "unavailable", {
      ...(chosen.size ? {} : { reason: "none-accepted" }),
      slides: [...chosen.keys()], queries: Object.fromEntries(queries),
    });
    return withReceipt(out, receipt);
  } catch (e) {
    return withReceipt(doc, done("unavailable", { reason: "error", error: String((e as Error)?.message || e).slice(0, 160) }));
  }
}

function addUsage(target: UsageSink, sink: UsageSink) {
  for (const key of ["input_tokens", "output_tokens", "total_tokens"] as const) target[key] = (target[key] || 0) + (sink[key] || 0);
}
