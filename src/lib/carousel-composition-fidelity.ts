import { carouselEditorialFields } from "../../supabase/functions/_shared/carousel-editorial-review";

/** The layout model cannot replace an image selected and verified after writing. */
export function applyReviewedPhotoAssignments(
  source: any[], rendered: { slide_number: number; html: string }[],
  photos: { base64: string; mimeType?: string }[],
): { slide_number: number; html: string }[] {
  const dataUrl = (p: { base64: string; mimeType?: string }) => p.base64.startsWith("data:")
    ? p.base64 : `data:${p.mimeType || "image/jpeg"};base64,${p.base64}`;
  const known = new Set(photos.filter(p => p?.base64).map(dataUrl));
  return rendered.map(visual => {
    const slide = source.find((s, i) => (s.slide_number || i + 1) === visual.slide_number);
    if (slide?.photo_match?.status !== "matched" || slide.editor_locked) return visual;
    const photo = photos[slide.photo_index - 1];
    if (!photo?.base64) throw new Error(`Slide ${visual.slide_number} : la photo choisie n’est plus disponible.`);
    const doc = new DOMParser().parseFromString(visual.html, "text/html");
    let targets = Array.from(doc.querySelectorAll<HTMLElement>("[data-pptx-photo]"));
    if (!targets.length) targets = Array.from(doc.querySelectorAll<HTMLElement>("img,[style]")).filter(el =>
      known.has(el.getAttribute("src") || "") || [...known].some(url => el.style.backgroundImage.includes(url)));
    if (!targets.length) throw new Error(`Slide ${visual.slide_number} : l’emplacement de la photo n’a pas été conservé. Relance les visuels.`);
    const url = dataUrl(photo);
    for (const target of targets) {
      target.setAttribute("data-pptx-photo", String(slide.photo_index));
      if (target.tagName === "IMG") {
        target.setAttribute("src", url);
        target.removeAttribute("srcset");
        target.closest("picture")?.querySelectorAll("source").forEach(s => s.remove());
      } else target.style.setProperty("background-image", `url("${url}")`);
    }
    return { ...visual, html: doc.head.innerHTML + doc.body.innerHTML };
  });
}

/** Text presence after the last HTML pass, separate from geometry/contrast QA. */
export function carouselCompositionWarnings(
  source: any[],
  rendered: { html: string }[],
  noText = false,
): string[] {
  const normalize = (s: string) =>
    s.normalize("NFKC").replace(/\s+/g, " ").trim();
  const warnings: string[] = [];
  source.forEach((slide, i) => {
    const doc = new DOMParser().parseFromString(
      rendered[i]?.html || "",
      "text/html",
    );
    doc.querySelectorAll(
      "script,style,link,template,[hidden],[aria-hidden='true']",
    ).forEach((n) => n.remove());
    const actual = normalize(doc.body.textContent || "");
    if (noText) {
      if (actual) {
        warnings.push(
          `Slide ${i + 1} : du texte est présent sur une photo brute.`,
        );
      }
      return;
    }
    const fields = carouselEditorialFields({ slides: [slide] });
    if (fields.some((f) => !actual.includes(normalize(f.text)))) {
      warnings.push(
        `Slide ${
          i + 1
        } : une partie du texte manque dans le visuel. Le texte original est conservé dans l’éditeur.`,
      );
    }
  });
  return warnings;
}
