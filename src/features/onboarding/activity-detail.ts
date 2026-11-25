// Une seule question sur l'activité dans le questionnaire d'accueil (25/11/2026).
//
// L'écran 1 demande « Tu fais quoi ? ». L'écran 2 redemandait la même chose
// (« Et concrètement, tu fais quoi ? »), pré-rempli avec la réponse de l'écran 1.
// Quand l'écran 1 est rempli, la question 2 n'est plus posée et c'est la réponse
// de l'écran 1 qui part dans les mêmes cases : `profiles.activity_detail` et
// « Détail de l'activité » de la consigne du diagnostic.

/** Longueur à partir de laquelle l'écran 1 compte comme rempli (même seuil que sa validation). */
const MIN_ACTIVITE = 2;

type ActivityAnswers = { activite?: string | null; activity_detail?: string | null };

/** Faut-il encore poser « Et concrètement, tu fais quoi ? » à l'écran 2 ? */
export function needsActivityDetailQuestion(activite?: string | null): boolean {
  return (activite ?? "").trim().length < MIN_ACTIVITE;
}

/**
 * Le détail d'activité à enregistrer et à envoyer au diagnostic.
 * Écran 1 rempli → sa réponse (un ancien détail resté dans un brouillon n'est
 * plus visible à l'écran, donc plus envoyé). Sinon → ce qui a été saisi à l'écran 2.
 */
export function effectiveActivityDetail(answers: ActivityAnswers): string {
  const activite = (answers.activite ?? "").trim();
  if (!needsActivityDetailQuestion(activite)) return activite;
  return (answers.activity_detail ?? "").trim();
}
