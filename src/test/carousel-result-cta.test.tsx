// Bouton d'appel à l'action du carrousel texte (lot 8, 14/10/2026). L'écran
// de résultat ne le modifie plus depuis le 16/10/2026 : il ne reçoit jamais de
// visuels (dès qu'il y en a, /creer ouvre l'éditeur visuel, qui range le
// libellé dans cta_label via patchElement). Reste à vérifier que la mise en
// forme d'une slide texte ignore cta_label. Aucun appel réseau.
import { describe, it, expect } from "vitest";
import { visualSlidePayload } from "@/lib/visual-slide-payload";

const slide = { slide_number: 2, title: "Titre 2", body: "Texte 2" };

describe("carrousel texte — libellé du bouton dans les données", () => {
  it("la mise en forme d'une slide texte ne reçoit pas cta_label : le rendu ne change pas", () => {
    const payload = visualSlidePayload({ ...slide, cta_label: "Dis-moi en commentaire" }, "text_only", undefined);
    expect(payload).not.toHaveProperty("cta_label");
  });
});
