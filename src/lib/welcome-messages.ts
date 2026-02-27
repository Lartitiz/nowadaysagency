/* ── Welcome message helper ── */

const MORNING = [
  (n: string) => `Salut ${n} ! Café en main, on avance sur ta com' ?`,
  (n: string) => `Hello ${n} ! Belle journée pour faire avancer ta visibilité.`,
  (n: string) => `${n}, c'est le matin, c'est frais, c'est le moment parfait pour ta com'.`,
];

const AFTERNOON = [
  (n: string) => `Hey ${n} ! On s'y remet ?`,
  (n: string) => `${n} ! Prête à avancer un peu sur ta com' ?`,
];

const EVENING = [
  (n: string) => `${n}, session du soir ? Parfois c'est là qu'on a les meilleures idées.`,
  (n: string) => `Hey ${n} ! Une petite session com' avant de décrocher ?`,
];

const FIRST_VISIT = (n: string) =>
  `Bienvenue ${n} ! Je suis ton assistant com'. On va structurer ta communication ensemble, pas à pas.`;

const COMEBACK = (n: string) =>
  `Content·e de te revoir ${n} ! Ça fait un moment. On reprend doucement ?`;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a contextual welcome message.
 * @param firstName - User's first name
 * @param hour - Current hour (0-23)
 * @param isFirstVisit - Whether this is the user's first visit
 * @param daysSinceLastVisit - Days since the user's last visit (null if unknown)
 */
export function getWelcomeMessage(
  firstName: string,
  hour: number = new Date().getHours(),
  isFirstVisit = false,
  daysSinceLastVisit: number | null = null,
): string {
  if (isFirstVisit) return FIRST_VISIT(firstName);
  if (daysSinceLastVisit !== null && daysSinceLastVisit > 7) return COMEBACK(firstName);

  if (hour >= 6 && hour < 12) return pick(MORNING)(firstName);
  if (hour >= 12 && hour < 18) return pick(AFTERNOON)(firstName);
  return pick(EVENING)(firstName);
}
