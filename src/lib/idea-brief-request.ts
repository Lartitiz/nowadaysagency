import { isIdeaBrief, ideaAngleLabel } from "../../supabase/functions/_shared/ideas/contract";

/** Only v1 coach briefs are adapted. Legacy angle IDs and unrelated calls stay intact. */
export function withIdeaBrief(functionName: string, body: any): any {
  if (!body || !["carousel-ai", "creative-flow", "pinterest-visual"].includes(functionName)) return body;
  const brief = [body.editorial_angle, body.editorialFormat, body.editorialFormatLabel, body.pin_type, body.angle?.title].find(isIdeaBrief);
  if (!brief) return body;
  const next = { ...body };
  if (isIdeaBrief(body.angle?.title)) next.angle = { ...body.angle, title: ideaAngleLabel(body.angle.title) };
  for (const key of ["editorial_angle", "editorialFormat", "editorialFormatLabel", "pin_type"]) {
    if (isIdeaBrief(next[key])) next[key] = key === "pin_type" ? "infographie" : ideaAngleLabel(next[key]).slice(0, 80);
  }
  const material = `MATIÈRE ÉDITORIALE CHOISIE (proposition, pas un témoignage personnel). Développer l'explication, préserver les nuances et les sources. Les exemples fictifs restent fictifs. Ne pas présenter les points à vérifier comme des faits.\n${brief}`;
  if (functionName === "carousel-ai") {
    next.deepening_answers = { ...body.deepening_answers, "Brief éditorial choisi": material };
  } else if (functionName === "creative-flow") {
    // Every creative-flow branch, including questions/Reels/stories, uses context.
    next.context = `${body.context || ""}\n\n${material}`;
    if (next.context.length > 8000) throw new Error("Le brief est trop long pour ce format. Raccourcis les précisions avant de générer.");
  } else {
    next.subject = `${body.subject || ""}\n\n${material}`;
  }
  return next;
}
