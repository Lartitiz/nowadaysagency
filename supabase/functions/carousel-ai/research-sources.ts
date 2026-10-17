// Faits trouvés sur le web et repris dans le carrousel (choix de Laetitia du
// 16/10/2026) : chacun arrive dans « Pistes de relecture » avec le lien de la
// page qui le porte, pour qu'elle vérifie le chiffre avant de publier.

import { carouselEditorialFields } from "../_shared/carousel-editorial-review.ts";
import { citesSource, type ResearchLink } from "../_shared/depth-research.ts";

/** Début des pistes « source web » (l'appli les range dans « Pistes de relecture »). */
export const RESEARCH_WARNING_PREFIX = "Fait trouvé sur le web";

export function researchSourceWarnings(doc: any, links: ResearchLink[] | undefined): string[] {
  if (!links?.length) return [];
  const fields = carouselEditorialFields(doc);
  const defects: any[] = Array.isArray(doc?.progression_review?.report?.defects) ? doc.progression_review.report.defects : [];
  const out: string[] = [];
  for (const link of links) {
    const slides = new Set<number>();
    let caption = false;
    // Test réel du 17/10/2026 : le fait était repris SANS sa source ; le juge,
    // qui voit la recherche, la nommait (« (DGCCRF, 2022) ») sans lien affiché.
    for (const d of defects) {
      if (d?.type !== "unsupported" || typeof d.reason !== "string" || !citesSource(d.reason, link)) continue;
      for (const id of Array.isArray(d.slide_ids) ? d.slide_ids : []) {
        const n = Number(String(id).match(/^slides\.(\d+)$/)?.[1]);
        if (Number.isInteger(n) && n >= 0 && n < (doc.slides?.length ?? 0)) slides.add(n + 1);
      }
    }
    for (const f of fields) {
      if (!citesSource(f.text, link)) continue;
      const at = f.path.indexOf("slides");
      if (at >= 0 && typeof f.path[at + 1] === "number") slides.add((f.path[at + 1] as number) + 1);
      else caption = true;
    }
    const nums = [...slides].sort((a, b) => a - b);
    const place = nums.length ? `slide${nums.length > 1 ? "s" : ""} ${nums.join(", ")}` : caption ? "légende" : "";
    if (place) out.push(`${RESEARCH_WARNING_PREFIX} (${place}) : « ${link.name} ». Vérifie le chiffre sur la page avant de publier : ${link.url}`);
  }
  return out;
}
