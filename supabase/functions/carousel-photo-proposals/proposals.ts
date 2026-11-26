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
 *    Une slide restée sans photo a droit à UN deuxième essai, avec une requête
 *    différente et plus simple ; si cette requête de secours manque ou est
 *    refusée elle aussi, une requête neutre toute faite prend sa place ;
 * 3. sinon rien : la slide reste « Image à choisir », avec une vraie description
 *    de l'image idéale (`ideal`) à la place du texte de la slide recopié.
 *
 * Le serveur ne fait que proposer : l'écran télécharge et pose les photos.
 * Tout échec laisse le carrousel tel quel.
 */
export const PHOTO_PROPOSALS_VERSION = "photo-proposals-v4";
export const MAX_TARGETS = 10;
const PLAN_CALL_MS = 20_000;
const VERIFY_CALL_MS = 30_000;
const RETRY_LATEST_START_MS = 35_000;
const THIRD_LATEST_START_MS = 55_000;

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

const RETRY_RULES = `${QUERY_RULES}

Ces slides n'ont trouvé AUCUNE photo acceptable au premier essai (failed_query = la requête qui n'a rien donné, null si elle a été refusée parce qu'elle nommait un produit, un commerce ou une personne). Écris pour chacune une requête DIFFÉRENTE, plus simple et plus générale : 2 ou 3 mots, une matière, une lumière, un lieu vide ou un objet neutre du quotidien, toujours accordée au passage. Ne reprends aucun mot de la requête qui a échoué.`;

const retryTool = (slides: number[]) => ({
  name: "requetes_de_secours",
  description: "Une nouvelle requête Pexels par slide restée sans photo.",
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

/** Lecture stricte : slide hors liste ou en double ignorée, requête déjà essayée ou interdite écartée. */
export function parseRetryQueries(raw: string, slides: number[], alreadyTried: Set<string>): Map<number, string> {
  const out = new Map<number, string>();
  const list = JSON.parse(raw)?.queries;
  if (!Array.isArray(list)) return out;
  const tried = new Set([...alreadyTried].map((q) => q.toLowerCase()));
  for (const q of list) {
    const query = typeof q?.query === "string" ? q.query.trim().replace(/\s+/g, " ") : "";
    if (!slides.includes(q?.slide) || out.has(q.slide)) continue;
    if (query.length < 3 || query.length > 60 || !acceptableAlt(query) || tried.has(query.toLowerCase())) continue;
    out.set(q.slide, query);
  }
  return out;
}

export interface Plan { ideal: string | null; library: number | null; query: string | null; refused?: string }

/**
 * Requêtes neutres, sans IA (26/11/2026). Sur un essai réel, une slide est restée
 * « Image à choisir » sans aucune recherche : sa requête avait été écartée au
 * premier essai, puis de nouveau au deuxième, et rien ne prenait le relais.
 * Aucune ne nomme une personne, un produit ou un commerce (testé).
 */
export const NEUTRAL_QUERIES = [
  "soft morning light linen", "empty wooden table", "plaster wall soft light", "sunlight through curtain",
  "stone surface texture", "calm water surface", "green leaves soft light", "paper texture warm light",
  "dried flowers neutral background", "sand texture natural light",
];

/** Une requête neutre par slide, jamais une requête déjà essayée, jamais deux fois la même. */
export function neutralQueries(slides: number[], alreadyTried: Iterable<string>): Map<number, string> {
  const tried = new Set([...alreadyTried].map((q) => q.toLowerCase()));
  const out = new Map<number, string>();
  for (const slide of slides) {
    const start = Math.abs(slide) % NEUTRAL_QUERIES.length;
    const pick = NEUTRAL_QUERIES.map((_, i) => NEUTRAL_QUERIES[(start + i) % NEUTRAL_QUERIES.length]).find((q) => !tried.has(q));
    if (!pick) continue;
    out.set(slide, pick);
    tried.add(pick);
  }
  return out;
}

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
    // Une requête qui nomme une personne ou un produit trahit la consigne : pas de recherche.
    const accepted = query.length >= 3 && query.length <= 60 && acceptableAlt(query);
    out.set(p.slide, {
      ideal: ideal.length >= 8 ? ideal : null,
      library,
      query: accepted ? query : null,
      ...(!accepted && query ? { refused: query.slice(0, 80) } : {}),
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

  // Slides sans photo de bibliothèque : une photo libre de droit, en deux essais au plus.
  const needStock = targets.filter((t) => plans.get(t)?.library == null);
  if (!needStock.length) return finish("completed", proposals);
  if (!apiKey) return finish("partial", proposals, { reason: "no-pexels-key" });
  const taken = new Set<string>();
  const byslide = new Map(proposals.map((p) => [p.slide, p]));
  /** Un essai : recherche Pexels, vérification sur les pixels, pose sur les slides servies. */
  const round = async (queries: Map<number, string>) => {
    const asked = [...queries.keys()];
    if (!asked.length) return;
    const results = new Map<string, StockAmbientPhoto[]>();
    await Promise.all([...new Set(queries.values())].map(async (q) => {
      try {
        results.set(q, (await searchPexels(q, apiKey, fetchImpl)).filter((p) => !taken.has(p.id)));
      } catch (e) { log(`[photo-proposals] pexels ${q}: ${(e as Error).message}`); }
    }));
    const candidates = distributeCandidates(asked, queries, results);
    if (!candidates.size) return;
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
    for (const pick of chosen.values()) taken.add(pick.id);
    for (const [slide, pick] of chosen) {
      const p = byslide.get(slide)!;
      p.stock = pick;
      p.alternates = (candidates.get(slide) || []).filter((c) => c.id !== pick.id && clean.has(c.id) && !taken.has(c.id));
      for (const alt of p.alternates) taken.add(alt.id);
    }
  };
  const first = new Map(needStock.filter((t) => plans.get(t)?.query).map((t) => [t, plans.get(t)!.query!]));
  const second = new Map<number, string>();
  const third = new Map<number, string>();
  const neutral: number[] = [];
  // Ce que le reçu garde pour comprendre une slide restée vide : requêtes écartées, requêtes neutres.
  const trace = () => ({
    queries: Object.fromEntries(first), retry_queries: Object.fromEntries(second), third_queries: Object.fromEntries(third),
    refused_queries: Object.fromEntries(needStock.filter((t) => plans.get(t)?.refused).map((t) => [t, plans.get(t)!.refused])),
    neutral,
  });
  try {
    await round(first);
    // Deuxième essai (26/11/2026) : les slides restées sans photo (requête refusée, aucun
    // candidat, rien d'accepté) repartent avec une requête différente, plus simple.
    // Pas de deuxième essai si le premier a déjà traîné : l'écran n'attend que 90 s.
    const missing = Date.now() - t0 > RETRY_LATEST_START_MS ? [] : needStock.filter((t) => !byslide.get(t)!.stock);
    if (missing.length) {
      const rSink: UsageSink = {};
      try {
        const rawRetry = await call({
          model: HAIKU_MODEL, system: RETRY_RULES, max_tokens: 800, maxRetries: 0, abortTimeoutMs: PLAN_CALL_MS,
          tool: retryTool(missing),
          messages: [{ role: "user", content: JSON.stringify({
            subject: String(input.subject || "").slice(0, 400), brand, carousel: input.slides,
            slides_to_illustrate: missing.map((t) => ({ slide: t, failed_query: first.get(t) ?? null })),
          }) }],
        }, rSink);
        for (const [slide, query] of parseRetryQueries(rawRetry, missing, new Set(first.values()))) second.set(slide, query);
      } catch (e) { log(`[photo-proposals] retry queries: ${(e as Error).message}`); }
      addUsage(deps.usage, rSink);
      // Requête de secours absente ou refusée elle aussi : une requête neutre, plutôt que rien.
      for (const [slide, query] of neutralQueries(missing.filter((t) => !second.has(t)), [...first.values(), ...second.values()])) {
        second.set(slide, query);
        neutral.push(slide);
      }
      await round(second);
      // Troisième essai (26/11/2026, choix de Laetitia : une image partout, quitte à ce qu'elle
      // soit neutre) : deux vraies recherches dont le contrôle a refusé toutes les photos
      // (vu sur une slide « huile » : que des bouteilles). Une requête neutre, une seule fois.
      const stillMissing = Date.now() - t0 > THIRD_LATEST_START_MS
        ? [] : missing.filter((t) => !byslide.get(t)!.stock && !neutral.includes(t));
      for (const [slide, query] of neutralQueries(stillMissing, [...first.values(), ...second.values()])) third.set(slide, query);
      neutral.push(...third.keys());
      await round(third);
    }
  } catch (e) {
    return finish("partial", proposals, {
      reason: "error", error: String((e as Error)?.message || e).slice(0, 160), ...trace(),
    });
  }
  const served = needStock.filter((t) => byslide.get(t)!.stock).length;
  return finish(served === needStock.length ? "completed" : "partial", proposals, {
    ...trace(),
    retried: [...new Set([...second.keys(), ...third.keys()])].filter((t) => byslide.get(t)!.stock),
  });
}
