// Étapes du parcours /creer et choix de l'étape à rouvrir au rechargement.
// Sorti à l'identique de CreerUnifie.tsx (lot C, docs/robustesse/gros-fichiers.md, fiche 1).
import type { loadFlowState } from "@/hooks/use-flow-persistence";

export type Step = "idea" | "format" | "questions" | "hook_selection" | "structure_review" | "inspiration_proposals" | "user_slides" | "result" | "edit";

type PersistedFlow = ReturnType<typeof loadFlowState>;

// Mapping vers les formats canoniques de CreerUnifie/use-content-generator
// Couvre les valeurs venues du calendrier ET de saved_ideas (boîte à idées).
export const FORMAT_MAP: Record<string, string> = {
  "post_photo": "post",
  "post_texte": "post",
  "post_carrousel": "carousel",
  "carrousel": "carousel",
  "story_serie": "story",
};
export const SUPPORTED_FORMATS = new Set([
  "post", "carousel", "reel", "story", "linkedin",
  "newsletter", "pinterest", "pinterest_visual", "pinterest_inspiration", "pinterest_photo",
]);

// Paramètres d'URL à usage unique, retirés une fois l'init consommée.
export const ONE_SHOT_PARAMS = ["sujet", "subject", "format", "objectif", "objective", "auto", "angle", "carouselSubMode", "firstProduct", "sujetSansPhoto", "ideaSansPhoto", "idea_id"];

/** Une génération a été coupée par un rechargement (ou une fermeture) : l'étape
 * résultat était ouverte, la génération lancée depuis moins de 30 min, et rien
 * d'exploitable n'a été reçu. */
const INTERRUPTED_GENERATION_MAX_AGE_MS = 30 * 60_000;
export function isInterruptedGeneration(ps: PersistedFlow, now = Date.now()): boolean {
  if (!ps || ps.step !== "result" || ps.result) return false;
  if ((ps.pendingStream?.text?.length ?? 0) > 40) return false;
  const ts = Number(ps.generationInFlight?.ts) || 0;
  return ts > 0 && now - ts < INTERRUPTED_GENERATION_MAX_AGE_MS;
}

// Restore step — allow "result" and "edit" if their data is available
export function resolveSafeStep(ps: PersistedFlow, { canalConflict, hasIdea, photoCount }: { canalConflict: boolean; hasIdea: boolean; photoCount: number }): Step {
  if (!ps?.step) return "idea";
  // Canal forcé ≠ canal du brouillon → on repart au choix du format sur le bon canal.
  if (canalConflict) {
    return hasIdea ? "format" : "idea";
  }
  if (ps.step === "result" && ps.result) return "result";
  // Génération interrompue (reload/fermeture mi-streaming) : le crédit est déjà
  // débité — on restaure le texte déjà écrit au lieu de renvoyer à l'étape format.
  if (ps.step === "result" && !ps.result && (ps.pendingStream?.text?.length ?? 0) > 40) return "result";
  // Rechargement en pleine génération SANS texte reçu (LinkedIn, newsletter,
  // carrousel : le texte n'arrive qu'à la fin ; post pendant ses 1res secondes) :
  // on reste sur l'étape résultat, qui annonce l'interruption et propose de
  // relancer, au lieu de renvoyer à l'étape 2 sans un mot (15/10/2026).
  if (isInterruptedGeneration(ps)) return "result";
  if (ps.step === "edit" && ps.editContent) return "edit";
  // structure_review dépend de `structureProposal`, qui n'est PAS persisté →
  // au reload il repart à null et l'écran serait vide. On retombe donc sur
  // l'étape format (ou idée) plutôt que sur un écran mort.
  if (ps.step === "structure_review") {
    return ps.selectedFormat ? "format" : "idea";
  }
  // hook_selection dépend des hooks générés, non persistés → au reload
  // l'écran serait vide. On retombe sur format (mêmes raisons que structure_review).
  if (ps.step === "hook_selection") {
    return ps.selectedFormat ? "format" : "idea";
  }
  // Le brouillon « Mes slides » est persisté, y compris avant le design.
  if (ps.step === "user_slides") {
    return "user_slides";
  }
  // Si flow photo/mix/pure_photo avec photos retrouvées, garder le step en cours
  if (["questions", "inspiration_proposals"].includes(ps.step)) {
    const isPhotoFlow = ps.carouselSubMode === "photo" || ps.carouselSubMode === "mix" || ps.carouselSubMode === "pure_photo";
    if (isPhotoFlow && photoCount > 0) return ps.step as Step;
    // Questions persistées → on peut restaurer l'étape telle quelle (elles
    // sont réhydratées dans useContentGenerator par l'effet de mount plus
    // bas). Sans ça, un reload en pleines questions renvoyait à l'étape
    // format et RÉGÉNÉRAIT d'autres questions (réponses orphelines).
    if (ps.step === "questions" && (ps.questions?.length ?? 0) > 0) return "questions";
    // Mode 1er contenu : le récap « Générer mon premier contenu » se suffit
    // du sujet (pas besoin des questions) → on y revient tel quel.
    if (ps.step === "questions" && ps.autoFlow && ps.ideaText) return "questions";
    return ps.selectedFormat ? "format" : "idea";
  }
  // États avec données volatiles non persistées (result/edit invalides)
  if (["result", "edit"].includes(ps.step)) {
    return ps.selectedFormat ? "format" : "idea";
  }
  return ps.step as Step;
}
