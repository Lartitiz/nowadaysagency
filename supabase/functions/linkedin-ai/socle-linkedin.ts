// Socle commun appliqué aux actions de rédaction de `linkedin-ai` (05/10/2026).
//
// Ces actions (crosspost, légende de carrousel LinkedIn, amélioration de post,
// adaptation d'un post Instagram, résumé de profil) restaient en dehors du
// socle (audit socle-etat-des-lieux.md, constat 8). On y branche, selon la
// famille de l'angle (angle-families.ts) :
//   - règle 1 « Ton cas d'abord » : détection du vécu par lived-case.ts
//     (LIVED_CASE_FIRST) et règle d'actu de #1362 (NEWS_FEELING_FIRST quand
//     elle a répondu, sinon l'accroche de l'IA n'est jamais un vécu) ;
//   - règle 3 « une idée par unité » : une idée par paragraphe, on découpe, on
//     ne raccourcit pas, aucun nombre fixe d'unités à remplir.
// La règle 2 (tu / vous) est déjà branchée par #1360 (index.ts). Aucune
// recherche n'est faite dans linkedin-ai : le plafond de chiffres de recherche
// ne s'y applique pas ; les chiffres absents des sources restent signalés par
// runTextRedacGate (allowedNumbers).
//
// Module pur : testé dans socle-linkedin_test.ts (index.ts lance le serveur).

import { angleFamily, type AngleFamily } from "../_shared/angle-families.ts";
import { detectLivedCase, livedCaseFromCarouselBody, LIVED_CASE_FIRST, NEWS_FEELING_FIRST, type CaseMode } from "../_shared/lived-case.ts";

/** Actions de linkedin-ai qui rédigent un texte publié. */
export const LINKEDIN_SOCLE_ACTIONS = ["caption-for-carousel", "crosspost", "improve-post", "adapt-instagram", "summary"] as const;
export type LinkedInSocleAction = typeof LINKEDIN_SOCLE_ACTIONS[number];

const isSocleAction = (a: string): a is LinkedInSocleAction => (LINKEDIN_SOCLE_ACTIONS as readonly string[]).includes(a);
const filled = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Famille d'angle d'une action :
 * - crosspost, amélioration, adaptation : K (son texte existant est la source) ;
 * - résumé de profil : A (son parcours à elle) ;
 * - légende de carrousel : C avec une actu, sinon la famille de l'angle choisi.
 */
export function linkedInAiFamily(action: string, params: Record<string, unknown> = {}): AngleFamily | null {
  if (action === "crosspost" || action === "improve-post" || action === "adapt-instagram") return "K";
  if (action === "summary") return "A";
  if (action === "caption-for-carousel") {
    if (filled(params.news_context)) return "C";
    return angleFamily(params.editorial_angle, "linkedin_angles") ?? angleFamily(params.editorial_angle);
  }
  return null;
}

/** Ce qu'elle a écrit elle-même pour CE contenu (jamais le branding ni l'actu). */
function ownText(action: LinkedInSocleAction, params: Record<string, unknown>): string[] {
  const pick = (...keys: string[]) => keys.map((k) => params[k]).filter(filled);
  switch (action) {
    case "crosspost": return pick("sourceContent");
    case "improve-post":
    case "adapt-instagram": return pick("postContent");
    case "summary": return pick("passion", "parcours", "offre");
    case "caption-for-carousel": return pick("subject");
  }
}

/**
 * Mode du cas (lived-case.ts). Légende de carrousel : même lecture que
 * carousel-ai (réponses d'approfondissement + sujet ; avec une actu, le sujet
 * proposé par l'IA ne compte jamais comme vécu, seules ses réponses comptent).
 */
export function linkedInAiCaseMode(action: string, params: Record<string, unknown> = {}): CaseMode {
  if (!isSocleAction(action)) return "none";
  if (action === "caption-for-carousel") return livedCaseFromCarouselBody(params).mode;
  return detectLivedCase({ brief: ownText(action, params) }).mode;
}

/** Réponses d'approfondissement envoyées avec la légende de carrousel (valeurs seules, bornées). */
export function captionAnswersText(answers: unknown): string {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return "";
  return Object.values(answers as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => `- ${v.trim()}`)
    .join("\n")
    .slice(0, 3000);
}

/** Consigne « Ton cas d'abord » adaptée à la famille (texte pour l'IA, adapté de SOCLE_FAMILLES). */
const CASE_BY_FAMILY: Partial<Record<AngleFamily, string>> = {
  B: "CAS CLIENT : le cas fourni est la preuve, raconté à la 3e personne (« ma cliente », « elle »), jamais comme son vécu à elle. Les chiffres de la cliente et ses mots entre guillemets seulement s'ils sont fournis.",
  C: "ACTU : l'actu déclenche, sa position porte le texte. Pose le fait vite et juste avec sa source, puis ce qu'elle en pense et ce que ça dit de son métier. Le sujet ou l'accroche proposés ne sont pas son vécu : n'invente ni ressenti, ni scène, ni cliente.",
  E: "LISTE / ÉTAPES : si elle a donné son cas, il illustre un élément, il ne remplace pas la liste.",
  F: "COMPARATIF : son cas, s'il est fourni, est l'un des deux états comparés.",
  G: "OFFRE : l'histoire de la marque et de ce qu'elle propose reste, même quand un prix est donné.",
  H: "IDENTIFICATION : la scène est généralisée ; aucun vécu inventé à sa place.",
  I: "QUESTIONS-RÉPONSES : une réponse peut citer son cas, s'il est fourni.",
  K: "SON TEXTE EST LA SOURCE : chaque version reprend ce qu'il contient (son vécu, ses chiffres, son avant/après, ses mots, en première personne quand elle parle d'elle). Aucune recherche, aucun chiffre, aucune scène, aucune cliente ni aucun souvenir ne s'y ajoutent. Pas de lecture générale en « on » ou « nous » à la place de son récit.",
};

/** Règle 3 : une idée par paragraphe, longueur selon la matière. */
export const LINKEDIN_ONE_IDEA_RULE = "UNE IDÉE PAR PARAGRAPHE : chaque paragraphe porte une seule idée, développée en phrases complètes (pas une phrase isolée par ligne). Un paragraphe qui porte deux idées se découpe en deux ; on ne raccourcit pas, on ne résume pas, on ne retire ni exemple, ni nuance, ni passage de son vécu pour faire court. La longueur suit la matière : aucun nombre de paragraphes, de stories ou de caractères à remplir.";

/** Bloc socle à ajouter au prompt système d'une action (chaîne vide hors actions de rédaction). */
export function linkedInSocleBlock(action: string, params: Record<string, unknown> = {}): string {
  if (!isSocleAction(action)) return "";
  const family = linkedInAiFamily(action, params);
  const mode = linkedInAiCaseMode(action, params);
  const parts: string[] = [];
  if (mode === "own_case") parts.push(LIVED_CASE_FIRST);
  else if (mode === "news_feeling") parts.push(NEWS_FEELING_FIRST);
  if (action === "summary") {
    parts.push("SES ÉLÉMENTS D'ABORD : le résumé se construit avec ce qu'elle a fourni (sa passion, son parcours, ce qu'elle propose) et le contexte de sa marque. Aucun chiffre, aucune durée, aucune date, aucun client ni résultat absents de ces éléments : une accroche « stat choc » ou « il y a X ans » seulement avec un chiffre ou une durée fournis.");
  } else if (family && CASE_BY_FAMILY[family]) {
    parts.push(CASE_BY_FAMILY[family]!);
  }
  if (action !== "summary") parts.push(LINKEDIN_ONE_IDEA_RULE);
  return parts.join("\n\n");
}
