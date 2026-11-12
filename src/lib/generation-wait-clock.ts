/**
 * Chrono de l'attente d'une création, du clic au résultat (QA du 12/11/2026).
 *
 * Un carrousel photo enchaîne deux écrans d'attente : le plan des slides
 * (CarouselStructureLoader), puis la rédaction (CreerStepResult). Chacun
 * comptait depuis son propre début : « Déjà 22 s » après une vraie minute.
 * Les deux écrans lisent ici le même départ : une phase qui démarre peu après
 * la fin de la précédente (ou pendant) continue le même chrono.
 */
const CHAIN_MS = 5000;

let startedAt: number | null = null;
let endedAt: number | null = null;

/** Une phase d'attente commence : renvoie le départ du chrono (le clic). */
export function waitPhaseStarted(now = Date.now()): number {
  const chained = startedAt !== null && (endedAt === null || now - endedAt <= CHAIN_MS);
  if (!chained) startedAt = now;
  endedAt = null;
  return startedAt as number;
}

/** La phase d'attente se termine (résultat, erreur ou écran quitté). */
export function waitPhaseEnded(now = Date.now()): void {
  if (startedAt !== null && endedAt === null) endedAt = now;
}

/** Pour les tests. */
export function resetWaitClock(): void {
  startedAt = null;
  endedAt = null;
}
