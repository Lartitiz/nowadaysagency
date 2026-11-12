// « Tout corriger » (12/11/2026) : applique d'un coup les corrections que
// l'éditeur sait faire seul, sans IA ni crédit :
//   - taille de texte trop petite → taille conseillée (même valeur que
//     « Appliquer la correction ») ;
//   - texte qui ressort peu → noir ou blanc (idem) ;
//   - texte coupé → taille réduite jusqu'à ce qu'il tienne, sans passer sous
//     la taille lisible sur mobile.
// Chaque slide est ouverte dans un cadre caché (même mesure que le contrôle
// qualité), retouchée, puis relue : ce qui reste est rendu tel quel pour être
// dit à l'utilisatrice. Rien n'est enregistré ici : l'éditeur applique les
// retouches en une seule étape d'Annuler.
import {
  collectInspectables,
  findClippedIds,
  inspectSlide,
  readableFloorPx,
  brokenImageIssue,
  withSlideFrame,
  type QualityIssue,
} from "@/lib/carousel-quality";
import { patchElement, type CarouselDocument } from "@/lib/carousel-editor";

export interface FixPatch {
  slideId: string;
  elementId: string;
  styles: Record<string, string>;
}
export interface FixAllResult {
  patches: FixPatch[];
  /** Points encore signalés après correction (à faire à la main). */
  remaining: QualityIssue[];
  /** Slides verrouillées qui ont des points signalés (non touchées). */
  lockedSlides: number[];
}

/** Les points que « Tout corriger » traite (ceux des pastilles sur la slide). */
export const FIXABLE_KINDS: QualityIssue["kind"][] = ["overflow", "size", "contrast"];
const REPORTED = (i: QualityIssue) => i.kind !== "margin" && i.kind !== "manual";
const isLocked = (el: Element) => !!el.closest("[data-editor-locked]");

function fixSlide(doc: Document, slide: number): { patches: Omit<FixPatch, "slideId">[]; remaining: QualityIssue[] } {
  const view = doc.defaultView!;
  const byId = (id: string) => doc.querySelector<HTMLElement>(`[data-editor-id="${id}"]`);
  const touched = new Map<HTMLElement, Record<string, string>>(); // valeurs d'origine
  const set = (el: HTMLElement, styles: Record<string, string>) => {
    const original = touched.get(el) || {};
    for (const [k, v] of Object.entries(styles)) {
      if (!(k in original)) original[k] = el.style.getPropertyValue(k);
      el.style.setProperty(k, v);
    }
    touched.set(el, original);
  };
  // 1. Corrections connues (taille, couleur).
  for (const issue of inspectSlide(doc, slide)) {
    const el = issue.fix && byId(issue.elementId);
    if (el && !isLocked(el)) set(el, issue.fix!);
  }
  // 2. Textes coupés (d'origine, ou devenus trop grands à l'étape 1).
  for (const item of collectInspectables(doc)) {
    if (item.kind !== "text" || isLocked(item.el)) continue;
    const el = item.el;
    const cut = () =>
      findClippedIds(doc).includes(item.id) ||
      (/hidden|clip|auto|scroll/.test(view.getComputedStyle(el).overflowY) &&
        el.scrollHeight > el.clientHeight + 2);
    if (!cut()) continue;
    const floor = readableFloorPx(el);
    let size = parseFloat(view.getComputedStyle(el).fontSize) || 40;
    while (cut() && size - 2 >= floor) {
      size -= 2;
      set(el, { "font-size": `${size}px` });
    }
    if (cut()) {
      // Même à la plus petite taille lisible, il ne tient pas : on rend sa
      // taille d'origine (il reste signalé, à raccourcir à la main).
      const original = touched.get(el)?.["font-size"];
      if (original) el.style.setProperty("font-size", original);
      else if (original === "") el.style.removeProperty("font-size");
    }
  }
  const patches: Omit<FixPatch, "slideId">[] = [];
  touched.forEach((original, el) => {
    const styles: Record<string, string> = {};
    for (const k of Object.keys(original)) {
      const now = el.style.getPropertyValue(k);
      if (now && now !== original[k]) styles[k] = now;
    }
    if (Object.keys(styles).length) patches.push({ elementId: el.dataset.editorId!, styles });
  });
  return { patches, remaining: inspectSlide(doc, slide).filter(REPORTED) };
}

/** Corrige toutes les slides (ou celles de `only`) du carrousel, sans rien enregistrer. */
export async function fixCarouselQuality(
  document: CarouselDocument,
  signal: AbortSignal,
  only?: number[],
): Promise<FixAllResult> {
  const result: FixAllResult = { patches: [], remaining: [], lockedSlides: [] };
  for (let i = 0; i < document.slides.length; i++) {
    if (only && !only.includes(i)) continue;
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
    const slide = document.slides[i];
    await withSlideFrame(slide.html, `Correction slide ${i + 1}`, signal, (doc, broken) => {
      result.remaining.push(...broken.map((el) => brokenImageIssue(el, i)));
      if (slide.locked) {
        const issues = inspectSlide(doc, i).filter(REPORTED);
        if (issues.some((x) => FIXABLE_KINDS.includes(x.kind))) result.lockedSlides.push(i);
        result.remaining.push(...issues);
        return;
      }
      const fixed = fixSlide(doc, i);
      result.patches.push(...fixed.patches.map((p) => ({ ...p, slideId: slide.id })));
      result.remaining.push(...fixed.remaining);
    });
  }
  return result;
}

/** Applique les retouches sur la version la plus récente du carrousel. */
export function applyFixPatches(document: CarouselDocument, patches: FixPatch[]): CarouselDocument {
  return {
    ...document,
    slides: document.slides.map((s) =>
      patches
        .filter((p) => p.slideId === s.id)
        .reduce((acc, p) => patchElement(acc, p.elementId, { styles: p.styles }), s),
    ),
  };
}

const slidesLabel = (list: number[]) => {
  const n = [...new Set(list)].sort((a, b) => a - b).map((i) => i + 1);
  return n.length > 1 ? `slides ${n.slice(0, -1).join(", ")} et ${n[n.length - 1]}` : `slide ${n[0]}`;
};

/** Ce qui reste à faire à la main, en phrases courtes regroupées par type. */
export function describeRemaining(result: Pick<FixAllResult, "remaining" | "lockedSlides">): string[] {
  const groups = new Map<string, number[]>();
  for (const issue of result.remaining) {
    if (result.lockedSlides.includes(issue.slide)) continue;
    const text =
      issue.kind === "size"
        ? issue.severity === "error"
          ? "Texte trop petit qui ne tient pas en plus grand : raccourcis-le ou agrandis son cadre"
          : "Texte un peu petit, plus grand il ne tiendrait pas : raccourcis-le si tu veux l’agrandir"
        : issue.kind === "overflow"
          ? issue.message.startsWith("Un bloc")
            ? "Bloc qui sort de la slide : déplace-le ou réduis-le"
            : "Texte trop long pour sa place : raccourcis-le ou agrandis son cadre"
          : issue.kind === "contrast"
            ? "Texte qui ressort peu sur son fond : change sa couleur"
            : issue.kind === "image"
              ? "Image impossible à charger : remplace-la"
              : null;
    if (!text) continue;
    groups.set(text, [...(groups.get(text) || []), issue.slide]);
  }
  const lines = [...groups].map(([text, slides]) => `${text} (${slidesLabel(slides)}).`);
  if (result.lockedSlides.length)
    lines.push(`${slidesLabel(result.lockedSlides).replace(/^s/, "S")} verrouillée${result.lockedSlides.length > 1 ? "s" : ""} : déverrouille pour corriger.`);
  return lines;
}
