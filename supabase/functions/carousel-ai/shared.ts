// carousel-ai : socle commun à tous les parcours (fiche 2, lot 1 de
// docs/robustesse/gros-fichiers.md ; code déplacé à l'identique depuis index.ts).
// `_deps` vit ici pour que les parcours l'importent sans passer par index.ts
// (sinon boucle d'imports) ; index.ts le réexporte : c'est le même objet, les
// tests peuvent toujours remplacer `_deps.callAnthropic`.
// Ce fichier n'importe aucun mode ni aucune étape (boundaries_test.ts).

import { runPipeline } from "../_shared/request-pipeline.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, type AnthropicModel, SONNET_MODEL, type UsageSink, HAIKU_MODEL } from "../_shared/anthropic.ts";
import { callCarouselWriter, pickCarouselWriter } from "./writer.ts";
import { reviewCarouselProgression } from "../_shared/carousel-progression.ts";
import { createContinuousNarrative } from "./continuous-narrative.ts";
import { fetchRecentContentTexts } from "../_shared/recent-passages.ts";
import { matchFinalPhotos } from "./final-photo-match.ts";
import { addStockAmbientPhotos } from "./stock-ambient.ts";
import { fetchDepthMaterial, type ResearchLink } from "../_shared/depth-research.ts";
import { applyAudienceAddressPass } from "../_shared/audience-address-pass.ts";
import { logCarouselPlan } from "../_shared/content-quality.ts";
import { type StatusEmitter } from "../_shared/anthropic-stream.ts";
import { draftSlidesTracker } from "../_shared/carousel-draft-stream.ts";
import { extractImagePayload } from "../_shared/image-utils.ts";
import { carouselLength } from "../_shared/carousel-length.ts";
import { countCarouselSlides } from "../_shared/photo-slide-structure.ts";
import { tryParseAiJson } from "../_shared/parse-ai-json.ts";
import { type AudienceAddress } from "../_shared/audience-address.ts";
import { type CaptionEndingRule, type EchoContext } from "../_shared/redac-gate.ts";
import { redesignSlide } from "./layout.ts";

// ── Seam d'injection de dépendances (tests) ──
// Indirection pure : en prod, ces champs pointent vers les imports ci-dessus
// et le comportement est identique en tout point. Les tests (index_test.ts)
// remplacent un ou plusieurs de ces champs pour observer/court-circuiter les
// appels réseau (Supabase, Anthropic) sans toucher à la logique métier.
export const _deps = {
  runPipeline,
  checkQuota,
  logUsage,
  callAnthropic,
  callCarouselWriter,
  reviewThread: reviewCarouselProgression,
  prepareNarrative: createContinuousNarrative,
  fetchRecentTexts: fetchRecentContentTexts,
  matchPhotos: matchFinalPhotos,
  stockAmbient: addStockAmbientPhotos,
  fetchDepthMaterial,
  audienceAddressPass: applyAudienceAddressPass,
  logPlan: logCarouselPlan,
  // « Refaire cette slide » : dessin par carousel-visual (appel réseau).
  redesignSlide,
};

/** Durées par étape (ms) des carrousels photo et mixte, comme le carrousel texte. */
export function stageTimer(startedAt: number) {
  const timings: Record<string, number> = { prep_ms: Date.now() - startedAt };
  const timed = async <T>(key: string, work: Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try { return await work; } finally { timings[key] = (timings[key] || 0) + Date.now() - t0; }
  };
  const done = (label: string) => {
    timings.total_ms = Date.now() - startedAt;
    console.log(JSON.stringify({ type: "carousel_timings", label, ...timings }));
    return timings;
  };
  return { timings, timed, done };
}

/**
 * Brouillon de la 1re rédaction seulement (une relance « trop court » ou une
 * réparation arrive après et ne doit pas remplacer ce qui est lu à l'écran).
 */
export function firstDraftStream(emitStatus: StatusEmitter): () => { onText?: (text: string) => void } {
  let first = true;
  return () => {
    if (!first) return {};
    first = false;
    return { onText: draftSlidesTracker((slides) => emitStatus("draft", { slides })) };
  };
}

// Rédaction uniquement : Opus 5.5 normal / Astra medium en Qualité Max.
// Les suggestions, questions, corrections et visuels gardent leurs modèles.
export const pickCarouselModel = pickCarouselWriter;

// Modèle de la PASSE DE CORRECTION anti-patterns IA. La correction est une
// édition mécanique à règles fermées : en qualité normale, Haiku la tient et
// réduit la latence perçue de la phase texte (les 2 appels étant séquentiels).
// En Mode qualité Max on garde Sonnet, cohérent avec la promesse du toggle.
export function pickCorrectionModel(body: any): AnthropicModel {
  return body?.quality_max ? SONNET_MODEL : HAIKU_MODEL;
}

// ── Helpers contexte par photo ──
// L'ordre des photos correspond à l'ordre d'envoi côté front (post-reorder UX).
// `context` (max 200 chars, validé Zod) provient du champ optionnel par photo dans PhotoUploadZone.
export function buildPhotoContextRecap(photos: Array<{ context?: string; libraryContext?: string }> | undefined): string {
  if (!photos?.length) return "";
  const lines = photos.map((p, i) => [
    p.context?.trim() ? `Photo ${i + 1} — contexte fourni par la personne : ${p.context.trim()}` : "",
    p.libraryContext?.trim() ? `Photo ${i + 1} — indications de bibliothèque, potentiellement déduites : ${p.libraryContext.trim()}` : "",
  ].filter(Boolean).join("\n")).filter(Boolean);
  return lines.length ? `\nCONTEXTE PAR PHOTO :\n${lines.join("\n")}\nLes indications de bibliothèque aident à reconnaître l'image ; elles ne prouvent ni origine, fabrication, identité, chronologie, résultat ni vécu. Le contexte explicite de la personne prime.\n` : "";
}

export function pushPhotoWithContext(messageContent: any[], photo: { base64: string; context?: string; mimeType?: string }, index: number) {
  if (!photo.base64) return;
  const ctx = photo.context?.trim();
  if (ctx) {
    messageContent.push({ type: "text", text: `Photo ${index + 1} — contexte fourni par l'utilisatrice : "${ctx}"` });
  }
  const { media_type, data } = extractImagePayload(photo.base64, photo.mimeType);
  messageContent.push({
    type: "image",
    source: { type: "base64", media_type, data },
  });
}

// ── Budget temps des passes de correction/gate (audit timeouts 17/08) ──
// applyCorrectionPassCarousel tournait SANS limite, y compris via runRedacGate
// (2e passe conditionnelle) : un fetch qui traîne sur CETTE étape légère
// (Haiku, 4096 tokens) pendait indéfiniment. 60s aligné "génération standard"
// (CLAUDE.md), même convention que audit-instagram-ai (#861).
export const CORRECTION_ABORT_MS = 60_000;

// ── Budget temps GLOBAL de la requête (mesure live 30/09) ──
// Un carrousel texte prenait ~190 s (rédaction + juge ~95 s, puis deux relectures
// ~40 s chacune) et chaque étape facultative a son propre plafond (réparation
// 120 s, juge 30 s par tentative, relecture 60 s). Empilés un jour d'API lente,
// ils dépassent la coupure de la plateforme (~400 s), qui perd TOUT le
// carrousel. Passé ces seuils l'étape facultative n'est plus lancée : on livre
// ce qui est écrit (défauts de fil signalés en avertissement, comme en vision).
// Jamais atteints en conditions normales (réparation décidée vers 100-115 s).
export const REPAIR_START_LIMIT_MS = 150_000;

export const REVIEW_START_LIMIT_MS = 270_000;

// Délai de la RÉDACTION texte (04/10/2026) : 3 générations sur 8 coupées à
// 120 s fixes (« La rédaction a dépassé le délai prévu »), alors qu'Opus 5.5 en
// réflexion adaptative écrit un carrousel long en 100-150 s et que la recherche
// « creuser le sujet » (≤ 25 s) passe avant. La rédaction a donc jusqu'à 240 s
// après le début de la requête (jamais moins de 120 s) : au-delà, les relectures
// (≤ 270 s), le juge (270 s) et les schémas (330 s) se coupent d'eux-mêmes et la
// réponse part avant la coupure de la plateforme (~400 s) et du client (400 s).
// Plus de temps pour écrire, jamais de texte raccourci.
export const WRITE_DEADLINE_MS = 240_000;

export const WRITE_MIN_TIMEOUT_MS = 120_000;

export const writerTimeoutMs = (startedAt: number, now = Date.now()): number =>
  Math.max(WRITE_MIN_TIMEOUT_MS, WRITE_DEADLINE_MS - (now - startedAt));

export const reviewAllowed = (startedAt: number): boolean => {
  const ok = Date.now() - startedAt <= REVIEW_START_LIMIT_MS;
  if (!ok) console.log(JSON.stringify({ type: "carousel_time_budget", skipped: "review", elapsed_ms: Date.now() - startedAt }));
  return ok;
};

// ── Plancher déterministe de slides (audit carrousel photo 12/07) ──
// Structure confirmée → on attend EXACTEMENT sa longueur ; sinon min(4, cible).
export function carouselSlideFloor(body: any, defaultTarget: number): number {
  if (Array.isArray(body.confirmed_structure) && body.confirmed_structure.length > 0) {
    return body.confirmed_structure.length;
  }
  return Math.min(4, carouselLength(body).exact || defaultTarget);
}

// UN retry quand le modèle livre un carrousel écrasé (entre 1 slide et le plancher).
// 0 slide n'est PAS retryé : c'est le territoire de carouselMismatchResponse (refus
// photo_mismatch légitime — re-générer re-refuserait en payant un appel de plus).
// Les tokens du retry s'AJOUTENT au sink principal (Object.assign écraserait).
export async function retryIfTooShort(
  content: string,
  doGenerate: (sink: UsageSink) => Promise<string>,
  usage: UsageSink,
  floor: number,
  label: string,
): Promise<string> {
  const got = countCarouselSlides(content);
  if (got === 0 || got >= floor) return content;
  console.warn(`[carousel-ai] ${label}: ${got} slide(s) < plancher ${floor} → retry unique`);
  const retrySink: UsageSink = {};
  try {
    const retried = await doGenerate(retrySink);
    usage.input_tokens = (usage.input_tokens || 0) + (retrySink.input_tokens || 0);
    usage.output_tokens = (usage.output_tokens || 0) + (retrySink.output_tokens || 0);
    usage.total_tokens = (usage.total_tokens || 0) + (retrySink.total_tokens || 0);
    const retriedCount = countCarouselSlides(retried);
    console.log(`[carousel-ai] ${label}: retry → ${retriedCount} slide(s)`);
    // On garde le meilleur des deux runs — jamais pire qu'avant.
    return retriedCount > got ? retried : content;
  } catch (e) {
    console.error(`[carousel-ai] ${label}: retry plancher échoué, contenu court conservé`, e);
    return content;
  }
}

// Refus structuré commun aux chemins mix et photo : à appeler AVANT correction,
// post-traitements et logUsage. Si le tool forcé a renvoyé photo_mismatch (ou un
// carrousel vide), rien n'est livré → on ne débite RIEN et on remonte une erreur
// actionnable (changer de photo ou passer en texte design) à la place du
// générique « réessaie » — qui, ici, redonnerait le même refus.
// Retourne null si un carrousel a bien été livré.
export function carouselMismatchResponse(
  content: string,
  body: any,
  usage: UsageSink,
  label: string,
  corsHeaders: Record<string, string>,
): Response | null {
  const parsed: any = tryParseAiJson(content, "carousel-ai:mismatch-check"); // théoriquement impossible d'échouer : tool forcé
  const hasSlides = Array.isArray(parsed?.slides) && parsed.slides.length > 0;
  if (hasSlides) return null;
  const mismatchReason = typeof parsed?.photo_mismatch?.reason === "string"
    ? parsed.photo_mismatch.reason.trim()
    : "";
  const plural = (body.photos?.length || 0) > 1;
  const message = mismatchReason
    ? `${plural ? "Tes photos ne semblent pas correspondre" : "Ta photo ne semble pas correspondre"} à ton idée : ${mismatchReason}${/[.!?…]$/.test(mismatchReason) ? "" : "."} Change de photo${plural ? "s" : ""} ou passe en carrousel « Texte design » pour garder ton idée telle quelle. Aucun crédit n'a été décompté.`
    : "L'IA a renvoyé un carrousel vide. Réessaie — aucun crédit n'a été décompté.";
  console.warn(`[carousel-ai] ${label}: ${mismatchReason ? "photo_mismatch" : "carrousel vide"} — ${usage.total_tokens ?? "?"} tokens (${usage.model ?? "?"}) NON débités${mismatchReason ? ` — ${mismatchReason}` : ""}`);
  return new Response(JSON.stringify({
    error: mismatchReason ? "photo_mismatch" : "empty_carousel",
    message,
  }), {
    // 200 volontaire : l'erreur structurée doit passer par l'event SSE
    // `done` (runWithHeartbeatSSE) pour que le front lise error+message.
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Le plan peut proposer ces deux positions malgré l'enum du tool. Les
// gabarits actuels les rendent déjà centrées, en conservant haut/bas.
// Normaliser à la sortie ET à la reprise d'un ancien plan évite un rejet
// avant écriture, sans modifier ses textes, son ordre ou ses photos.
/** Type de slide écrit par le modèle de structure : il répond parfois « text »
 * ou « photo » au lieu des valeurs attendues (vu en live le 04/10/2026 : la
 * génération photo échouait sur « Données invalides : slide_type … 'text' »).
 * Variante reconnue → valeur attendue ; inconnue → undefined (champ facultatif). */
export function normalizeSlideType(v: unknown): "photo_full" | "photo_integrated" | "text_only" | undefined {
  const t = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["photo_full", "photo_integrated", "text_only"].includes(t)) return t as any;
  if (["text", "texte", "textonly", "text_slide", "texte_seul"].includes(t)) return "text_only";
  if (["photo", "full_photo", "photo_plein_ecran", "fullphoto"].includes(t)) return "photo_full";
  if (["integrated", "photo_integree", "integrated_photo"].includes(t)) return "photo_integrated";
  return undefined;
}

/** Champs obligatoires d'une slide de confirmed_structure : un null y reste refusé. */
export const PLAN_REQUIRED_FIELDS = new Set(["slide_number", "role", "title_suggestion", "strategic_note"]);

export function normalizeGeneratedPlanFields(slide: any): void {
  if (!slide || typeof slide !== "object") return;
  // Les champs optionnels non renseignés reviennent parfois à null depuis
  // le modèle, notamment photo_index pour une slide sans photo. Le front
  // renvoie le plan tel quel : null et absence ont ici le même sens.
  // Ne jamais toucher aux champs obligatoires ou à une valeur renseignée.
  // 09/10/2026 : une liste écrite à la main avait oublié les champs ajoutés
  // ensuite (image_role, contribution…) → « Données invalides :
  // confirmed_structure.1.image_role: Expected string, received null » avant
  // toute rédaction. Tout champ facultatif à null est donc retiré.
  for (const key of Object.keys(slide)) {
    if (slide[key] === null && !PLAN_REQUIRED_FIELDS.has(key)) delete slide[key];
  }
  if ("slide_type" in slide) {
    const t = normalizeSlideType(slide.slide_type);
    if (t) slide.slide_type = t; else delete slide.slide_type;
  }
  if (slide.overlay_position === "top_right") slide.overlay_position = "top_center";
  if (slide.overlay_position === "bottom_right") slide.overlay_position = "bottom_center";
}

// ── Handlers par type de requête ──
// Le handler serve() ci-dessus ne fait que le setup partagé (quota, contexte
// utilisatrice, systemPrompt, gates) puis aiguille vers une de ces fonctions
// selon `body.type`. Chaque fonction correspond exactement à une ancienne
// branche du if/else — extraction mécanique, aucun changement de comportement.

export interface CarouselRequestContext {
  body: any;
  currentAuthoredText: string;
  currentBrief: string;
  semanticReviewEnabled: boolean;
  userId: string;
  workspaceId: any;
  category: string;
  isLinkedIn: boolean;
  systemPrompt: string;
  brandingContext: string;
  gateInputText: string;
  /** Matière de recherche (incluse dans gateInputText) : ses chiffres seuls exigent leur source. */
  researchText?: string;
  /** Pages web d'où viennent les faits gardés de la recherche (juge, pistes de relecture). */
  researchLinks?: ResearchLink[];
  /** Cas personnel fourni : au plus N chiffres venus de la seule recherche (redac-gate, « Ton cas d'abord »). */
  researchNumbersCap?: number;
  /** Brief + réponses + photos + actu : seule source d'un témoignage ou d'un vécu au passé (redac-gate). */
  testimonySource?: string;
  /** Champs de marque bruts (buildBrandGuardText) : passages à ne jamais recopier tels quels. */
  brandGuardText: string;
  /** Tu ou vous de la fiche de marque ; null = aucun réglage, aucun contrôle. */
  audienceAddress: AudienceAddress | null;
  captionEndingRule: CaptionEndingRule | undefined;
  recentBriefsContext: string;
  /** Accroches déjà écrites sur CE sujet : garde déterministe anti-redite (24/08). */
  previousHooks: string[];
  /** Derniers contenus de la marque (_shared/recent-passages.ts) : redite mesurée par le gate. */
  recentTexts: string[];
  brandVocabBlock: string;
  newsContext: any;
  corsHeaders: Record<string, string>;
  /** En-tête Authorization de la requête : transmis à carousel-visual (« Refaire cette slide »). */
  authHeader?: string;
  emitStatus: StatusEmitter;
  /** Début de la requête (Date.now()) : budget temps global des étapes facultatives. */
  startedAt: number;
  /** Plan envisagé en cours (carrousels photo et mixte) : ses jetons rejoignent la ligne de crédit. */
  outline?: { done: Promise<void>; usage: UsageSink };
}

/** Contexte inter-contenus du gate : accroches du sujet + derniers contenus de la marque. */
export function echoContext(c: CarouselRequestContext): EchoContext {
  return { previousHooks: c.previousHooks, subject: c.body.subject, recentTexts: c.recentTexts, currentRequest: c.testimonySource };
}
