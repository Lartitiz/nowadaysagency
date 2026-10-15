// Contrat de données de la relecture de marque (fiche envoyée par
// diagnostic-enrichment) et liste des 7 cartes. Sorti de BrandingReview.tsx
// (fiche 14 de docs/robustesse/gros-fichiers.md, lot 1).

export interface AnalysisResult {
  story?: { confidence?: string; origin?: string; trigger?: string; struggles?: string; uniqueness?: string; vision?: string; full_story?: string };
  persona?: { confidence?: string; name?: string; age_range?: string; job?: string; description?: string; goals?: string[]; frustrations?: string[]; desires?: string[]; channels?: string[]; brands_they_follow?: string[]; beautiful_world?: string; first_actions?: string };
  value_proposition?: { confidence?: string; key_phrase?: string; problem?: string; solution?: string; differentiator?: string; proofs?: string[] };
  tone_style?: { confidence?: string; tone_keywords?: string[]; voice_description?: string; tone_register?: string; tone_level?: string; tone_style_chip?: string; tone_humor?: string; tone_engagement?: string; i_do?: string[]; i_never_do?: string[]; fights?: string[]; key_expressions?: string; things_to_avoid?: string; target_verbatims?: string; channels?: string[]; visual_style?: string };
  content_strategy?: { confidence?: string; pillars?: string[]; creative_twist?: string; formats?: string[]; rhythm?: string; editorial_line?: string };
  offers?: { confidence?: string; offers?: { name?: string; price?: string; description?: string; target?: string; promise?: string }[] };
  charter?: { confidence?: string; color_primary?: string; color_secondary?: string; color_accent?: string; color_background?: string; font_title?: string; font_body?: string; mood_keywords?: string[]; visual_style_description?: string };
  /** Reprise d'onboarding confirmée : valider une section écrase l'existant. */
  allow_overwrite?: boolean;
  reviewed_sections?: string[];
  sources_used?: string[];
  sources_failed?: string[];
  overall_confidence?: string;
  missing_info?: string;
}

export const COACHING_SECTION_MAP: Record<SectionKey, string> = {
  story: "story",
  persona: "persona",
  value_proposition: "value_proposition",
  tone_style: "tone_style",
  content_strategy: "content_strategy",
  offers: "offers",
  charter: "charter",
};

export const SECTIONS = [
  { key: "story", title: "Ton histoire", emoji: "📖" },
  { key: "persona", title: "Ton·ta client·e idéal·e", emoji: "👤" },
  { key: "value_proposition", title: "Ta proposition de valeur", emoji: "💎" },
  { key: "tone_style", title: "Ton & style", emoji: "🎙️" },
  { key: "content_strategy", title: "Ta stratégie de contenu", emoji: "🍒" },
  { key: "offers", title: "Tes offres", emoji: "🎁" },
  { key: "charter", title: "Ta charte graphique", emoji: "🎨" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export interface OfferItem { name?: string; price?: string; description?: string; target?: string; promise?: string }

export type CharterData = NonNullable<AnalysisResult["charter"]>;
