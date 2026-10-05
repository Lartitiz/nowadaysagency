import { photoReadingContract } from "./writing-contract.ts";
import { COMMON } from "../_shared/carousel-editorial-contract.ts";
import { extractImagePayload } from "../_shared/image-utils.ts";
import {
  carouselLength,
  carouselLengthPrompt,
} from "../_shared/carousel-length.ts";
import { AnthropicError, type UsageSink } from "../_shared/anthropic.ts";
import { callCarouselWriter, pickCarouselWriter } from "./writer.ts";
import {
  progressionReceipt,
  type ProgressionSource,
  reviewCarouselProgression,
} from "../_shared/carousel-progression.ts";
import { newsWriting } from "./variant-writing.ts";
import { livedCaseFromCarouselBody } from "../_shared/lived-case.ts";
import { angleFamily, type AngleFamily } from "../_shared/angle-families.ts";
import { coverAccentMaxWords, validExtract } from "../_shared/carousel-design-plan.ts";
import {
  audienceAddressRule,
  type AudienceAddress,
  PHOTO_AUTO_MAX_SLIDES,
  RECIT_CONTINU_COUVERTURE,
  RECIT_CONTINU_PARAGRAPHE,
  recitContinuFamille,
  recitContinuFond,
  recitContinuLongueur,
} from "../_shared/socle.ts";

export const NARRATIVE_VERSION = "continuous-prose-v4-socle";
export class NarrativePhotoMismatch extends Error {}
/** Same evidence composeNarrative requires: pixels, contexts or a planned photo. */
function hasPhotoEvidence(body: any): boolean {
  const plan = body.confirmed_structure?.length
    ? body.confirmed_structure
    : body.slide_structure || [];
  return Boolean(
    body.photos?.length || body.photo_contexts?.length ||
      plan.some((s: any) => (s?.photo_index || 0) > 0),
  );
}

export function usesContinuousNarrative(body: any): boolean {
  // « Photos brutes » (photo dump) part en carousel_type "photo" SANS photos :
  // seule la légende est écrite, les vraies photos restent côté client. Le
  // récit continu exige des photos et levait « Choisis les photos » après
  // toute la rédaction : ce cas garde le parcours classique.
  return ["photo", "mix"].includes(body.carousel_type) && hasPhotoEvidence(body) &&
    !body.no_overlay && !body.user_slides?.length && !body.text_first &&
    (body.scenario_origin === "automatic" ||
      (!body.scenario_origin && !body.confirmed_structure?.length)) &&
    (carouselLength(body).exact ?? 4) >= 2 &&
    !(body.confirmed_structure || body.slide_structure || []).some((s: any) =>
      s.no_overlay
    );
}

export interface Narrative {
  idea: string;
  hook: string;
  /** Mot clé de l'accroche, mis en valeur sur la couverture (socle, règle 7). */
  cover_accent?: string;
  paragraphs: string[];
  caption: { hook: string; body: string; cta: string; hashtags: string[] };
}

/**
 * Famille d'angle du récit continu (socle, tableau 2b) : l'angle choisi, sinon
 * l'intention du plan automatique, sinon l'actu (C) quand une actu est fournie.
 * Angle inconnu ou texte libre : null (les règles telles quelles).
 */
export function narrativeAngleFamily(body: any): AngleFamily | null {
  return angleFamily(body?.editorial_angle, "instagram_angles") ??
    angleFamily(body?.editorial_intent?.mode, "editorial_intent") ??
    (typeof body?.news_context === "string" && body.news_context.trim() ? "C" : null);
}

/** Mot clé de couverture gardé seulement s'il est un extrait exact et court de l'accroche. */
function coverAccentOf(n: Narrative): string | undefined {
  return validExtract(n.hook, n.cover_accent, coverAccentMaxWords(n.hook.trim().split(/\s+/).filter(Boolean).length));
}
const TOOL = {
  name: "ecrire_texte_suivi",
  description: "Livre un texte continu avant toute composition de slides.",
  input_schema: {
    type: "object",
    required: ["idea", "hook", "paragraphs", "caption"],
    properties: {
      photo_mismatch: {
        type: "object",
        properties: { reason: { type: "string" } },
      },
      idea: { type: "string" },
      hook: { type: "string" },
      cover_accent: { type: "string" },
      paragraphs: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 19,
      },
      caption: {
        type: "object",
        properties: {
          hook: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export function parseNarrative(raw: string, exact?: number): Narrative {
  let n: any;
  try {
    n = JSON.parse(raw);
  } catch {
    throw new AnthropicError(
      "Le texte du carrousel est incomplet. Réessaie.",
      422,
    );
  }
  if (
    typeof n?.photo_mismatch?.reason === "string" &&
    n.photo_mismatch.reason.trim()
  ) {
    throw new NarrativePhotoMismatch(n.photo_mismatch.reason.trim());
  }
  if (
    !n || typeof n.idea !== "string" || !n.idea.trim() ||
    typeof n.hook !== "string" || !n.hook.trim() ||
    !Array.isArray(n.paragraphs) || !n.paragraphs.length ||
    n.paragraphs.length > 19 ||
    n.paragraphs.some((p: any) => typeof p !== "string" || !p.trim()) ||
    (exact && n.paragraphs.length !== exact - 1) ||
    (!exact && n.paragraphs.length < 3)
  ) {
    throw new AnthropicError(
      "Le développement du carrousel est incomplet. Réessaie.",
      422,
    );
  }
  return {
    idea: n.idea,
    hook: n.hook,
    ...(typeof n.cover_accent === "string" && n.cover_accent.trim() ? { cover_accent: n.cover_accent.trim() } : {}),
    paragraphs: n.paragraphs,
    caption: {
      hook: typeof n.caption?.hook === "string" ? n.caption.hook : "",
      body: typeof n.caption?.body === "string" ? n.caption.body : "",
      cta: typeof n.caption?.cta === "string" ? n.caption.cta : "",
      hashtags: Array.isArray(n.caption?.hashtags)
        ? n.caption.hashtags.filter((v: any) => typeof v === "string").slice(
          0,
          3,
        )
        : [],
    },
  };
}

/** No second writing model: each reviewed paragraph becomes exactly one public passage. */
export function composeNarrative(n: Narrative, body: any) {
  const passages = [n.hook, ...n.paragraphs];
  const plan = body.confirmed_structure?.length
    ? body.confirmed_structure
    : body.slide_structure || [];
  const photos = body.photos?.length || body.photo_contexts?.length ||
    Math.max(0, ...plan.map((s: any) => s.photo_index || 0));
  const coverAccent = coverAccentOf(n);
  if (!photos) {
    throw new AnthropicError(
      "Choisis les photos du carrousel avant de générer.",
      422,
    );
  }
  return {
    carousel_type: body.carousel_type,
    fil: { arrivee: n.idea, etapes: n.paragraphs },
    editorial_intent: {
      mode: "reflexion",
      idea: n.idea,
      reader_takeaway: n.idea,
      basis_source_ids: [],
      inferred: true,
    },
    slides: passages.map((text, i) => {
      const ref = plan[i] || {};
      const last = i === passages.length - 1;
      // Carrousel photo : toujours photo_full (le texte va dans overlay_text,
      // seul champ que le rendu photo affiche), quelle que soit la structure.
      const slide_type = body.carousel_type === "photo" ? "photo_full" : ref.slide_type || ref.type ||
        (last
          ? "text_only"
          : i % 2
          ? "photo_integrated"
          : "photo_full");
      const role = i === 0 ? "hook" : last ? "conclusion" : "developpement";
      return {
        slide_number: i + 1,
        slide_type,
        role,
        photo_index: slide_type === "text_only"
          ? null
          : ref.photo_index || (i % photos) + 1,
        ...(slide_type === "photo_full"
          ? {
            overlay_text: text,
            overlay_position: ref.overlay_position || "bottom_center",
            overlay_style: "narratif",
            template: i === 0 ? "couverture" : last ? "finale" : "profonde",
            kicker: null,
            detail: null,
            cta_label: null,
          }
          : {
            title: i === 0 ? text : "",
            body: i === 0 ? "" : text,
            visual_schema: null,
            // Disposition : seulement celle d'une structure confirmée. Un
            // défaut posé ici passait pour un choix et la disposition est
            // décidée au rendu (mix-layout-formatting.ts).
            ...(slide_type === "photo_integrated" && ref.photo_layout
              ? { photo_layout: ref.photo_layout }
              : {}),
          }),
        ...(ref.visual_anchor ? { visual_anchor: ref.visual_anchor } : {}),
        // Mot clé de la couverture : revérifié au rendu sur le texte final.
        ...(i === 0 && coverAccent ? { cover_accent: coverAccent } : {}),
      };
    }),
    caption: n.caption,
  };
}

export async function createContinuousNarrative(options: {
  body: any;
  brandingContext: string;
  photoContext: string;
  newsContext: string;
  authoredText: string;
  /** Tu ou vous de la fiche de marque : règle ferme en tête (socle, règle 2). */
  audienceAddress?: AudienceAddress | null;
  startedAt: number;
  reserveMs?: number;
  usage: UsageSink;
  emitStatus: (stage: string) => void;
  write?: typeof callCarouselWriter;
  review?: typeof reviewCarouselProgression;
}) {
  const { body, usage } = options;
  if (!usesContinuousNarrative(body)) return null;
  const write = options.write || callCarouselWriter,
    review = options.review || reviewCarouselProgression;
  const exact = carouselLength(body).exact;
  // Deliberately exclude automatic headings, roles, suggested thread and brand-tour outline.
  const sources: ProgressionSource[] = [
    {
      id: "request",
      provenance: "user",
      text: [
        body.subject,
        body.subject_details,
        body.photo_description,
        body.editorial_angle,
        body.objective,
        body.content_structure,
        options.authoredText,
        body.deepening_answers ? JSON.stringify(body.deepening_answers) : "",
      ].filter(Boolean).join("\n"),
    },
    { id: "brand", provenance: "brand_context", text: options.brandingContext },
    {
      id: "photo_context",
      provenance: "user_context_and_separate_library_inferences",
      text: options.photoContext,
    },
    { id: "news", provenance: "provided_reference", text: options.newsContext },
  ].filter((s) => s.text.trim());
  const remaining = () => 270000 - (options.reserveMs || 0) - (Date.now() - options.startedAt);
  const add = (sink: UsageSink, target: UsageSink = usage) => {
    for (
      const key of ["input_tokens", "output_tokens", "total_tokens"] as const
    ) target[key] = (target[key] || 0) + (sink[key] || 0);
  };
  // Règles du socle (socle.ts) : tu/vous en tête, contrat de fond, actu,
  // couverture et mot clé, longueur sans contradiction, adaptation à l'angle.
  const addressRule = audienceAddressRule(options.audienceAddress);
  const hasNews = options.newsContext.trim().length > 0;
  const system = [
    `${addressRule ? `${addressRule}\n\n` : ""}${COMMON}\nTu écris le texte d'un carrousel comme un court essai, une réflexion ou un récit, dans la voix de la marque. Tu ne composes pas ses slides.
Choisis UNE proposition précise qui mérite d'être développée avec les faits disponibles. Commence par ce qui intéresse le lecteur, puis fais évoluer sa compréhension. La suite doit avoir une nécessité : une conséquence, une objection, une nuance ou un exemple qui modifie la lecture du point précédent. Ne récite pas la fiche de marque. Tu peux laisser de côté la technique, les inspirations ou les offres si elles n'aident pas cette pensée.
Une présentation factuelle bien liée ne suffit pas à une demande de récit : chaque paragraphe doit faire avancer ce que tu défends, pas ouvrir une nouvelle rubrique. Ne donne pas toute la réponse immédiatement pour remplir ensuite avec des descriptions. Pas de suspense artificiel. Une demande explicite de liste, tutoriel ou catalogue conserve sa forme.
Les photos seront placées ensuite. Leur contexte peut éclairer les faits, mais leur ordre, leurs couleurs et leurs motifs ne dictent pas ton texte. Aucune référence « sur cette photo ». Ne fabrique ni conviction intime, ni souvenir ni fait technique pour rendre le propos intéressant. Tu peux développer une interprétation prudente de faits attestés.
Quand les pixels sont fournis, ils servent à vérifier les faits visibles, pas à ordonner les paragraphes. photo_mismatch est réservé à une contradiction frontale avec une chose concrète que la demande promet de montrer ; retourne alors sa raison, sans inventer un récit. Un décalage d'ambiance ou une illustration indirecte ne justifient pas ce refus.
Écris hook (accroche de couverture : 4 à 10 mots qui créent une tension ou un manque, jamais un titre-étiquette), puis paragraphs : les paragraphes PUBLICS successifs, sans titres de rubriques ni consignes pour un futur rédacteur. ${RECIT_CONTINU_PARAGRAPHE} Le dernier termine réellement ce propos, sans ouvrir automatiquement une offre commerciale. Caption résume fidèlement ; cta vide si aucune invitation utile n'est demandée. idea nomme précisément la proposition développée.`,
    recitContinuFond(livedCaseFromCarouselBody(body).mode),
    hasNews ? newsWriting(body).trim() : "",
    RECIT_CONTINU_COUVERTURE,
    recitContinuLongueur(exact),
    carouselLengthPrompt(body),
    recitContinuFamille(narrativeAngleFamily(body)),
    photoReadingContract(body),
  ].filter((part) => part.trim()).join("\n");
  const draft = async (feedback?: string, prior?: Narrative, final?: { exact: number; sink: UsageSink; timeout: number }) => {
    const sink: UsageSink = {};
    try {
      const content: any[] = [{
        type: "text",
        text: JSON.stringify({
          sources,
          ...(feedback ? { draft: prior, feedback } : {}),
        }),
      }];
      if (!body.confirmed_structure?.length) {
        for (const photo of (body.photos || []).slice(0, 10)) {
          if (photo.base64) {
            content.push({
              type: "image",
              source: {
                type: "base64",
                ...extractImagePayload(photo.base64, photo.mimeType),
              },
            });
          }
        }
      }
      const text = await write({
        model: pickCarouselWriter(body),
        system: system + (final ? `\nRéécriture finale : conserve exactement ${final.exact - 1} paragraphes après le titre. Réécris la pensée entière, pas des cases de slides.` : ""),
        messages: [{
          role: "user",
          content,
        }],
        tool: TOOL,
        max_tokens: 5500,
        // Fable 5.1 (mode Max) écrit plus lentement qu'Opus : 115 s mesurées en
        // live le 02/10 pour l'étape d'écriture → 140 s au lieu de 100 s. Le budget
        // global (remaining) borne toujours l'appel.
        abortTimeoutMs: Math.max(1000, Math.min(final?.timeout ?? (pickCarouselWriter(body) === "claude-fable-5-1" ? 140000 : 100000), remaining() - 40000)),
      }, sink);
      usage.model = sink.model || pickCarouselWriter(body);
      return parseNarrative(text, final?.exact ?? exact);
    } finally {
      add(sink, final?.sink);
    }
  };
  const proof = (n: Narrative) => ({
    slides: [
      { slide_number: 1, role: "hook", title: n.hook },
      ...n.paragraphs.map((body, i) => ({
        slide_number: i + 2,
        role: i === n.paragraphs.length - 1 ? "conclusion" : "developpement",
        body,
      })),
    ],
    caption: n.caption,
  });
  const judge = async (n: Narrative) => {
    if (remaining() < 12000) {
      return progressionReceipt(proof(n), "skipped", "time-budget");
    }
    const receipt = await review(proof(n), {
      sources,
      sourceContext: JSON.stringify(sources),
      abortTimeoutMs: Math.min(35000, remaining() - 8000),
    });
    if (receipt.usage) add(receipt.usage);
    return receipt;
  };
  options.emitStatus("writing");
  let narrative = await draft();
  // Longueur Auto : 10 slides au plus en photo et mixte (socle). Une réécriture
  // si le texte en demande plus ; sinon l'avertissement de structure le signale.
  const autoMax = PHOTO_AUTO_MAX_SLIDES - 1;
  if (!exact && narrative.paragraphs.length > autoMax && remaining() >= 150000) {
    try {
      const shorter = await draft(
        `Le texte a ${narrative.paragraphs.length} paragraphes : ${autoMax} au plus. Regroupe les idées voisines sans en perdre ; déplace les détails secondaires dans caption.body.`,
        narrative,
      );
      if (shorter.paragraphs.length <= autoMax) narrative = shorter;
    } catch { /* le premier texte reste */ }
  }
  options.emitStatus("correcting");
  let receipt = await judge(narrative);
  let repair: { attempted: boolean; accepted: boolean; reason: string } = {
    attempted: false,
    accepted: false,
    reason: "not-needed",
  };
  if (receipt.verdict === "needs_repair" && remaining() >= 105000) {
    repair = {
      attempted: true,
      accepted: false,
      reason: "candidate-not-acceptable",
    };
    try {
      const candidate = await draft(
        "Réécris le texte entier pour résoudre ces défauts sans ajouter de faits :\n" +
          receipt.issues.join("\n"),
        narrative,
      );
      const checked = await judge(candidate);
      if (
        checked.execution_status === "completed" &&
        checked.verdict === "acceptable"
      ) {
        narrative = candidate;
        receipt = checked;
        repair = { attempted: true, accepted: true, reason: "accepted" };
      } else {repair.reason = checked.execution_status === "completed"
          ? "candidate-not-acceptable"
          : `review-${checked.execution_status}`;}
    } catch {
      repair.reason = "repair-failed";
    }
  } else if (receipt.verdict === "needs_repair") repair.reason = "time-budget";
  const doc = composeNarrative(narrative, body);
  return {
    regenerate: async (_composed: string, feedback: string, sink: UsageSink, timeout = 100000) => {
      const candidate = await draft(feedback, narrative, { exact: doc.slides.length, sink, timeout });
      return JSON.stringify({
        ...composeNarrative(candidate, { ...body, confirmed_structure: doc.slides }),
        narrative_draft: {
          version: NARRATIVE_VERSION, ...candidate,
          review: await progressionReceipt(proof(candidate), "skipped", "final-review-pending"),
          repair: { attempted: true, accepted: false, reason: "final-review-pending" },
        },
      });
    },
    doc: {
      ...doc,
      narrative_draft: {
        version: NARRATIVE_VERSION,
        ...narrative,
        review: receipt,
        repair,
      },
    },
    repaired: repair.attempted,
  };
}
