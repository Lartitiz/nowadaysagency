// Idées de la semaine du rituel hebdo — V2 in-app.
//
// ⚠️ SYNCHRO : ce fichier duplique VOLONTAIREMENT le pool et la rotation de
// l'edge `supabase/functions/email-trigger/index.ts` (WEEKLY_IDEA_POOL +
// isoWeekNumber + weeklyIdeas). Les edges et le front ne partagent pas de
// code ; la rotation étant déterministe (numéro de semaine ISO), les deux
// calculent la MÊME liste sans stockage ni appel réseau. Si tu modifies le
// pool ici, modifie-le aussi dans email-trigger (et inversement).

export const WEEKLY_IDEA_POOL = [
  "Une erreur que tu vois souvent dans ton domaine (et quoi faire à la place)",
  "Les coulisses de ton dernier projet ou de ta semaine",
  "Un avis à contre-courant sur ton métier",
  "Une question qu'on te pose tout le temps — réponds-y publiquement",
  "Ce que tu aurais aimé savoir en débutant",
  "Présente une de tes offres autrement (par le résultat, pas la prestation)",
  "Un retour client ou un moment de fierté récent",
  "Un mythe à déconstruire dans ton secteur",
  "Ta routine ou ton outil préféré pour t'organiser",
  "Pourquoi tu fais ce métier — ton « pourquoi » en une histoire",
  "3 conseils rapides que tu donnerais à ta cliente idéale",
  "Avant / après : une transformation que tu as permise",
  "Une décision difficile que tu as prise dans ton activité",
  "Ce qui te différencie vraiment de la concurrence",
  "Un coup de cœur (livre, compte, ressource) à partager",
  "Une journée type dans ton activité",
  "Un échec dont tu as tiré une leçon",
  "Réagis à une actu ou une tendance de ton secteur",
  "Réponds à l'objection n°1 de tes prospects",
  "Montre ton process étape par étape",
];

export function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** Les 5 idées de la semaine courante — identiques à celles de l'e-mail du rituel. */
export function weeklyIdeas(now: Date = new Date()): string[] {
  const week = isoWeekNumber(now);
  const start = (week * 5) % WEEKLY_IDEA_POOL.length;
  return Array.from({ length: 5 }, (_, i) => WEEKLY_IDEA_POOL[(start + i) % WEEKLY_IDEA_POOL.length]);
}
