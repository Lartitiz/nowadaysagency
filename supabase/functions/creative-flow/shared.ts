// Briques communes à plusieurs formats de creative-flow (lot 3, 13/10/2026) :
// délais IA, liste blanche des chiffres, réglage tu / vous, dépendances
// remplaçables en test. Déplacées À L'IDENTIQUE depuis index.ts, qui les
// réexporte. Une modification ici touche TOUS les formats : voir
// docs/creation-contenu/CARTE.md.

import { applyAudienceAddressPass } from "../_shared/audience-address-pass.ts";
import { type AudienceAddressFieldsOptions } from "../_shared/audience-address-fields.ts";
import { fetchDepthMaterial } from "../_shared/depth-research.ts";
import { numbersIn, researchNumbers, type ResearchNumbers } from "../_shared/redac-gate.ts";

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
