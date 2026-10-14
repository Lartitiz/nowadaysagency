// Déplacé à l'identique depuis _shared/correction-pass.ts (lot 2 du découpage,
// 14/10/2026, docs/robustesse/gros-fichiers.md fiche 9). correction-pass.ts le réexporte.

import { CONTENT_CLARITY_RULES } from "../content-clarity.ts";
import { getModelForAction, type AnthropicModel } from "../anthropic.ts";

export type CorrectionFormat = "linkedin" | "carousel" | "newsletter" | "instagram_caption" | "reel" | "stories";

export interface CorrectionOptions {
  /** Contextual, exact-patch review; enabled only by the carousel generator. */
  semanticReview?: boolean;
  /** Original generated draft for the bounded verification; never factual evidence. */
  reviewBaseline?: string;
  /** Current request (facts AND tone/limits), separate from general reference material. */
  currentBrief?: string;
  /** Phrases écrites par la personne pour ce contenu, à préserver (pas le branding général). */
  authoredText?: string;
  /** Faits source disponibles pour vérifier les précisions ajoutées au brouillon. */
  sourceContext?: string;
  /** Skip correction si le contenu est plus court que ce nombre de caractères */
  skipIfShorterThan?: number;
  /**
   * Instructions ciblées ajoutées à la demande de correction (quality-gate
   * rédactionnel : phrases précises à réécrire, mesurées en code). Quand ce champ
   * est présent, la passe est une re-passe chirurgicale, pas une relecture large.
   */
  extraInstructions?: string;
  /** Skip correction si null/undefined */
  enabled?: boolean;
  /** Logger optionnel pour debug */
  logger?: (msg: string) => void;
  /**
   * Modèle de correction sans source (défaut : modèle "content").
   * Avec source, la vérification sémantique utilise le modèle "content" :
   * les essais réels ont montré que Haiku gardait des faits non étayés.
   * Le plafond abortTimeoutMs reste inchangé.
   */
  model?: AnthropicModel;
  /**
   * Plafond (ms) de l'appel IA de la passe de correction. undefined = pas d'abort
   * (comportement historique conservé pour les appelants existants qui ne le
   * renseignent pas). À poser sur les appelants qui bornent déjà leur appel
   * principal, pour éviter la cascade principal+correction non bornée.
   */
  abortTimeoutMs?: number;
}

/** Remove only a complete outer transport wrapper, never quotes within the prose. */
export function unwrapCorrectionOutput(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  const quoted = text.match(/^"""\s*([\s\S]*?)\s*"""$/);
  return quoted ? quoted[1].trim() : text;
}

/** Source fidelity is semantic work; use the configured content model within the existing timeout. */
export function correctionModel(options: CorrectionOptions): AnthropicModel {
  return options.sourceContext?.trim() || options.authoredText?.trim()
    ? getModelForAction("content")
    : options.model ?? getModelForAction("content");
}

/** A focused source review avoids imposing a second, competing writing voice. */
export function sourceFirstCorrectionPrompt(options: CorrectionOptions, fallback: string): string {
  if (!options.sourceContext?.trim() && !options.authoredText?.trim()) return fallback + "\n" + CONTENT_CLARITY_RULES;
  return `Tu relis le brouillon d'une personne en vérifiant sa fidélité aux sources.
COMPRÉHENSION DU SUJET : les faits du brief actuel font autorité. Un métier, une valeur de marque ou un souhait de l'audience ne prouve rien sur ce produit précis.
Supprime ou reformule uniquement les affirmations non étayées : fabrication ou conception par la personne, anecdotes vécues, témoignages, résultats, durées, disponibilité et rareté. N'invente aucun détail de remplacement. Une image ou une opinion peut rester si elle ne se présente pas comme un fait ou un vécu absent des sources : une opinion n'a pas besoin de source. Garde la position assumée en première personne, la lecture collective (« on », « nous ») et les émotions courantes nommées comme une expérience partagée. Supprime en revanche une précaution sur ce que le texte n'affirme pas (« sans garantie », « hypothèse de travail », « je n'affirme rien sur l'algorithme »).
Préserve les bonnes phrases, la personne grammaticale, le registre, l'humour, les nuances, le scénario et la structure du brouillon. N'ajoute ni familiarité, ni aparté, ni punchline, ni question finale pour rendre le texte humain. Ne raccourcis pas mécaniquement.
Corrige les défauts précis signalés et les effets préfabriqués ajoutés, notamment « X. Pas Y. » et « Ce n'est pas X, c'est Y ». Garde les négations factuelles et les citations explicitement fournies. Remplace une formule creuse par une formulation précise issue des sources, ou supprime-la sans ajouter de slogan.
Respecte les contraintes du brief sur le ton, la longueur et la fin du contenu. N'ajoute pas de faits pour atteindre une longueur.
Renvoie uniquement le texte corrigé. Si le texte comporte des marqueurs entre crochets, conserve TOUS les marqueurs exactement, dans le même ordre, avec chaque texte dans son champ. Ne fusionne ni ne supprime les champs. Ne produis ni commentaire, ni bilan, ni balise Markdown.`;
}
