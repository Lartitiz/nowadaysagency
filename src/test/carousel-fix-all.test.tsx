// « Tout corriger » (12/11/2026) : le message dit ce qui reste à faire à la
// main, regroupé par type, et les retouches visent la bonne slide même si le
// carrousel a bougé pendant le calcul.
import { describe, expect, it } from "vitest";
import { applyFixPatches, describeRemaining } from "@/lib/carousel-fix-all";
import type { QualityIssue } from "@/lib/carousel-quality";

const issue = (slide: number, kind: QualityIssue["kind"], severity: QualityIssue["severity"] = "error", message = ""): QualityIssue =>
  ({ slide, elementId: "e", kind, severity, message });

describe("describeRemaining", () => {
  it("regroupe par type avec les numéros de slides, sans les conseils sans pastille", () => {
    expect(
      describeRemaining({
        remaining: [
          issue(0, "overflow", "error", "Texte coupé ou hors de la slide"),
          issue(4, "overflow", "error", "Texte coupé ou hors de la slide"),
          issue(2, "overflow", "error", "Un bloc de mise en page sort de la slide"),
          issue(1, "image"),
          issue(1, "margin", "warning"),
          issue(1, "manual", "warning"),
        ],
        lockedSlides: [],
      }),
    ).toEqual([
      "Texte trop long pour sa place : raccourcis-le ou agrandis son cadre (slides 1 et 5).",
      "Bloc qui sort de la slide : déplace-le ou réduis-le (slide 3).",
      "Image impossible à charger : remplace-la (slide 2).",
    ]);
  });
  it("une slide verrouillée est citée une fois, sans le détail de ses points", () => {
    expect(describeRemaining({ remaining: [issue(3, "size"), issue(3, "contrast", "warning")], lockedSlides: [3] })).toEqual([
      "Slide 4 verrouillée : déverrouille pour corriger.",
    ]);
  });
  it("rien qui reste : aucune ligne", () => {
    expect(describeRemaining({ remaining: [], lockedSlides: [] })).toEqual([]);
  });
});

describe("applyFixPatches", () => {
  const slide = (id: string, locked = false) => ({
    id,
    locked,
    data: {},
    html: `<div><p data-editor-id="t-${id}" style="font-size:20px;color:#999">Texte</p></div>`,
  });
  it("applique chaque retouche à sa slide (par identifiant), jamais à une slide verrouillée", () => {
    const doc = { slides: [slide("b"), slide("a"), slide("c", true)] } as never;
    const next = applyFixPatches(doc, [
      { slideId: "a", elementId: "t-a", styles: { "font-size": "38px" } },
      { slideId: "c", elementId: "t-c", styles: { "font-size": "38px" } },
    ]);
    expect(next.slides[0].html).toBe(slide("b").html);
    expect(next.slides[1].html).toContain("font-size: 38px");
    expect(next.slides[2].html).toBe(slide("c", true).html);
  });
});
