// Relectures par l'IA des contenus générés, une par format, et passes factuelles.
//
// Sommaire (découpage du 14/10/2026, docs/robustesse/gros-fichiers.md fiche 9) :
// chaque mission a son fichier dans _shared/correction-pass/, ce fichier les
// réexporte par leur nom pour que les imports existants ne changent pas.
//   - options.ts        réglages, choix du modèle, prompt « fidélité aux sources »
//   - prompts.ts        prompts de relecture par format et du carrousel balisé
//   - fields.ts         extraction et réinjection des textes (sans IA)
//   - polish-scan.ts    faut-il relire ce carrousel ? (sans IA)
//   - passes.ts         relectures texte, carrousel, stories, reel
//   - factual-passes.ts sources des chiffres, témoignages inventés, chiffres en trop
export type { CorrectionFormat, CorrectionOptions } from "./correction-pass/options.ts";
export { correctionModel, sourceFirstCorrectionPrompt, unwrapCorrectionOutput } from "./correction-pass/options.ts";
export { CORRECTION_PROMPTS } from "./correction-pass/prompts.ts";
export {
  extractCarouselTexts,
  extractNewsletterTexts,
  extractStoriesTexts,
  keepUnlessRealEdit,
  reinjectCarouselTexts,
  reinjectNewsletterTexts,
  reinjectStoriesTexts,
  storiesAuditableText,
} from "./correction-pass/fields.ts";
export { carouselNeedsPolish } from "./correction-pass/polish-scan.ts";
export {
  applyCorrectionPass,
  applyCorrectionPassCarousel,
  applyCorrectionPassReel,
  applyCorrectionPassStories,
} from "./correction-pass/passes.ts";
export {
  applyResearchExcessPass,
  applyResearchSourcingPass,
  applyTestimonyRemovalPass,
  RESEARCH_EXCESS_PROMPT,
  RESEARCH_SOURCING_PROMPT,
  TESTIMONY_REMOVAL_PROMPT,
} from "./correction-pass/factual-passes.ts";
