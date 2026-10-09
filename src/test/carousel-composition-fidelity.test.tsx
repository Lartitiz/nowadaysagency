import { describe, expect, it } from "vitest";
import { applyReviewedPhotoAssignments, carouselCompositionWarnings } from "@/lib/carousel-composition-fidelity";
import { cleanCarouselSnapshot } from "@/lib/carousel-autosave";
import { progressionMaterial } from "../../supabase/functions/_shared/carousel-editorial-snapshot";
describe("fidélité après composition", () => {
  it("keeps the reviewed bowls even when the layout puts the pot in their slot", () => {
    const source = [{slide_number:1,slide_type:"photo_full",photo_index:2,photo_match:{status:"matched"},overlay_text:"Les bols à cerises"}];
    for (const html of ['<img data-pptx-photo="1" src="data:image/jpeg;base64,pot" srcset="wrong 2x"><p>Les bols à cerises</p>', '<div data-pptx-photo="1" style="background-image:url(data:image/jpeg;base64,pot);height:500px"></div><p>Les bols à cerises</p>']) {
      const result = applyReviewedPhotoAssignments(source,[{slide_number:1,html}],[{base64:"pot"},{base64:"bowls"}]);
      expect(result[0].html).toContain('data-pptx-photo="2"');
      expect(result[0].html).toContain('data:image/jpeg;base64,bowls');
      expect(result[0].html).not.toContain('base64,pot');
      expect(result[0].html).not.toContain('srcset');
      expect(result[0].html).toContain('Les bols à cerises');
    }
  });
  it("garde aussi la photo posée en ambiance (« Tes photos en fond », 09/10)", () => {
    const source = [{slide_number:1,slide_type:"photo_full",photo_index:2,photo_match:{status:"ambient_fallback"},overlay_text:"Mon métier"}];
    const result = applyReviewedPhotoAssignments(source,[{slide_number:1,html:'<img data-pptx-photo="1" src="data:image/jpeg;base64,un"><p>Mon métier</p>'}],[{base64:"un"},{base64:"deux"}]);
    expect(result[0].html).toContain('data:image/jpeg;base64,deux');
    expect(result[0].html).not.toContain('base64,un"');
  });
  it("refuses an unrecognizable photo slot and preserves manual/old visuals", () => {
    const html = [{slide_number:1,html:'<div>Les bols à cerises</div>'}];
    const slide = {slide_number:1,photo_index:1,photo_match:{status:"matched"}};
    expect(() => applyReviewedPhotoAssignments([slide],html,[{base64:"bowls"}])).toThrow('emplacement');
    expect(applyReviewedPhotoAssignments([{...slide,editor_locked:true}],html,[])).toEqual(html);
    expect(applyReviewedPhotoAssignments([{slide_number:1}],html,[])).toEqual(html);
  });
  it("retrouve une transition avec balises, entités et retours, sans accepter du texte caché dans CSS", () => {
    const source = [{
      title: "Le choix",
      body: "Il reste donc à choisir une direction commune.",
      visual_schema: { type: "quote_big", quote: "L’usage & le sens" },
    }];
    expect(
      carouselCompositionWarnings(source, [{
        html:
          "<h1>Le choix</h1><p>Il reste donc à <b>choisir</b> une direction commune.</p><p>L’usage &amp; le sens</p>",
      }]),
    ).toEqual([]);
    expect(
      carouselCompositionWarnings(source, [{
        html:
          "<h1>Le choix</h1><style>Il reste donc à choisir une direction commune.</style><p>L’usage &amp; le sens</p>",
      }]),
    ).toHaveLength(1);
  });
  it("compare à la source avant projection et protège les photos brutes", () => {
    expect(
      carouselCompositionWarnings([{
        kicker: "Lien indispensable",
        overlay_text: "Le geste",
      }], [{ html: "<p>Le geste</p>" }]),
    ).toHaveLength(1);
    expect(
      carouselCompositionWarnings([{}], [{
        html: "<img src='data:image/png;base64,x'/>",
      }], true),
    ).toEqual([]);
    expect(
      carouselCompositionWarnings([{}], [{
        html: "<p>Une légende ajoutée</p>",
      }], true),
    ).toHaveLength(1);
  });
  it("conserve les anciens brouillons et invalide le reçu d'un texte édité à la sauvegarde", () => {
    const old = {
      slides: [{ title: "Original" }],
      visual_html: [{ html: "Original" }],
    };
    expect(cleanCarouselSnapshot(old)).toEqual(old);
    const reviewed = {
      ...old,
      progression_review: {
        execution_status: "completed",
        verdict: "acceptable",
        reviewed_material: progressionMaterial(old),
        issues: [],
      },
    };
    const edited = { ...reviewed, slides: [{ title: "Ma modification" }] };
    const saved = cleanCarouselSnapshot(edited);
    expect(saved.slides).toEqual(edited.slides);
    expect(saved.progression_review.execution_status).toBe("stale");
    expect(saved.progression_review.verdict).toBeNull();
  });
});
