import { describe, it, expect } from "vitest";
import { purePhotoRawOrNull } from "@/lib/pure-photo-slides";

// Visite du 05/10 : l'effet « Photos brutes » de CreerUnifie re-nettoyait son
// propre résultat à l'infini (nouvel objet à chaque tour) → la pré-génération
// des visuels s'abandonnait à chaque changement et carousel-visual ne partait jamais.
describe("Photos brutes : nettoyage des slides", () => {
  const raw = {
    carousel_type: "photo",
    slides: [
      { slide_number: 1, role: "hook", slide_type: "photo_full", overlay_text: "Accroche", kicker: "Moi" },
      { slide_number: 2, role: "body", slide_type: "photo_full", overlay_text: "Suite" },
      { slide_number: 3, role: "cta", slide_type: "photo_full", overlay_text: "Fin" },
    ],
    caption: { body: "Légende" },
  };

  it("1 photo = 1 slide sans texte, légende gardée", () => {
    const next = purePhotoRawOrNull(raw, 2)!;
    expect(next.slides).toEqual([
      { slide_number: 1, role: "hook", slide_type: "photo_full", overlay_text: null, title: "", body: "", photo_index: 1 },
      { slide_number: 2, role: "body", slide_type: "photo_full", overlay_text: null, title: "", body: "", photo_index: 2 },
    ]);
    expect(next.no_overlay).toBe(true);
    expect(next.caption).toEqual(raw.caption);
  });

  it("s'arrête : un raw déjà nettoyé n'est plus réécrit (sinon boucle infinie)", () => {
    let current: any = raw;
    let writes = 0;
    for (let i = 0; i < 5; i++) {
      const next = purePhotoRawOrNull(current, 2);
      if (!next) break;
      current = next;
      writes++;
    }
    expect(writes).toBe(1);
  });

  it("complète avec des slides photo si l'IA en a écrit moins que de photos", () => {
    expect(purePhotoRawOrNull({ ...raw, slides: raw.slides.slice(0, 1) }, 3)!.slides.map((s: any) => s.photo_index)).toEqual([1, 2, 3]);
  });

  it("rien à faire sans slides ou sans photo", () => {
    expect(purePhotoRawOrNull({ slides: [] }, 2)).toBeNull();
    expect(purePhotoRawOrNull(raw, 0)).toBeNull();
  });
});
