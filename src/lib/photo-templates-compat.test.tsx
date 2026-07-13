// Compatibilité du HTML COMPOSÉ (gabarits 13/07) avec l'édition live.
// Le composeur vit côté edge (_shared) mais est du TS pur : on l'importe ici
// pour garantir que replaceSlideText / removeSlideCta fonctionnent sur son HTML.
import { describe, expect, it } from "vitest";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";
import { getSlideCtaText, hasSlideCta, removeSlideCta, replaceSlideText } from "./carousel-html-edit";

const CH = { color_accent: "#7BC9A3", font_title: "Libre Baskerville", font_body: "IBM Plex Mono" };

describe("gabarits composés × édition live", () => {
  it("replaceSlideText édite l'overlay d'une slide profonde sans toucher au reste", () => {
    const { html } = composePhotoSlide(
      { slide_number: 2, photo_index: 1, overlay_text: "Un volume correct, mais zéro mise en valeur pour cette pièce." },
      CH,
      { isFirst: false, isLast: false },
    );
    const edited = replaceSlideText(html, "overlay", "Un volume correct, mais zéro mise en valeur pour cette pièce.", "Nouveau texte édité en direct.");
    expect(edited).toContain("Nouveau texte édité en direct.");
    expect(edited).not.toContain("zéro mise en valeur");
    expect(edited).toContain('data-injected-scrim="1"');
    expect(edited).toContain("{{PHOTO_1}}");
  });

  it("replaceSlideText édite le hook d'une couverture (kicker et détail intacts)", () => {
    const { html } = composePhotoSlide(
      { slide_number: 1, photo_index: 1, overlay_text: "Ce salon ne racontait rien", kicker: "Home staging · salon", detail: "7 slides pour voir ce qui a changé" },
      CH,
      { isFirst: true, isLast: false },
    );
    const edited = replaceSlideText(html, "overlay", "Ce salon ne racontait rien", "Ce salon méritait mieux");
    expect(edited).toContain("Ce salon méritait mieux");
    expect(edited).toContain("Home staging · salon");
    expect(edited).toContain("7 slides pour voir ce qui a changé");
  });

  it("CTA de la finale : détectable, lisible et supprimable", () => {
    const { html } = composePhotoSlide(
      { slide_number: 7, photo_index: 2, overlay_text: "Et vous, elle raconte quoi, votre pièce à vivre ?", cta_label: "Dites-le-moi en commentaire" },
      CH,
      { isFirst: false, isLast: true },
    );
    expect(hasSlideCta(html)).toBe(true);
    expect(getSlideCtaText(html)).toBe("Dites-le-moi en commentaire");
    const removed = removeSlideCta(html);
    expect(removed).not.toContain("Dites-le-moi en commentaire");
    expect(removed).toContain("Et vous, elle raconte quoi, votre pièce à vivre ?");
  });
});
