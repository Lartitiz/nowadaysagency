// Compatibilité du HTML COMPOSÉ du carrousel mixte (02/10/2026) avec l'édition live.
import { describe, expect, it } from "vitest";
import { composeMixSlide } from "../../supabase/functions/_shared/mix-slide-layouts";
import { getSlideCtaText, hasSlideCta, removeSlideCta, replaceSlideText } from "./carousel-html-edit";

const CH = { color_primary: "#91014b", color_background: "#FFF4F8", color_text: "#1A1A1A", font_title: "Libre Baskerville", font_body: "IBM Plex Sans" };
const mid = { isFirst: false, isLast: false, previous: null, photoCount: 3 };

describe("carrousel mixte composé × édition live", () => {
  it("photo + texte : titre et corps éditables, photo conservée", () => {
    const { html } = composeMixSlide({ slide_number: 2, slide_type: "photo_integrated", photo_index: 1, title: "L'émail", body: "Le même bleu coule autrement selon sa place dans le four." }, CH, mid)!;
    const a = replaceSlideText(html, "title", "L'émail", "La cuisson");
    const b = replaceSlideText(a, "body", "Le même bleu coule autrement selon sa place dans le four.", "Nouveau corps.");
    expect(b).toContain("La cuisson");
    expect(b).toContain("Nouveau corps.");
    expect(b).not.toContain("coule autrement");
    expect(b).toContain("{{PHOTO_1}}");
  });

  it("photo plein cadre : l'overlay reste éditable", () => {
    const { html } = composeMixSlide({ slide_number: 3, slide_type: "photo_full", photo_index: 2, overlay_text: "Un millimètre change tout." }, CH, mid)!;
    const edited = replaceSlideText(html, "overlay", "Un millimètre change tout.", "Tout se joue au col.");
    expect(edited).toContain("Tout se joue au col.");
    expect(edited).toContain("{{PHOTO_2}}");
  });

  it("slide texte finale : CTA détectable et supprimable", () => {
    const { html } = composeMixSlide({ slide_number: 6, slide_type: "text_only", title: "Ce bol n'existe qu'une fois.", body: "Il garde la trace de l'argile.", cta_label: "Viens voir la série" }, CH, { ...mid, isLast: true })!;
    expect(hasSlideCta(html)).toBe(true);
    expect(getSlideCtaText(html)).toBe("Viens voir la série");
    const removed = removeSlideCta(html);
    expect(removed).not.toContain("Viens voir la série");
    expect(removed).toContain("Il garde la trace de l'argile.");
  });
});
