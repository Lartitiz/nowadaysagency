import { describe, it, expect } from "vitest";
import { slideText } from "./slide-text";

describe("slideText", () => {
  it("lit le carrousel TEXTE (title)", () => {
    expect(slideText({ title: "Le vrai coût d'un logo" })).toBe("Le vrai coût d'un logo");
  });

  // Régression 03/08/2026 : `hook_text` était vide pour le mixte et le photo,
  // donc absent de l'historique des accroches servi par `content-coaching`.
  it("lit le carrousel MIXTE/PHOTO (overlay_text)", () => {
    expect(slideText({ slide_number: 1, photo_index: 1, overlay_text: "On cherche des visages." }))
      .toBe("On cherche des visages.");
  });

  it("rend une chaîne vide sur une slide sans texte, jamais undefined", () => {
    expect(slideText({ photo_index: 1 })).toBe("");
    expect(slideText(undefined)).toBe("");
    expect(slideText({ title: "   " })).toBe("");
  });
});
