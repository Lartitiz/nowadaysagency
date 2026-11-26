import { describe, expect, it } from "vitest";
import { composeLayout } from "@/lib/carousel-layouts";
import { extractStyleTokens, getEditorElements, prepareSlideHtml, veilAlpha, type EditorSlide } from "@/lib/carousel-editor";
import { photoShade, setDocumentShade, setPhotoShade } from "@/lib/carousel-shade";

const plein = (): EditorSlide =>
  composeLayout({ slide_number: 1, title: "Nouvelle acquisition : aucune marge", body: "Le détail" }, "photo-plein", "https://exemple.test/p.jpg", extractStyleTokens(""), []);
const shadowOf = (slide: EditorSlide) => getEditorElements(slide.html).filter((e) => e.kind === "text").map((e) => e.style?.["text-shadow"] || "");

describe("ombre sur la photo", () => {
  it("la mise en page « Photo plein écran » pose une ombre plus légère qu'avant (0,82 au lieu de 0,93)", () => {
    expect(photoShade(plein().html)).toBe(0.82);
  });
  it("une slide sans ombre n'a pas de curseur", () => {
    expect(photoShade("<div><h1 data-slide-text=\"title\">Titre</h1></div>")).toBeNull();
  });
  it("le curseur règle le dégradé en gardant sa forme", () => {
    const softer = setPhotoShade(plein(), 0.41);
    expect(photoShade(softer.html)).toBe(0.41);
    const style = getEditorElements(softer.html).find((e) => e.role === "veil");
    expect(style).toBeTruthy();
    expect(softer.html).toMatch(/rgba\(\d+,\s*\d+,\s*\d+,\s*0\.3\)/); // 0,6 / 0,82 × 0,41
  });
  it("« Aucune » efface l'ombre, puis on peut la remonter", () => {
    const none = setPhotoShade(plein(), 0);
    expect(photoShade(none.html)).toBe(0);
    const back = setPhotoShade(none, 0.8);
    expect(photoShade(back.html)).toBe(0.8);
    expect(veilAlpha(back.html.match(/data-injected-scrim[^>]*style="([^"]*)"/)?.[1] || "")).toBe(0.8);
  });
  it("ombre légère : un texte clair sans contour en reçoit un, retiré quand l'ombre remonte", () => {
    const bare = { ...plein() };
    bare.html = bare.html.replace(/text-shadow:[^;"]*;?/g, "");
    expect(shadowOf(bare).every((s) => !s)).toBe(true);
    const light = setPhotoShade(bare, 0.2);
    expect(shadowOf(light).every((s) => /rgba\(0, ?0, ?0, ?0\.6\)/.test(s))).toBe(true);
    const strong = setPhotoShade(light, 0.7);
    expect(shadowOf(strong).every((s) => !s)).toBe(true);
  });
  it("le cartouche de lecture derrière le texte (« bloc bleu ») suit le même curseur", () => {
    const slide: EditorSlide = { id: "s", data: { slide_number: 1 }, html: prepareSlideHtml('<div style="width:1080px;height:1350px;position:relative"><div data-pptx-photo="1" style="position:absolute;top:0;left:0;width:1080px;height:1350px;background-image:url(https://exemple.test/p.jpg)"></div><div data-photo-reading-panel data-pptx-shape="card" style="position:relative;background:rgba(19,25,83,.93);color:#FFFFFF"><p data-slide-text="body" style="color:#FFFFFF">Texte</p></div></div>') };
    expect(photoShade(slide.html)).toBe(0.93);
    const softer = setPhotoShade(slide, 0.3);
    expect(photoShade(softer.html)).toBe(0.3);
    expect(softer.html).toMatch(/rgba\(19,\s*25,\s*83,\s*0\.3\)/);
  });
  it("une slide verrouillée garde son ombre, « Mettre partout » compte les slides changées", () => {
    const a = plein(), b = { ...plein(), locked: true }, c = { ...plein(), html: "<div><p data-slide-text=\"body\">Texte seul</p></div>" };
    const out = setDocumentShade({ caption: {}, slides: [a, b, c] }, 0.3);
    expect(out.changed).toBe(1);
    expect(photoShade(out.document.slides[0].html)).toBe(0.3);
    expect(photoShade(out.document.slides[1].html)).toBe(0.82);
  });
});
