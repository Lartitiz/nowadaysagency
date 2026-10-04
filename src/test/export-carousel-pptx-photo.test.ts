import { describe, expect, it } from "vitest";
import { isPhotoFullSlide, photoSlideText } from "../lib/export-carousel-pptx";

describe("export PowerPoint de secours (sans visuels) : carrousel photo", () => {
  it("garde le titre de slide et le sous-titre avec le texte", () => {
    expect(photoSlideText({ kicker: "Avant la couleur, la forme", overlay_text: "Cette forme nue, vous la voyez sur ce bol blanc.", detail: null }))
      .toBe("Avant la couleur, la forme\nCette forme nue, vous la voyez sur ce bol blanc.");
    expect(photoSlideText({ overlay_text: "Peindre à main levée", detail: "Amélie, céramiste" })).toBe("Peindre à main levée\nAmélie, céramiste");
    expect(photoSlideText({ overlay_text: null, title: "Titre" })).toBe("Titre");
  });
  it("une slide photo sans slide_type reste une slide photo ; une slide texte non", () => {
    expect(isPhotoFullSlide({ overlay_text: "Un texte" }, true)).toBe(true);
    expect(isPhotoFullSlide({ slide_type: "photo_full", overlay_text: null }, true)).toBe(true);
    expect(isPhotoFullSlide({ overlay_text: "" }, true)).toBe(false);
    expect(isPhotoFullSlide({ slide_type: "text_only", overlay_text: "x" }, true)).toBe(false);
    expect(isPhotoFullSlide({ overlay_text: "Un texte" }, false)).toBe(false);
  });
});
