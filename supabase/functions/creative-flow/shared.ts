// Briques communes à plusieurs formats de creative-flow (lot 3, 13/10/2026) :
// délais IA, liste blanche des chiffres, réglage tu / vous, dépendances
// remplaçables en test. Déplacées À L'IDENTIQUE depuis index.ts, qui les
// réexporte. Une modification ici touche TOUS les formats : voir
// docs/creation-contenu/CARTE.md.

import { applyAudienceAddressPass } from "../_shared/audience-address-pass.ts";
import { type AudienceAddressFieldsOptions } from "../_shared/audience-address-fields.ts";
import { fetchDepthMaterial } from "../_shared/depth-research.ts";
import { numbersIn, researchNumbers, type ResearchNumbers } from "../_shared/redac-gate.ts";
import { type AudienceAddress } from "../_shared/audience-address.ts";

// ── Timeouts IA (audit latences 17/08) ──────────────────────────────────
// abortTimeoutMs PAR TENTATIVE (callAnthropic retente jusqu'à 2 fois en cas
// d'erreur/timeout, cf. anthropic.ts) : le step `generate` en tournait sans
// AUCUNE limite (oubli lors d'un refactor precedent — questions/follow-up/
// hooks l'étaient déjà, pas lui), tout comme les passes de correction
// enchaînées derrière (LinkedIn/reel/newsletter/carrousel/recycle). Un fetch
// qui traîne côté Anthropic pouvait donc pendre indéfiniment sans jamais
// libérer la requête ni basculer en retry.
export const GENERATE_ABORT_MS = 90_000; // appel principal (Sonnet, jusqu'à 8192 tokens de sortie)

export const CORRECTION_ABORT_MS = 45_000; // passe de correction (Haiku, édition mécanique à règles fermées)

export const ADJUST_ABORT_MS = 60_000; // édition d'un contenu déjà généré, plus court qu'une génération complète

export const LIGHT_ABORT_MS = 30_000; // angles / dictation : sortie courte

// ═══ PASSE DE CORRECTION LinkedIn ═══
// Liste blanche des chiffres (04/10/2026) : ceux du brief, des réponses, du
// branding et de l'actu passent tels quels ; ceux que SEULE la recherche
// (« creuser le sujet » ou deep research) fournit passent aussi, mais le gate
// exige leur source dans la même phrase (findUnsourcedResearchNumbers).
export function gateNumbers(baseParts: string[], researchSource?: string): { allowed: Set<string>; research?: ResearchNumbers } {
  const baseText = baseParts.join("\n");
  const base = numbersIn(baseText);
  if (!researchSource?.trim()) return { allowed: base };
  return { allowed: new Set([...base, ...numbersIn(researchSource)]), research: researchNumbers(base, researchSource, baseText) };
}

/** Dépendances remplaçables en test (même patron que carousel-ai). */
export const _deps = { fetchDepthMaterial, audienceAddressPass: applyAudienceAddressPass };

// ═══ TU OU VOUS (fiche de marque) SUR TOUS LES TEXTES PUBLIÉS (04/10/2026) ═══
// Le réglage « je m'adresse à mon public en tu / vous » est une règle ferme
// en tête de rédaction (user-context.ts) ; ici, le contrôle par le code après
// rédaction, chemin par chemin. Une passe courte ne part QUE si le texte
// contredit le réglage, et n'est gardée que si le compte baisse sans chiffre
// perdu ni ajouté (audience-address.ts). Sans réglage : aucun appel, rien ne
// change. Seuls les champs publiés sont listés : jamais les conseils que
// l'appli adresse à l'utilisatrice (tip, personal_tip, consignes de tournage).
export function addrOpts(scope: string, abortTimeoutMs = CORRECTION_ABORT_MS): AudienceAddressFieldsOptions {
  return { pass: _deps.audienceAddressPass, abortTimeoutMs, scope: `creative-flow:${scope}`, logger: (m) => console.log(`[creative-flow ${scope}] ${m}`) };
}

/** Légende, post, épingle, légende photo, script reel vision : texte + accroche. */
export const POST_ADDRESS_FIELDS = ["content", "accroche"];

/**
 * Detect the actual media_type of an image payload so we never claim
 * image/jpeg when the bytes are image/png (Anthropic returns a 400 otherwise).
 *  1) If a data URL prefix is present, trust it (strip it from the data).
 *  2) Otherwise, sniff base64 magic bytes (PNG / JPEG / WEBP / GIF).
 *  3) Fall back to the caller-provided mime, then image/jpeg.
 */
export function extractImagePayload(input: string, fallbackMime?: string): { media_type: string; data: string } {
  const m = input.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (m) return { media_type: m[1].toLowerCase(), data: m[2] };
  const head = input.slice(0, 16);
  let sniffed: string | undefined;
  if (head.startsWith("iVBORw0KGgo")) sniffed = "image/png";
  else if (head.startsWith("/9j/")) sniffed = "image/jpeg";
  else if (head.startsWith("UklGR")) sniffed = "image/webp";
  else if (head.startsWith("R0lGOD")) sniffed = "image/gif";
  return { media_type: sniffed || fallbackMime || "image/jpeg", data: input };
}

/** Consigne voix des chemins photo : sans réglage, inchangée ; avec réglage, la forme de la fiche. */
export function photoVoiceRule(addr: AudienceAddress | null | undefined, legacy: string): string {
  if (!addr) return legacy;
  return `Respecte la personne grammaticale et le registre de cette marque : si elle écrit au « je », garde ses mots. Pour s'adresser à son public, elle ${addr === "vous" ? "VOUVOIE (« vous », « votre », « vos »)" : "TUTOIE (« tu », « ton », « ta », « tes »)"} : règle ferme de sa fiche de marque.`;
}

// ── Sortie structurée pour les steps `questions` / `follow-up` ──
// Le tool forcé (tool_choice) fait garantir le JSON par l'API elle-même :
// fini les 502 « réponse IA illisible » quand Haiku glisse un guillemet non
// échappé ou un saut de ligne brut dans du JSON texte (vu 2× de suite le
// 05/07 sur le parcours story). Les prompts restent inchangés — c'est la
// couche de transport qui devient déterministe, pas une règle de plus.
export const QUESTIONS_TOOL = {
  name: "poser_questions",
  description: "Retourne les 3 questions de brief à poser à l'utilisatrice.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            placeholder: { type: "string" },
          },
          required: ["question", "placeholder"],
        },
      },
    },
    required: ["questions"],
  },
};
