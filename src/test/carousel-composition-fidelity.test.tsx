import { describe, expect, it } from "vitest";
import { carouselCompositionWarnings } from "@/lib/carousel-composition-fidelity";
import { cleanCarouselSnapshot } from "@/lib/carousel-autosave";
import { progressionMaterial } from "../../supabase/functions/_shared/carousel-editorial-snapshot";
describe("fidélité après composition", () => {
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
