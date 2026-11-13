import { toLocalDateStr } from "@/lib/utils";

const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export function planningDayDate(day: string, weekStart: string): string {
  const index = days.indexOf(day);
  const date = new Date(`${weekStart}T12:00:00`);
  if (index < 0 || Number.isNaN(date.getTime()) || toLocalDateStr(date) !== weekStart) throw new Error("Choisis un jour valide dans la semaine affichée.");
  date.setDate(date.getDate() + index);
  return toLocalDateStr(date);
}
export function planningChannel(format: string, selected: string): string {
  if (format === "newsletter") return "newsletter";
  if (format === "linkedin") return "linkedin";
  if (format.startsWith("pinterest")) return "pinterest";
  return selected === "all" ? "instagram" : selected;
}
export function planningFormat(format: string, canal: string): string {
  if (canal === "newsletter") return "newsletter";
  if (canal === "linkedin") return format === "carousel" ? "carousel" : "linkedin";
  if (canal === "pinterest") return "pinterest";
  return format === "carousel" ? "post_carrousel" : ["story", "story_serie"].includes(format) ? "story_serie" : format;
}

/** Jours encore à venir de la semaine (aujourd'hui compris) ; une semaine qui
 *  n'est pas en cours garde ses 7 jours. Miroir de remainingWeekDays (edge). */
export function remainingPlanningDays(weekStart: string, today: string): string[] {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  if (Number.isNaN(start.getTime()) || today <= weekStart || today > toLocalDateStr(end)) return [...days];
  const offset = Math.round((new Date(`${today}T12:00:00`).getTime() - start.getTime()) / 86_400_000);
  return days.slice(offset);
}

/** « du 9 au 15 novembre », « du 30 novembre au 6 décembre ». */
export function planningWeekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const month = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long" });
  const first = start.getDate() === 1 ? "1er" : String(start.getDate());
  return start.getMonth() === end.getMonth()
    ? `du ${first} au ${end.getDate()} ${month(end)}`
    : `du ${first} ${month(start)} au ${end.getDate()} ${month(end)}`;
}
