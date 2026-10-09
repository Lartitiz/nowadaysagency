import { describe, it, expect } from "vitest";
import { purePhotoRawOrNull } from "@/lib/pure-photo-slides";
import { readCarouselDocument, documentOutput } from "@/lib/carousel-editor";
import { mergeEditorRaw } from "@/lib/mix-layout-memo";

// Boucle des 08-09/10 (contenus figés) : sur « Photos brutes », la page nettoie
// le résultat, l'éditeur le relit et le renvoie (documentOutput), la page le
// fusionne (mergeEditorRaw) puis le renettoie… Avec les VRAIES fonctions de
// l'éditeur, l'aller-retour doit se stabiliser : plus aucun nettoyage au 2e tour.
describe("Photos brutes : aller-retour réel éditeur ↔ nettoyage", () => {
  it("se stabilise après un seul nettoyage", () => {
    const raw = {
      carousel_type: "photo",
      slides: [
        { slide_number: 1, role: "hook", slide_type: "photo_full", overlay_text: "Accroche", kicker: "Moi" },
        { slide_number: 2, role: "body", slide_type: "photo_full", overlay_text: "Suite" },
      ],
      caption: { body: "Légende" },
    };
    const visual = [1, 2].map((n) => ({ slide_number: n, html: `<div style="width:1080px;height:1350px"><img src="https://x/p${n}.jpg" data-editor-photo></div>` }));
    let current: any = purePhotoRawOrNull(raw, 2);
    expect(current).not.toBeNull();
    let cleanings = 1;
    for (let round = 0; round < 4; round++) {
      const out = documentOutput(readCarouselDocument(current, visual), current);
      current = mergeEditorRaw(current, out.raw);
      const again = purePhotoRawOrNull(current, 2);
      if (again) { cleanings++; current = again; }
    }
    expect(cleanings).toBe(1);
    expect(current.slides.every((s: any) => !s.overlay_text && !("kicker" in s))).toBe(true);
  });
});
