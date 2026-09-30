import { carouselEditorialFields } from "../../supabase/functions/_shared/carousel-editorial-review";

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
