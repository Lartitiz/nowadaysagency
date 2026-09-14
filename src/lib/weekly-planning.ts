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
