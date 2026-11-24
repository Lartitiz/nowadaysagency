import { afterEach, describe, expect, it } from "vitest";
import { inspectSlide, isEmptySlide } from "@/lib/carousel-quality";
import { isCarouselPublishable } from "@/lib/carousel-warnings";
import { describeRemaining } from "@/lib/carousel-fix-all";

// Cas réel du 24/11/2026 (passage « compte neuf ») : slide 7 livrée blanche,
// et l'écran disait « 0 point(s) bloquant(s) » et « publiable tel quel ».
afterEach(() => {
  document.body.innerHTML = "";
});
const slide = (inner: string) => {
  document.body.innerHTML = `<style>*{box-sizing:border-box;}</style><div data-pptx-shape="background" data-editor-id="bg" style="width:1080px;height:1350px;background:#F6F2EC;display:flex;">${inner}</div>`;
  return document;
};
const EMPTY_P = `<div style="max-width:820px"><p data-editor-id="t" data-slide-text="title" data-pptx-editable="title" style="font-size:88px;color:#1C1C20;margin:0;"></p></div>`;

describe("contrôle des slides : slide livrée vide", () => {
  it("le seul texte de la slide est vide : point bloquant « cette slide est vide »", () => {
    const issues = inspectSlide(slide(EMPTY_P), 6);
    expect(issues).toEqual([
      expect.objectContaining({ slide: 6, kind: "empty", severity: "error", elementId: "t", message: expect.stringContaining("cette slide est vide") }),
    ]);
    expect(isCarouselPublishable([], issues)).toBe(false);
    expect(describeRemaining({ remaining: issues, lockedSlides: [] })[0]).toContain("Slide vide");
  });

  it("espaces, pagination, décor, signature ou texte masqué ne font pas un contenu", () => {
    expect(isEmptySlide(slide(`${EMPTY_P}<p data-slide-page>7/8</p><span data-pptx-editable="page_number">7</span><span aria-hidden="true">✦</span><p data-slide-text="handle">@atelier</p><p style="display:none">caché</p><p data-slide-text="body">  \n </p>`))).toBe(true);
    expect(isEmptySlide(slide(""))).toBe(true);
    expect(isEmptySlide(slide(`<div data-editor-photo-empty data-editor-photo></div>`))).toBe(true);
  });

  it("un texte, une photo ou une image de fond suffisent : pas de faux blocage", () => {
    expect(isEmptySlide(slide(`<p data-slide-text="body">Un objet ancien mérite mieux.</p>`))).toBe(false);
    expect(isEmptySlide(slide(`<div><span>Texte sans étiquette</span></div>`))).toBe(false);
    expect(isEmptySlide(slide(`${EMPTY_P}<img src="https://exemple.test/photo.jpg">`))).toBe(false);
    expect(isEmptySlide(slide(`<div data-editor-photo style="background-image:url(https://exemple.test/p.jpg)"></div>`))).toBe(false);
    expect(isEmptySlide(slide(`<div style="background:url('https://exemple.test/p.jpg') center/cover"></div>`))).toBe(false);
    expect(isEmptySlide(slide(`<svg><text>3 étapes</text></svg>`))).toBe(false);
    expect(inspectSlide(slide(`<p data-slide-text="body">Un texte</p>`), 0).some((i) => i.kind === "empty")).toBe(false);
  });
});
