import { describe, it, expect } from "vitest";
import { castPhotosLater } from "@/lib/photo-carousel-cast-later";

describe("carrousel « Tes photos en fond » écrit sans photo (14/11/2026)", () => {
  it("chaque slide attend son image : plus de numéro de photo, image idéale en repère", () => {
    const raw = { carousel_type: "photo", slides: [
      { slide_type: "photo_full", photo_index: 1, overlay_text: "Accroche", photo_description: "Texture de savon en gros plan." },
      { slide_type: "text_on_photo", photo_index: 1, overlay_text: "Un texte assez long pour la slide", photo_description: "Photo fournie par l'utilisatrice (description non fournie)" },
      { slide_type: "cover", photo_index: 1, overlay_text: "" },
      { slide_type: "text_only", title: "Slide texte" },
    ] };
    const out: any = castPhotosLater(raw);
    expect(out.slides.map((s: any) => s.photo_index ?? null)).toEqual([null, null, null, null]);
    expect(out.slides[0]).toMatchObject({ slide_type: "photo_full", photo_directive: "Texture de savon en gros plan." });
    expect(out.slides[1]).toMatchObject({ slide_type: "photo_full", photo_directive: "Une photo qui accompagne « Un texte assez long pour la slide »" });
    expect(out.slides[2].photo_directive).toBe("Une photo de ton univers.");
    expect(out.slides[3]).toEqual({ slide_type: "text_only", title: "Slide texte" });
    expect(raw.slides[0].photo_index).toBe(1);
  });
});
