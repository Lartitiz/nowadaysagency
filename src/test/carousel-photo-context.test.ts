import { describe, expect, it } from "vitest";
import { carouselLibraryContext } from "@/lib/carousel-photo-context";
import { resolvePhotoIndexes } from "@/lib/resolve-photo-index";

describe("photo context and associations", () => {
  it("preserves intentional repetition and only fills invalid slots", () => {
    const slides = [
      { slide_type: "photo_full", photo_index: 2, overlay_text: "Le geste" },
      { slide_type: "text_only", title: "Son utilité" },
      { slide_type: "photo_full", photo_index: 2, overlay_text: "Le détail" },
      { slide_type: "photo_integrated", photo_index: 99, body: "La suite" },
    ];
    const result = resolvePhotoIndexes(slides, 3);
    expect(result.map(s => s.photo_index)).toEqual([2, undefined, 2, 3]);
    expect(result[0]).toBe(slides[0]);
    expect(slides[3].photo_index).toBe(99);
    expect(resolvePhotoIndexes(slides.slice(0, 3), 3)).toEqual(slides.slice(0, 3));
  });
  it("keeps library observations available without manufacturing user context", () => {
    expect(carouselLibraryContext({ name: "Détail du tissage", description: "Mains près d'un métier", tags: ["atelier"], kind: "coulisses" }))
      .toBe("Nom : Détail du tissage\nDescription : Mains près d'un métier\nClassement : coulisses\nMots-clés : atelier");
    expect(carouselLibraryContext({ name: null, description: null, tags: [], kind: null })).toBe("");
  });
});

it("does not replace a missing final match with a positional photo", () => {
  const slide = {slide_type:"photo_full",photo_index:null,photo_directive:"Bols à cerises",photo_match:{status:"missing"}};
  expect(resolvePhotoIndexes([slide],6)).toEqual([slide]);
});
