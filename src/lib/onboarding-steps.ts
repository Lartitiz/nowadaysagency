/* Enchaînement des écrans de questions de l'onboarding.

   Le 15/10/2026, deux écrans ont été fusionnés : le temps par semaine (7) est
   demandé avec l'objectif (5), et « ce qui te rend différente » (9) avec « ce
   que tu changerais » (8). On garde la numérotation (brouillons enregistrés,
   diagnostic en 10, résultat en 11) et on saute simplement ces deux numéros. */

const QUESTION_STEPS = [0, 1, 2, 3, 4, 5, 6, 8];
const SKIPPED_STEPS = new Set([7, 9]);

export function nextOnboardingStep(step: number): number {
  let n = step + 1;
  while (SKIPPED_STEPS.has(n)) n++;
  return n;
}

export function prevOnboardingStep(step: number): number {
  let n = Math.max(0, step - 1);
  while (n > 0 && SKIPPED_STEPS.has(n)) n--;
  return n;
}

/** Rang de l'écran parmi ceux montrés (un ancien numéro sauté compte comme
 *  l'écran qui l'a absorbé). */
function questionRank(step: number): number {
  const shown = SKIPPED_STEPS.has(step) ? step - 1 : step;
  const i = QUESTION_STEPS.indexOf(shown);
  return i === -1 ? QUESTION_STEPS.length : i;
}

/** Barre de progression (en %), « dotée » : jamais sous 15 %. */
export function onboardingProgress(step: number, totalSteps: number): number {
  if (step === 0) return 15;
  if (step >= totalSteps - 1) return 100;
  return Math.max(15, ((questionRank(step) + 1) / (QUESTION_STEPS.length + 1)) * 100);
}

/** Temps restant annoncé : ~15 s par écran de questions (mesuré le 15/10/2026). */
export function onboardingTimeRemaining(step: number): string {
  const stepsLeft = QUESTION_STEPS.length - 1 - questionRank(step);
  if (stepsLeft <= 1) return "Presque fini !";
  if (stepsLeft <= 3) return "Plus qu'une minute";
  return "Environ 2 minutes de questions";
}
