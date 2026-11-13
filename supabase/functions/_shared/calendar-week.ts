/** Calendar weeks use date-only values; UTC arithmetic avoids DST shifts. */
export function calendarWeek(start?: string, now = new Date()) {
  const date = start ? new Date(`${start}T12:00:00Z`) : new Date(now);
  if (Number.isNaN(date.getTime()) || (start && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || date.toISOString().slice(0, 10) !== start))) throw new Error("invalid_calendar_week");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}

export const WEEK_DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Date du jour à Paris (AAAA-MM-JJ), repli quand le client n'envoie pas la sienne. */
export function parisToday(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Jours encore à venir dans la semaine (aujourd'hui compris). Une semaine
 *  entièrement future, ou entièrement passée (choisie exprès), garde ses 7 jours. */
export function remainingWeekDays(week: { from: string; to: string }, today: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || today <= week.from || today > week.to) return [...WEEK_DAY_NAMES];
  const offset = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${week.from}T12:00:00Z`)) / 86_400_000);
  return WEEK_DAY_NAMES.slice(offset);
}

/** Replace sur les jours permis les contenus que l'IA aurait posés sur un jour
 *  passé ou inconnu : jours libres d'abord, puis à la suite. */
export function keepPlanInDays<T extends { day?: string }>(plan: T[], days: string[]): T[] {
  if (!days.length) return plan;
  const used = new Set(plan.map((p) => p.day).filter((d) => d && days.includes(d)));
  const free = days.filter((d) => !used.has(d));
  let next = 0;
  return plan.map((p) => {
    if (p.day && days.includes(p.day)) return p;
    const day = free.length ? free.shift()! : days[next++ % days.length];
    return { ...p, day };
  });
}
