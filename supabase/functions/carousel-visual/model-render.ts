// carousel-visual : rendu des slides PAR LE MODÈLE (un appel, ou des lots de
// ~3 slides en parallèle avec rattrapage des slides manquantes). Sorti
// d'index.ts À L'IDENTIQUE le 18/10/2026 (chantier AA) pour lui faire de la
// place sous le cliquet anti-dette ; seul ajout : `onlyIndexes` et
// `extraDirective`, qui servent à « Refaire cette slide » (un lot d'une slide,
// avec la consigne de mise en page de l'utilisatrice).

import { callAnthropic, type AnthropicModel, type UsageSink } from "../_shared/anthropic.ts";
import { type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";

// ═══ Parsing d'une réponse slides (même format pour chaque appel/lot) ═══
export function parseSlidesJson(raw: string): any {
  // Parsing robuste centralisé (fences, extraction, réparations courantes).
  const parsed = tryParseAiJson<any>(raw, "carousel-visual");
  if (parsed !== null) {
    // Cas où l'IA renvoie le tableau nu sans l'enveloppe {"slides_html": [...]}
    return Array.isArray(parsed) ? { slides_html: parsed } : parsed;
  }
  // Dernier recours, spécifique à cette fonction : extraire un tableau
  // d'objets même sans accolade englobante (objet racine tronqué/cassé
  // mais tableau slides_html isolément valide).
  const arrayMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try { return { slides_html: JSON.parse(arrayMatch[0]) }; } catch { /* tombe plus bas */ }
  }
  console.error("Failed to parse carousel-visual response:", raw.slice(0, 500));
  throw new Error("L'IA n'a pas retourné un format valide. Réessaie.");
}

// Lots consécutifs équilibrés (8 → 3+3+2, 10 → 3+3+2+2) d'INDEX de slides.
export function buildChunks(count: number, target: number): number[][] {
  const n = Math.max(1, Math.ceil(count / target));
  const base = Math.floor(count / n);
  let extra = count % n;
  const out: number[][] = [];
  let idx = 0;
  for (let c = 0; c < n; c++) {
    const size = base + (extra-- > 0 ? 1 : 0);
    out.push(Array.from({ length: size }, (_, k) => idx + k));
    idx += size;
  }
  return out;
}
export function chunkDirective(nums: number[]): string {
  return `

═══ RENDU PARTIEL — IMPÉRATIF ═══
Le carrousel COMPLET est fourni ci-dessus pour le contexte (cohérence, transitions, rythme), mais TU NE RENDS QUE les slides ${nums.join(", ")}.
Retourne "slides_html" avec UNIQUEMENT ces slides-là, chacune avec son "slide_number" d'origine. Le bloc "slides_invariants" reste obligatoire.`;
}

export async function runParallelChunkGeneration(params: {
  slides: any[];
  ch: any;
  darkBrand: boolean;
  isPhotoCarousel: boolean;
  isMixCarousel: boolean;
  model: AnthropicModel;
  systemPromptWithAnnotations: string;
  finalUserPrompt: string;
  buildMessagesFor: (userText: string, photoIndexes?: number[]) => any[];
  usage: UsageSink;
  emitStatus: StatusEmitter;
  tStart: number;
  /** « Refaire cette slide » : seules ces slides (index) sont rendues, en un lot. */
  onlyIndexes?: number[];
  /** Ajouté au message de chaque lot (consigne de mise en page de l'utilisatrice). */
  extraDirective?: string;
}): Promise<any> {
  const { slides, ch, darkBrand, isPhotoCarousel, isMixCarousel, model, systemPromptWithAnnotations, finalUserPrompt, buildMessagesFor, usage, emitStatus, tStart, onlyIndexes, extraDirective = "" } = params;
  const CHUNK_TARGET = 3;
  const chunks = onlyIndexes?.length ? [onlyIndexes] : buildChunks(slides.length, CHUNK_TARGET);
  // The full plan is already in finalUserPrompt, for both single and chunked calls.
  const planBlock = "";
  let doneCount = 0;
  emitStatus("visuals", { done: 0, total: chunks.length });

  const runChunk = async (idxs: number[]) => {
    const nums = idxs.map((i) => Number(slides[i]?.slide_number) || i + 1);
    // Photos réellement référencées par ce lot (photo/mix) — évite de
    // renvoyer toutes les photos en vision à chaque appel. Si une slide
    // photo du lot n'a pas de photo_index exploitable, repli sûr : toutes.
    let photoIdx: number[] | undefined;
    if (isPhotoCarousel || isMixCarousel) {
      const referenced = [...new Set(idxs.map((i) => Number(slides[i]?.photo_index)).filter((p) => Number.isInteger(p) && p >= 1))];
      const hasUnresolvedPhotoSlide = idxs.some((i) => {
        const st = String(slides[i]?.slide_type || "");
        const isPhotoSlide = st === "photo_full" || st === "photo_integrated" || (isPhotoCarousel && st !== "text_only");
        return isPhotoSlide && !(Number.isInteger(Number(slides[i]?.photo_index)) && Number(slides[i]?.photo_index) >= 1);
      });
      photoIdx = hasUnresolvedPhotoSlide ? undefined : referenced; // undefined = toutes ; [] = aucune (lot 100% texte)
    }
    const chunkUsage: UsageSink = {};
    const raw = await callAnthropic({
      model,
      system: systemPromptWithAnnotations,
      messages: buildMessagesFor(finalUserPrompt + planBlock + chunkDirective(nums) + extraDirective, photoIdx),
      temperature: 0.5,
      max_tokens: 8192,
      abortTimeoutMs: 120_000,
      // Rendu verbatim : ne pas réécrire les tirets du texte source des slides.
      keepDashes: true,
    }, chunkUsage);
    doneCount++;
    // Clamp : les appels de rattrapage ne doivent pas afficher « 4/3 »
    emitStatus("visuals", { done: Math.min(doneCount, chunks.length), total: chunks.length });
    return { parsed: parseSlidesJson(raw), usage: chunkUsage };
  };

  // Résilience : un lot qui échoue (surcharge Anthropic 529, parse raté…)
  // ne doit PAS tuer les autres — vécu le 06/07 : un 529 transitoire sur un
  // seul lot faisait échouer TOUTE la génération (Promise.all rejette), en
  // silence côté front (pré-génération background). On isole donc chaque
  // lot ; ses slides manquantes partent dans la passe de rattrapage.
  let firstChunkError: unknown = null;
  const settled = await Promise.all(chunks.map((idxs) =>
    runChunk(idxs).catch((e) => {
      console.error("carousel-visual: lot en échec → slides envoyées au rattrapage", e?.message || e);
      if (!firstChunkError) firstChunkError = e;
      return null;
    }),
  ));
  const chunkResults = settled.filter(Boolean) as { parsed: any; usage: UsageSink }[];
  if (chunkResults.length === 0) throw firstChunkError || new Error("Génération des visuels échouée sur tous les lots.");

  let allSlides = chunkResults
    .flatMap((r) => (Array.isArray(r.parsed?.slides_html) ? r.parsed.slides_html : []))
    .filter((s: any) => s && s.html);

  // Réparation : slides manquantes (lot en échec OU lot qui a « oublié »
  // des slides malgré la directive) → appels de rattrapage par lots de ~3,
  // eux aussi isolés. Jamais de carrousel troué tant qu'un lot passe.
  const got = new Set(allSlides.map((s: any) => Number(s?.slide_number)));
  const missing = slides
    .map((s: any, i: number) => Number(s?.slide_number) || i + 1)
    .filter((num: number, i: number) => !got.has(num) && (!onlyIndexes?.length || onlyIndexes.includes(i)));
  if (missing.length > 0) {
    console.warn(`carousel-visual: ${missing.length} slide(s) manquante(s) après rendu parallèle → rattrapage`, missing);
    const missingIdxs = slides
      .map((s: any, i: number) => ({ num: Number(s?.slide_number) || i + 1, i }))
      .filter((x: any) => missing.includes(x.num))
      .map((x: any) => x.i);
    const repairChunks = buildChunks(missingIdxs.length, CHUNK_TARGET)
      .map((positions) => positions.map((p) => missingIdxs[p]));
    const repairs = (await Promise.all(repairChunks.map((idxs) =>
      runChunk(idxs).catch((e) => {
        console.error("carousel-visual: rattrapage en échec", e?.message || e);
        return null;
      }),
    ))).filter(Boolean) as { parsed: any; usage: UsageSink }[];
    for (const repair of repairs) {
      if (Array.isArray(repair.parsed?.slides_html)) {
        allSlides = allSlides.concat(repair.parsed.slides_html.filter((s: any) => s && s.html && !got.has(Number(s.slide_number))));
        repair.parsed.slides_html.forEach((s: any) => got.add(Number(s?.slide_number)));
      }
      chunkResults.push(repair);
    }
  }

  allSlides.sort((a: any, b: any) => (Number(a?.slide_number) || 0) - (Number(b?.slide_number) || 0));

  // Invariants : palette/typo/motif identiques d'un lot à l'autre (mêmes
  // invariants serveur dans le prompt) → on prend le premier bloc retourné
  // et on agrège les layouts_used de tous les lots (1 entrée par slide).
  const firstInv = chunkResults.map((r) => r.parsed?.slides_invariants).find(Boolean);
  const layoutsUsed = chunkResults.flatMap((r) =>
    Array.isArray(r.parsed?.slides_invariants?.layouts_used) ? r.parsed.slides_invariants.layouts_used : [],
  );
  const result = {
    slides_html: allSlides,
    ...(firstInv ? { slides_invariants: { ...firstInv, layouts_used: layoutsUsed.length ? layoutsUsed : (firstInv.layouts_used || []) } } : {}),
  };

  usage.input_tokens = chunkResults.reduce((s, r) => s + (r.usage.input_tokens || 0), 0);
  usage.output_tokens = chunkResults.reduce((s, r) => s + (r.usage.output_tokens || 0), 0);
  usage.total_tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
  usage.model = chunkResults[0]?.usage.model;

  console.log(JSON.stringify({
    type: "carousel_visual_timing",
    mode: "parallel",
    chunks: chunks.length,
    slides: slides.length,
    duration_ms: Date.now() - tStart,
  }));
  return result;
}

export async function runSingleCallGeneration(params: {
  slides: any[];
  model: AnthropicModel;
  systemPromptWithAnnotations: string;
  finalUserPrompt: string;
  buildMessagesFor: (userText: string, photoIndexes?: number[]) => any[];
  usage: UsageSink;
  emitStatus: StatusEmitter;
  tStart: number;
}): Promise<any> {
  const { slides, model, systemPromptWithAnnotations, finalUserPrompt, buildMessagesFor, usage, emitStatus, tStart } = params;
  emitStatus("visuals", { done: 0, total: 1 });
  const rawResponse = await callAnthropic({
    model,
    system: systemPromptWithAnnotations,
    messages: buildMessagesFor(finalUserPrompt),
    temperature: 0.5,
    max_tokens: 16384,
    abortTimeoutMs: 120_000,
    // Rendu verbatim : ne pas réécrire les tirets du texte source des slides.
    keepDashes: true,
  }, usage);
  const result = parseSlidesJson(rawResponse);
  emitStatus("visuals", { done: 1, total: 1 });

  console.log(JSON.stringify({
    type: "carousel_visual_timing",
    mode: "single",
    slides: slides.length,
    duration_ms: Date.now() - tStart,
  }));
  return result;
}
