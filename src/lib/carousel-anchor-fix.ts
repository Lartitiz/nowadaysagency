/**
 * Le dessin (IA) étiquette parfois « titre » le texte d'une slide qui n'a pas
 * de titre (ou « texte » celui d'une slide qui n'a qu'un titre). Le champ
 * source étant vide, la remise en accord faite à l'ouverture du carrousel
 * (`readCarouselDocument`) EFFAÇAIT ce texte, sur la slide et dans les données
 * (vu en ligne le 24/11/2026 : slide livrée vide au premier carrousel).
 * Quand le texte affiché est exactement celui de l'autre champ, c'est
 * l'étiquette qui est fausse : on la remet sur le bon champ, sans rien effacer.
 */
type AnchoredSlide = { html: string; data: Record<string, unknown> };

const flat = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

function fixOne<T extends AnchoredSlide>(slide: T): T {
  if (!slide.html.includes("data-slide-text")) return slide;
  const doc = new DOMParser().parseFromString(slide.html, "text/html");
  let changed = false;
  for (const field of ["title", "body"] as const) {
    const other = field === "title" ? "body" : "title";
    const el = doc.body.querySelector<HTMLElement>(`[data-slide-text="${field}"]`);
    if (!el || flat(slide.data[field]) || !flat(el.textContent)) continue;
    if (flat(el.textContent) !== flat(slide.data[other])) continue;
    if (doc.body.querySelector(`[data-slide-text="${other}"]`)) continue;
    el.setAttribute("data-slide-text", other);
    if (el.hasAttribute("data-pptx-editable")) el.setAttribute("data-pptx-editable", other);
    changed = true;
  }
  // Même sérialisation que l'éditeur : les <style>/<link> de tête sont hissés dans <head>.
  return changed ? { ...slide, html: doc.head.innerHTML + doc.body.innerHTML } : slide;
}

export function fixMisplacedAnchors<T extends AnchoredSlide>(slides: T[]): T[] {
  return slides.map(fixOne);
}
