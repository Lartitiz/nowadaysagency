import { useState, useCallback } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { invokeWithHeartbeat } from "@/lib/invoke-with-heartbeat";
import { supabase } from "@/integrations/supabase/client";
import { posthog } from "@/lib/posthog";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { downscalePhotosForVision } from "@/lib/image-vision";
import { useStreamingInvoke } from "@/hooks/use-streaming-invoke";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  EDITORIAL_ANGLES,
  CONTENT_STRUCTURES,
  LINKEDIN_EDITORIAL_ANGLES,
  PINTEREST_EDITORIAL_ANGLES,
  PINTEREST_VISUAL_ANGLES,
  getStructureForCombo,
  getStructurePromptForCombo,
} from "@/lib/content-structures";

// ── Types ──

export interface GenerateParams {
  format: "carousel" | "reel" | "story" | "post" | "linkedin" | "newsletter";
  subject: string;
  objective?: string;
  editorialAngle?: string;
  answers?: Record<string, string>;
  workspaceId?: string;
  channel?: "instagram" | "linkedin";
  // Reel-specific
  faceCam?: string;
  timeAvailable?: string;
  selectedHook?: any;
  preGenAnswers?: any;
  // Carousel-specific
  slideCount?: number;
  carouselType?: string;
  // pure_photo (photo dump) court-circuite la vision — cf. usage dans generate()
  carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | "user_slides";
  // Photo-related
  photos?: { base64: string; context?: string; mimeType?: string; userPhotoId?: string }[];
  photoDescription?: string;
  photoMode?: boolean;
  slideStructure?: Array<{
    slide_number: number;
    type: "photo_full" | "photo_integrated" | "text_only";
    photo_index?: number;
    photo_layout?: string;
  }>;
  confirmedStructure?: Array<{
    slide_number: number;
    role: string;
    title_suggestion: string;
    strategic_note: string;
    photo_index?: number;
    slide_type?: "photo_full" | "photo_integrated" | "text_only";
    story_beat?: string;
    visual_anchor?: string;
  }>;
  // Récit transmis du pass structure vers le pass d'écriture (carrousel uniquement)
  narrativeThread?: string;
  // Newsjacking — separate field to avoid bloating `subject`
  newsContext?: string;
  // Régime « texte d'abord » (carrousel mixte sans photos) : l'edge rend des
  // photo_directive par slide photo + matching strict contre le catalogue bibliothèque.
  textFirst?: boolean;
  photoCatalog?: { index: number; description: string; kind?: string | null }[];
  // "Mode qualité Max" : escalade vers Opus pour la rédaction (plus soigné, plus lent)
  qualityMax?: boolean;
}

export interface GenerateQuestionsParams {
  format: string;
  subject: string;
  editorialAngle?: string;
  objective?: string;
  channel?: "instagram" | "linkedin";
  workspaceId?: string;
  // Photo-related — when present, ask vision-anchored questions
  photos?: Array<{ base64: string; context?: string; mimeType?: string; userPhotoId?: string }>;
  photoDescription?: string;
  carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | "user_slides";
  photoMode?: boolean;
  // Newsjacking — anchors the questions in the actu instead of generic subject
  newsContext?: string;
}

export interface Question {
  id: string;
  question: string;
  placeholder?: string;
}

export interface ContentResult {
  type: "carousel" | "reel" | "story" | "post" | "linkedin" | "newsletter";
  raw: any;
  [key: string]: any;
}

// ── JSON parser (handles markdown-wrapped JSON) ──

/**
 * Échappe les caractères de contrôle (vrais \n, \r, \t, …) qui apparaissent
 * NON échappés à l'intérieur d'une chaîne JSON. Sonnet (thinking off) enveloppe
 * sa sortie en ```json { "content": "…" } mais insère parfois de vrais sauts de
 * ligne dans la valeur → JSON invalide ("Bad control character in string
 * literal") → parseAIJson renvoyait null → le blob brut fuyait au rendu du post.
 * On ne touche qu'à l'intérieur des chaînes ; hors chaîne, un \n est de la
 * mise en forme structurelle qu'il faut laisser telle quelle.
 */
function escapeUnescapedControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (esc) {
      out += ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (inStr && code < 0x20) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Dernier recours quand AUCUN parse JSON n'aboutit : le modèle (Sonnet, thinking
 * off) enveloppe le post en ```json {"content":"…"} mais casse son JSON de
 * plusieurs façons (sauts de ligne ET guillemets droits non échappés à
 * l'intérieur de la valeur). Plutôt que de continuer à réparer un JSON arbitraire
 * (sans fin), on EXTRAIT le seul champ qui compte — `content` — en s'ancrant sur
 * la STRUCTURE (début de la valeur → frontière du champ suivant), pas sur un JSON
 * valide. Robuste aux " et \n internes. Renvoie null si pas de champ `content`
 * (ex. carrousel), pour ne rien casser des autres formats.
 */
function salvageContentField(txt: string): { content: string } | null {
  const key = '"content"';
  const k = txt.indexOf(key);
  if (k < 0) return null;
  const open = txt.indexOf('"', k + key.length + 1); // guillemet ouvrant de la valeur (après les ':')
  if (open < 0) return null;
  const start = open + 1;
  // Frontière : un guillemet suivi soit du champ suivant ( , "cle": ), soit de la
  // fin de l'objet ( } ). Insensible aux " / \n internes non échappés.
  const boundary = txt.slice(start).match(/"\s*(?:,\s*"[a-zA-Z_]+"\s*:|}\s*$)/);
  const end = boundary ? start + boundary.index! : txt.length;
  let val = txt.slice(start, end);
  // Dé-échappe les séquences JSON standard éventuellement présentes.
  val = val
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
  return val ? { content: val } : null;
}

function parseAIJson(raw: string | object): any {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string") return null;

  let cleaned = raw.trim();

  // Remove markdown code fences (with or without language tag)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  }

  cleaned = cleaned.trim();

  // Direct parse attempt
  try {
    return JSON.parse(cleaned);
  } catch {
    // ignore
  }

  // Try to find a JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // ignore
    }
  }

  // Try to find a JSON array
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      // ignore
    }
  }

  // Réparation des caractères de contrôle non échappés (vrais \n / \r / \t
  // dans une chaîne). Cause n°1 de fuite du JSON brut au rendu du post — voir
  // escapeUnescapedControlChars. On reparse la version réparée.
  const repaired = escapeUnescapedControlChars(cleaned);
  if (repaired !== cleaned) {
    try {
      return JSON.parse(repaired);
    } catch {
      // ignore
    }
    const repObj = repaired.match(/\{[\s\S]*\}/);
    if (repObj) {
      try {
        return JSON.parse(repObj[0]);
      } catch {
        // ignore
      }
    }
  }

  // Last resort: fix common issues (trailing commas, single quotes)
  try {
    const fixed = cleaned
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'/g, '"');
    const obj2 = fixed.match(/\{[\s\S]*\}/);
    if (obj2) return JSON.parse(obj2[0]);
    const arr2 = fixed.match(/\[[\s\S]*\]/);
    if (arr2) return JSON.parse(arr2[0]);
  } catch {
    // ignore
  }

  // Ultime filet : extraction structurelle du champ `content` d'un JSON
  // irrécupérable, pour ne JAMAIS afficher le blob ```json brut au rendu du post.
  const salvaged = salvageContentField(cleaned);
  if (salvaged) return salvaged;

  return null;
}

/**
 * Filet anti-JSON brut : certains edges renvoient leur erreur quota sous forme
 * d'objet ({"error":"limit_reached","message":"…","quota":{…}}) qui finissait
 * affiché TEL QUEL à l'utilisatrice. On extrait le `message` lisible (ou un
 * fallback) au lieu de dumper le JSON. Idempotent sur un message déjà propre.
 */
function cleanErrorMessage(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const t = s.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const o = JSON.parse(t);
      const m = o?.message || o?.quota?.message || o?.error;
      if (m && typeof m === "string") return m;
      return "Une erreur est survenue. Réessaie 🌸";
    } catch {
      /* pas du JSON valide → on garde le texte */
    }
  }
  return s || "Une erreur est survenue. Réessaie 🌸";
}

// Message honnête affiché en ligne à l'étape résultat quand le quota a coupé la
// génération (le détail plan/usage vit dans le QuotaWallModal, pas ici).
const QUOTA_EXHAUSTED_MESSAGE =
  "Tes crédits du mois sont utilisés — ils reviennent le 1er du mois 🌸";

// Les erreurs « fonctionnalité premium » passent aussi par handleQuotaError : pour
// elles on garde le message serveur (il nomme le plan requis), sinon le message
// crédits générique.
function quotaInlineMessage(serverMessage: string): string {
  return serverMessage.includes("disponible à partir")
    ? serverMessage
    : QUOTA_EXHAUSTED_MESSAGE;
}

// ── Hook ──

export function useContentGenerator() {
  // Filet workspace (10/07/2026) : plusieurs appelants (CreerUnifie…) omettaient
  // params.workspaceId → les lignes ai_usage partaient avec workspace_id NULL et
  // échappaient au comptage par workspace du quota (checkQuota/check-subscription).
  // Le hook résout lui-même le workspace actif ; un params.workspaceId explicite
  // garde la priorité (manager sur l'espace d'une cliente). useWorkspaceId retombe
  // sur user.id quand le contexte n'est pas prêt → on le neutralise (ce n'est pas
  // un id de workspace), le serveur retombera alors sur le workspace propre.
  const { user } = useAuth();
  const activeWorkspaceId = useWorkspaceId();
  const defaultWorkspaceId =
    activeWorkspaceId && activeWorkspaceId !== user?.id ? activeWorkspaceId : undefined;

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ContentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Erreur propre à la préparation des questions (quota, réseau…) — distincte de
  // `error` (partagé avec la génération) pour que l'écran questions puisse dire
  // la vérité au lieu de « Pas de questions pour ce format ».
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  // Quota épuisé pendant la génération : état distinct de `error`. Le QuotaWallModal
  // s'ouvre par-dessus, mais l'étape résultat reste affichée derrière (et réapparaît
  // à la fermeture du modal) — sans cet état elle retombait sur « Session expirée ou
  // contenu indisponible » avec un Réessayer qui ne peut que re-échouer.
  const [quotaExhausted, setQuotaExhausted] = useState<string | null>(null);
  // Étape réelle de la génération en cours (events SSE `status` du serveur :
  // "writing" → rédaction, "correcting" → relecture anti-patterns IA). Permet
  // à l'écran d'attente d'afficher la vraie étape au lieu de messages simulés.
  const [generationStage, setGenerationStage] = useState<string | null>(null);

  // Internal streaming wrapper — proxied to consumers via the hook's return.
  // Kept inside the hook so all callers share the same SSE state.
  const {
    content: streamingContent,
    streaming,
    done: streamDone,
    stage: streamStage,
    error: streamError,
    invoke: streamInvoke,
    reset: streamReset,
  } = useStreamingInvoke();

  const reset = useCallback(() => {
    setGenerating(false);
    setResult(null);
    setError(null);
    setQuotaExhausted(null);
    setLoadingQuestions(false);
    setQuestions([]);
  }, []);

  // Pour les générations qui n'empruntent PAS generate()/generateStream()
  // (structure proposal carrousel, visuels/briefs Pinterest : appels directs
  // dans CreerUnifie) : marquer/effacer l'état quota pour que l'étape résultat
  // dise la vérité aussi sur ces chemins.
  const markQuotaExhausted = useCallback((e?: unknown) => {
    const raw = typeof e === "string" ? e : (e as any)?.data?.message || (e as any)?.message || "";
    setQuotaExhausted(quotaInlineMessage(cleanErrorMessage(raw)));
  }, []);

  const clearQuotaExhausted = useCallback(() => setQuotaExhausted(null), []);

  const generate = useCallback(async (params: GenerateParams) => {
    const {
      format,
      subject,
      objective,
      editorialAngle,
      answers,
      workspaceId,
      faceCam,
      timeAvailable,
      selectedHook,
      preGenAnswers,
      slideCount,
      carouselType,
      newsContext,
    } = params;
    const effectiveWorkspaceId = workspaceId || defaultWorkspaceId;

    setGenerating(true);
    setError(null);
    setQuotaExhausted(null);
    setResult(null);
    setGenerationStage(null);
    const generationStartedAt = performance.now();

    // Defensive: bail early on non-canonical formats (e.g. "auto") so the user
    // gets a clear toast instead of a half-broken request.
    const SUPPORTED = ["carousel", "reel", "story", "post", "linkedin"] as const;
    if (!format || !(SUPPORTED as readonly string[]).includes(format)) {
      setGenerating(false);
      setError("Choisis un format valide pour générer ton contenu.");
      return null;
    }

    // Compute structure if editorial angle provided
    let structurePrompt: string | null = null;
    let structureId: string | null = null;

    if (editorialAngle) {
      structureId = getStructureForCombo(format, editorialAngle);
      structurePrompt = getStructurePromptForCombo(format, editorialAngle);
    }

    try {
      // Split enriched subject: if it contains calendar content, separate it out
      // to avoid exceeding the 500-char subject validation limit on edge functions
      const CALENDAR_MARKER = "\n\n[Contenu existant à approfondir]\n";
      let effectiveSubject = subject;
      let existingContent: string | null = null;
      if (subject.includes(CALENDAR_MARKER)) {
        const idx = subject.indexOf(CALENDAR_MARKER);
        effectiveSubject = subject.slice(0, idx);
        existingContent = subject.slice(idx + CALENDAR_MARKER.length);
      }

      let data: any;
      let invokeError: any;

      switch (format) {
        case "carousel": {
          // If editorial angle is provided, don't impose a carousel_type
          let effectiveCarouselType = carouselType || null;
          if (!effectiveCarouselType && editorialAngle) {
            effectiveCarouselType = null;
          }

          const res = await invokeWithHeartbeat("carousel-ai", {
            body: {
              type: "express_full",
              channel: params.channel || "instagram",
              carousel_type: effectiveCarouselType,
              subject: effectiveSubject,
              subject_details: existingContent || undefined,
              objective: objective || null,
              slide_count: slideCount || 7,
              deepening_answers: answers || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: effectiveWorkspaceId || null,
              // Optimisation : si la structure a déjà été confirmée à l'étape précédente
              // (structure_proposal), Claude a déjà analysé les photos en vision. Inutile
              // de les renvoyer en base64 — la structure encode déjà photo_index + slide_type.
              // Évite que Sonnet refasse une analyse vision (~3 min → ~40 s).
              // pure_photo (photo dump) : JAMAIS de vision — chaque photo est une
              // slide 1:1 sans texte, l'analyse vision Sonnet dépassait le timeout
              // gateway (504). Le contexte des slides est passé en texte via
              // photo_description ; la légende s'écrit sans voir les images.
              photos: (!params.confirmedStructure && params.carouselSubMode !== "pure_photo" && (params.carouselType === "photo" || params.carouselType === "mix")) ? await downscalePhotosForVision(params.photos) : undefined,
              photo_description: (params.carouselType === "photo" || params.carouselType === "mix") ? params.photoDescription : undefined,
              slide_structure: params.slideStructure || null,
              confirmed_structure: params.confirmedStructure || null,
              quality_max: params.qualityMax || undefined,
              ...(params.narrativeThread && params.narrativeThread.trim() ? { narrative_thread: params.narrativeThread } : {}),
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
              ...(params.textFirst ? { text_first: true } : {}),
              ...(params.textFirst && params.photoCatalog && params.photoCatalog.length > 0
                ? { photo_catalog: params.photoCatalog.slice(0, 40) }
                : {}),
            },
            onStatus: (stage) => setGenerationStage(stage),
          }, 180000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "reel": {
          // Mapper les answers des questions vers le format pre_gen_answers attendu par reels-ai
          let effectivePreGenAnswers = preGenAnswers || null;
          if (!effectivePreGenAnswers && answers && Object.keys(answers).length > 0) {
            const vals = Object.values(answers);
            effectivePreGenAnswers = {
              anecdote: vals[0] || undefined,
              emotion: vals[1] || undefined,
              conviction: vals[2] || undefined,
            };
          }

          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "reel",
              context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
              objective: objective || null,
              face_cam: faceCam || "oui",
              time_available: timeAvailable || "flexible",
              pre_gen_answers: effectivePreGenAnswers,
              selected_hook: selectedHook || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              workspace_id: effectiveWorkspaceId || null,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "story": {
          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "stories",
              context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
              objective: objective || null,
              face_cam: faceCam || "flexible",
              time_available: timeAvailable || "flexible",
              pre_gen_answers: preGenAnswers || null,
              workspace_id: effectiveWorkspaceId || null,
              // Photos de la bibliothèque choisies à l'étape format (lot D) :
              // le brief les traite en priorité absolue, une par story.
              ...(params.photoMode && params.photos?.length
                ? {
                    preferred_photo_ids: params.photos
                      .map((p) => p.userPhotoId)
                      .filter((id): id is string => !!id)
                      .slice(0, 10),
                  }
                : {}),
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "post": {
          const angle = editorialAngle
            ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
            : undefined;
          const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;

          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "instagram_post",
              context: effectiveSubject + (existingContent ? `\n\n[Contenu existant à approfondir]\n${existingContent}` : ""),
              angle: angle
                ? {
                    title: angle.label,
                    structure: structure?.steps.map((s) => s.label),
                    tone: "direct, chaleureux, oral assumé",
                  }
                : undefined,
              answers: answers
                ? Object.entries(answers).map(([k, v]) => ({ question: k, answer: v }))
                : [],
              objective: objective || null,
              workspace_id: effectiveWorkspaceId || null,
              photo_mode: params.photoMode || undefined,
              photos: params.photoMode && params.photos?.length ? params.photos.slice(0, 10).map(p => ({ base64: p.base64, mimeType: p.mimeType || "image/jpeg", context: p.context })) : undefined,
              photo_description: params.photoMode ? params.photoDescription : undefined,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }

        case "linkedin": {
          // LinkedIn is now handled via creative-flow streaming in CreerUnifie.
          // This fallback exists for edge cases only.
          const angle = editorialAngle
            ? EDITORIAL_ANGLES.find((a) => a.id === editorialAngle)
            : undefined;
          const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;
          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "generate",
              contentType: "post_linkedin",
              context: effectiveSubject + (existingContent ? `\n\n[Contenu existant]\n${existingContent}` : ""),
              angle: angle
                ? { title: angle.label, structure: structure?.steps.map((s) => s.label), tone: "direct, chaleureux, professionnel" }
                : undefined,
              objective: objective || null,
              editorialFormat: editorialAngle || null,
              workspace_id: effectiveWorkspaceId || null,
              photo_mode: params.photoMode || undefined,
              photos: params.photoMode && params.photos?.length
                ? params.photos.slice(0, 10).map((p) => ({ base64: p.base64, mimeType: p.mimeType || "image/jpeg", context: p.context }))
                : undefined,
              photo_description: params.photoMode ? params.photoDescription : undefined,
              ...(newsContext && newsContext.trim() ? { news_context: newsContext.slice(0, 3800) } : {}),
            },
          }, 120000);
          data = res.data;
          invokeError = res.error;
          break;
        }


        default:
          throw new Error(`Format non supporté : ${format}`);
      }

      // Quota : détection par le CODE structuré, AVANT le throw générique. Les
      // helpers d'invocation renvoient TOUJOURS le couple { data, error.isRateLimit }
      // sur un limit_reached — l'ancien throw générique sur invokeError passait donc
      // en premier, perdait data.quota (plan/usage du QuotaWallModal) et laissait la
      // détection retomber sur des substrings de message (fragiles depuis que les
      // messages quota n'emploient plus les mots « crédit »/« quota », PR #308).
      if (invokeError?.isRateLimit || data?.error === "limit_reached" || data?.message?.includes("ce mois")) {
        throw Object.assign(new Error(data?.message || invokeError?.message || "limit_reached"), { _isQuota: true, data });
      }
      if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
      if (data?.error) throw new Error(data.message || data.error);

      // Edge functions wrap response in { content: "..." } — unwrap before parsing
      const rawContent = data?.content ?? data;
      const parsed = parseAIJson(rawContent);
      if (!parsed) throw new Error("La génération n'a pas fonctionné comme prévu. Réessaie, ça marche en général au deuxième essai 🌸");

      // Garde de forme : un JSON valide mais sans contenu exploitable (format
      // partiel renvoyé par l'IA) crasherait au rendu (.map sur non-array) et
      // serait persisté → l'ErrorBoundary reboucle. On le traite ici comme un
      // échec propre et réessayable, jamais comme un résultat affichable.
      const p: any = parsed;
      const hasUsableContent =
        format === "carousel"
          ? Array.isArray(p.slides) && p.slides.length > 0
          : format === "reel"
            ? (Array.isArray(p.sections) && p.sections.length > 0) || !!p.full_text
            : format === "story"
              ? Array.isArray(p.stories) || Array.isArray(p.sequences) || Array.isArray(p.slides)
              : true;
      if (!hasUsableContent) throw new Error("La génération n'a pas fonctionné comme prévu. Réessaie, ça marche en général au deuxième essai 🌸");

      const normalized: ContentResult = {
        type: format,
        raw: parsed,
        ...parsed,
      };

      // Télémétrie de latence (PostHog, jamais ai_usage) : la lenteur de
      // génération était invisible dans les stats — aucune durée loguée nulle part.
      posthog.capture("content_generation_timing", {
        format,
        duration_ms: Math.round(performance.now() - generationStartedAt),
        quality_max: !!params.qualityMax,
      });

      setResult(normalized);
      return normalized;
    } catch (e: any) {
      // Erreurs quota/premium → toast convivial (jamais le JSON brut affiché).
      const cleaned = cleanErrorMessage(e?.message);
      if (handleQuotaError(e?._isQuota ? e : { message: cleaned, data: e?.data })) {
        setQuotaExhausted(quotaInlineMessage(cleaned));
        setError(null);
        return null;
      }
      setError(cleaned || "Erreur lors de la génération");
      return null;
    } finally {
      setGenerating(false);
      setGenerationStage(null);
    }
  }, [defaultWorkspaceId]);

  const generateQuestions = useCallback(
    async (params: GenerateQuestionsParams) => {
      const { format, subject, editorialAngle, objective, workspaceId } = params;
      const effectiveWorkspaceId = workspaceId || defaultWorkspaceId;
      setQuestionsError(null);

      setLoadingQuestions(true);
      setQuestions([]);

      try {
        let data: any;
        let invokeError: any;

        // Split enriched subject for questions too
        const CALENDAR_MARKER_Q = "\n\n[Contenu existant à approfondir]\n";
        let effectiveSubjectQ = subject;
        let existingContentQ: string | null = null;
        if (subject.includes(CALENDAR_MARKER_Q)) {
          const idx = subject.indexOf(CALENDAR_MARKER_Q);
          effectiveSubjectQ = subject.slice(0, idx);
          existingContentQ = subject.slice(idx + CALENDAR_MARKER_Q.length);
        }

        // Fetch recent briefs (sujets uniquement) pour mémoire anti-répétition.
        // ⚠️ On NE PASSE PAS les "réponses marquantes" : elles polluent le prompt
        // et l'IA finit par mélanger un ancien vécu avec le sujet courant.
        let recentBriefsContext = "";
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            let q = supabase
              .from("content_briefs")
              .select("subject, format, editorial_angle, created_at")
              .order("created_at", { ascending: false })
              .limit(8); // marge pour filtrer les sujets vides
            if (effectiveWorkspaceId) q = q.eq("workspace_id", effectiveWorkspaceId);
            else q = q.eq("user_id", user.id);
            const { data: briefs } = await q;
            const cleanBriefs = (briefs || [])
              .filter((b: any) => typeof b.subject === "string" && b.subject.trim().length > 0)
              .slice(0, 3);
            if (cleanBriefs.length > 0) {
              const lines = cleanBriefs.map((b: any, i: number) => {
                const subj = b.subject.trim();
                const safeSubj = subj.length > 120 ? subj.slice(0, 117) + "..." : subj;
                const parts = [`Brief #${i + 1} — sujet : "${safeSubj}"`];
                if (b.format) parts.push(`format : ${b.format}`);
                if (b.editorial_angle) parts.push(`angle : ${b.editorial_angle}`);
                return parts.join(" · ");
              });
              recentBriefsContext = `\n══ HISTORIQUE RÉCENT (${cleanBriefs.length} brief${cleanBriefs.length > 1 ? "s" : ""}, indicatif) ══\n${lines.join("\n")}\n\nUSAGE STRICT : ne re-pose pas une question déjà posée pour ces sujets passés. Ces briefs ne décrivent PAS le sujet courant — ne mélange jamais leur contenu avec le sujet courant.\n`;
              const RECENT_BRIEFS_MAX = 1500;
              if (recentBriefsContext.length > RECENT_BRIEFS_MAX) {
                recentBriefsContext = recentBriefsContext.slice(0, RECENT_BRIEFS_MAX - 20) + "\n... (tronqué)\n";
              }
            }
          }
        } catch (e) {
          // non-blocking
          console.warn("[generateQuestions] could not fetch recent briefs:", e);
        }

        if (format === "carousel") {
          const structurePrompt = editorialAngle
            ? getStructurePromptForCombo(format, editorialAngle)
            : null;

          const hasPhotos = (params.photos?.length ?? 0) > 0;
          const isPhotoLikeMode = params.carouselSubMode === "photo" || params.carouselSubMode === "mix" || params.carouselSubMode === "pure_photo";
          const visionMode = hasPhotos && isPhotoLikeMode;
          // pure_photo réutilise la pipeline "photo" côté backend (le post-process
          // côté client supprimera ensuite tout overlay_text/title/body).
          const effectiveSubMode = params.carouselSubMode === "pure_photo" ? "photo" : params.carouselSubMode;

          const res = await invokeWithTimeout("carousel-ai", {
            body: {
              type: "deepening_questions",
              channel: params.channel || "instagram",
              // Sans ce champ, la ligne ai_usage (catégorie suggestion) partait
              // avec workspace_id NULL — hors du périmètre de comptage du quota.
              workspace_id: effectiveWorkspaceId || null,
              subject: effectiveSubjectQ,
              subject_details: existingContentQ || undefined,
              objective: objective || null,
              editorial_angle: editorialAngle || null,
              content_structure: structurePrompt || null,
              recent_briefs_context: recentBriefsContext || undefined,
              carousel_type: visionMode ? effectiveSubMode : undefined,
              photos: visionMode
                ? params.photos!.map((p) => ({ base64: p.base64, context: p.context }))
                : undefined,
              photo_description: visionMode ? params.photoDescription || undefined : undefined,
              ...(params.newsContext && params.newsContext.trim() ? { news_context: params.newsContext.slice(0, 3800) } : {}),
            },
          }, visionMode ? 90000 : 60000);
          data = res.data;
          invokeError = res.error;
        } else {
          // Build angle context for creative-flow questions
          let angleObj: { title: string; structure: string[]; tone: string };
          if (editorialAngle) {
            const found = EDITORIAL_ANGLES.find((a) => a.id === editorialAngle);
            const structId = getStructureForCombo(format, editorialAngle);
            const struct = structId ? CONTENT_STRUCTURES[structId] : null;
            angleObj = {
              title: found?.label || editorialAngle,
              structure: struct?.steps.map((s) => s.label) || [],
              tone: "direct, chaleureux, oral assumé",
            };
          } else {
            angleObj = {
              title: "libre",
              structure: [],
              tone: "direct, chaleureux, oral assumé",
            };
          }

          const hasPhotosCF = (params.photos?.length ?? 0) > 0 && !!params.photos?.[0]?.base64;
          // Aligné sur le déclenchement vision de la génération (qui exige photoMode).
          // `photoMode` est de toute façon auto-activé dès qu'une photo est présente
          // sur un format compatible (cf. CreerStepFormat), donc post/linkedin sont couverts.
          // Évite le cas "questions ancrées sur la photo" puis "génération sans la photo".
          const photoModeCF = hasPhotosCF && params.photoMode === true;

          const res = await invokeWithTimeout("creative-flow", {
            body: {
              step: "questions",
              // Étape gratuite, mais le workspace scope aussi le contexte branding
              // (getUserContext) et la mémoire anti-répétition côté serveur.
              workspace_id: effectiveWorkspaceId || undefined,
              contentType:
                format === "linkedin"
                  ? "linkedin_post"
                  : format === "newsletter"
                  ? "newsletter"
                  : "instagram_post",
              context: (() => {
                const CONTEXT_MAX = 7800;
                const base = effectiveSubjectQ;
                if (!existingContentQ) {
                  return base.length > CONTEXT_MAX ? base.slice(0, CONTEXT_MAX - 3) + "..." : base;
                }
                const suffix = `\n\n[Contenu existant à approfondir]\n`;
                const reservedForSubject = Math.min(base.length, Math.floor(CONTEXT_MAX * 0.4));
                const remaining = CONTEXT_MAX - reservedForSubject - suffix.length;
                const safeSubject = base.length > reservedForSubject ? base.slice(0, reservedForSubject - 3) + "..." : base;
                const safeExisting = existingContentQ.length > remaining
                  ? existingContentQ.slice(0, remaining - 3) + "..."
                  : existingContentQ;
                return safeSubject + suffix + safeExisting;
              })(),
              angle: angleObj,
              objective: objective || null,
              recent_briefs_context: recentBriefsContext || undefined,
              photo_mode: photoModeCF || undefined,
              photos: photoModeCF
                ? params.photos!.slice(0, 10).map(p => ({
                    base64: p.base64,
                    mimeType: p.mimeType || "image/jpeg",
                    context: p.context,
                  }))
                : undefined,
              photo_description: photoModeCF ? params.photoDescription || undefined : undefined,
              ...(params.newsContext && params.newsContext.trim() ? { news_context: params.newsContext.slice(0, 3800) } : {}),
            },
          }, photoModeCF ? 180000 : 60000);
          data = res.data;
          invokeError = res.error;
        }

        if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
        if (data?.error) throw new Error(data.message || data.error);

        // carousel-ai wraps its response in { content: "..." } — unwrap before parsing
        const rawContent = data?.content || data;
        const parsed = parseAIJson(rawContent);
        let parsedQuestions: Question[] = [];

        if (Array.isArray(parsed)) {
          parsedQuestions = parsed.map((q: any, i: number) => ({
            id: q.id || `q_${i}`,
            question: q.question || q.label || q.text || String(q),
            placeholder: q.placeholder || q.hint || "",
          }));
        } else if (parsed?.questions && Array.isArray(parsed.questions)) {
          parsedQuestions = parsed.questions.map((q: any, i: number) => ({
            id: q.id || `q_${i}`,
            question: q.question || q.label || q.text || String(q),
            placeholder: q.placeholder || q.hint || "",
          }));
        }

        setQuestions(parsedQuestions);
        return parsedQuestions;
      } catch (e: any) {
        const cleaned = cleanErrorMessage(e?.message) || "Erreur lors de la génération des questions";
        setError(cleaned);
        setQuestionsError(cleaned);
        return [];
      } finally {
        setLoadingQuestions(false);
      }
    },
    [defaultWorkspaceId]
  );

  // ── Streaming generation (text formats: post / linkedin / newsletter / pinterest) ──
  // Encapsulates the SSE flow that used to live inline in CreerUnifie.tsx.
  // Mirrors EXACTLY the previous behavior: contentType mapping, body shape,
  // angle resolution across all 4 angle catalogs, JSON parsing, quota handling.
  const generateStream = useCallback(
    async (params: GenerateStreamParams): Promise<ContentResult | null> => {
      const {
        format,
        subject,
        objective,
        editorialAngle,
        answers,
        workspaceId,
        photoMode,
        photos,
        photoDescription,
        deepResearch,
        pinterestLink,
        pinterestBoard,
        newsContext,
      } = params;

      streamReset();
      setError(null);
      setQuotaExhausted(null);
      setResult(null);

      const contentTypeMap: Record<string, string> = {
        post: "post_instagram",
        linkedin: "post_linkedin",
        newsletter: "post_newsletter",
        pinterest: "post_pinterest",
      };

      // Resolve angle across all 4 catalogs (same lookup CreerUnifie used)
      const angleObj = editorialAngle
        ? (() => {
            const found =
              EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) ||
              LINKEDIN_EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) ||
              PINTEREST_EDITORIAL_ANGLES.find((a) => a.id === editorialAngle) ||
              PINTEREST_VISUAL_ANGLES.find((a) => a.id === editorialAngle);
            const structureId = getStructureForCombo(format, editorialAngle);
            const structure = structureId ? CONTENT_STRUCTURES[structureId] : undefined;
            return found
              ? {
                  title: found.label,
                  structure: structure?.steps.map((s) => s.label),
                  tone: "direct, chaleureux, oral assumé",
                }
              : undefined;
          })()
        : undefined;

      const ans = answers || {};
      const hasAnswers = Object.keys(ans).length > 0;
      // `ans` est désormais indexé par le TEXTE de la question (ré-indexé en amont
      // dans CreerUnifie). Le bloc anecdote/émotion/conviction reste positionnel
      // (1re/2e/3e réponse) — comme avant, mais via les valeurs et non les clés `q_0`.
      const ansValues = Object.values(ans);

      const streamBody: any = {
        step: "generate",
        contentType: contentTypeMap[format] || "post_instagram",
        context: subject,
        angle: angleObj,
        answers: hasAnswers
          ? Object.entries(ans).map(([q, a]) => ({ question: q, answer: a }))
          : undefined,
        preGenAnswers: hasAnswers
          ? {
              anecdote: (ans as any).anecdote || ansValues[0] || undefined,
              emotion: (ans as any).emotion || ansValues[1] || undefined,
              conviction: (ans as any).conviction || ansValues[2] || undefined,
            }
          : undefined,
        workspace_id: workspaceId || defaultWorkspaceId || undefined,
        objective: objective || undefined,
        editorialFormat: editorialAngle || undefined,
        editorialFormatLabel: editorialAngle || undefined,
        ...(photoMode
          ? {
              photo_mode: true,
              photo_description: photoDescription,
              ...(photos && photos.length > 0 && photos[0]?.base64
                ? {
                    photos: photos.slice(0, 10).map((p) => ({
                      base64: p.base64,
                      mimeType: p.mimeType || "image/jpeg",
                      context: p.context,
                    })),
                  }
                : {}),
            }
          : {}),
        ...(deepResearch ? { deepResearch: true } : {}),
        ...(newsContext && newsContext.trim().length > 0 ? { news_context: newsContext.slice(0, 3800) } : {}),
        ...(format === "pinterest" && (pinterestLink || pinterestBoard)
          ? { pinterest_link: pinterestLink, pinterest_board: pinterestBoard }
          : {}),
      };

      let fullText = "";
      try {
        fullText = await streamInvoke("creative-flow", streamBody);
      } catch (e: any) {
        const cleaned = cleanErrorMessage(e?.message);
        if (handleQuotaError(e?._isQuota ? e : { message: cleaned, data: e?.data })) {
          setQuotaExhausted(quotaInlineMessage(cleaned));
          setError(null);
          return null;
        }
        setError(cleaned || "Erreur lors de la génération");
        return null;
      }

      if (!fullText) {
        // Résultat vide = échec. On pose l'erreur ici pour que l'effet global
        // (toast unique) l'affiche, au lieu d'un toast manuel côté appelant qui
        // doublait l'affichage avec l'erreur du hook.
        setError("La génération a échoué. Réessaie.");
        return null;
      }

      // Parse tolérant via parseAIJson : gère les fences ```json, le texte
      // après le `}`, virgules traînantes, etc. Le parse inline précédent
      // (match(/\{[\s\S]*\}/) + JSON.parse nu) échouait dès qu'un fence
      // markdown ou du texte de queue entourait l'objet → le JSON brut fuyait
      // dans le rendu du post. Sonnet 5 (thinking off) enveloppe désormais
      // ~systématiquement sa sortie en ```json {"content": …} → il FAUT le
      // parseur robuste ici. Si ce n'est pas du JSON (texte pur), fallback.
      const parsedJson = parseAIJson(fullText);
      const parsed: any = parsedJson ?? { content: fullText };

      const normalized: ContentResult = {
        type: format as ContentResult["type"],
        raw: parsed,
      };
      setResult(normalized);
      return normalized;
    },
    [streamInvoke, streamReset, defaultWorkspaceId]
  );

  return {
    generate,
    generating,
    generationStage,
    result,
    setResult,
    error,
    quotaExhausted,
    markQuotaExhausted,
    clearQuotaExhausted,
    reset,
    generateQuestions,
    loadingQuestions,
    questions,
    setQuestions,
    questionsError,
    // Streaming API (Phase 4 — proxy of internal useStreamingInvoke)
    generateStream,
    streamingContent,
    streaming,
    streamDone,
    streamStage,
    streamError,
    streamReset,
  };
}

// ── Streaming params type ──
export interface GenerateStreamParams {
  format: "post" | "linkedin" | "newsletter" | "pinterest";
  subject: string;
  objective?: string;
  editorialAngle?: string;
  answers?: Record<string, string>;
  workspaceId?: string;
  photoMode?: boolean;
  photos?: { base64: string; mimeType?: string; context?: string; userPhotoId?: string }[];
  photoDescription?: string;
  deepResearch?: boolean;
  pinterestLink?: string;
  pinterestBoard?: string;
  // Newsjacking — separate field, not stuffed into `subject`
  newsContext?: string;
}
