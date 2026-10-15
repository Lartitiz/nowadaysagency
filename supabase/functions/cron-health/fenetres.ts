// cron-health, scope weekly : fenêtres de temps (semaine en cours, semaine d'avant,
// cohortes). Fonctions pures, bornes `t >= from && t < to` (fiche 18, lot 4).
import { DAY } from "./lecture.ts";

export const inWindow = (iso: string | null, from: number, to: number) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from && t < to;
};
export const week = (now: number, offset: number) => [now - (offset + 1) * 7 * DAY, now - offset * 7 * DAY] as const;
