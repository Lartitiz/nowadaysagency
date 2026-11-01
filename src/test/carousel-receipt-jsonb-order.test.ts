import { describe, it, expect } from "vitest";
import { invalidateProgressionReceipt, progressionMaterial } from "../../supabase/functions/_shared/carousel-editorial-snapshot";

// Vu en ligne le 01/11/2026 : un carrousel jamais retouché, rouvert depuis Mes
// idées, disait « Tu as modifié le texte » car la base avait réordonné le schéma.
const doc = (visual_schema: any, title = "Le titre") => ({
  slides: [{ title, body: "Le corps", visual_schema }],
  structure_warnings: ["Slide 1 : à relire"],
});
const receipt = (d: any) => ({
  execution_status: "completed",
  issues: ["Slide 1 : à relire"],
  reviewed_material: progressionMaterial(d),
});

describe("reçu de relecture après passage par la base", () => {
  const before = { label: "Avant", items: ["Tout en tête"] };
  const after = { label: "Après", items: ["Trié"] };
  const original = doc({ type: "before_after", before, after });
  const reloaded = doc({ type: "before_after", after, before }); // ordre rendu par jsonb

  it("ne périme pas le reçu quand seul l'ordre des clés a changé", () => {
    const out = invalidateProgressionReceipt({ ...reloaded, progression_review: receipt(original) });
    expect(out.progression_review.execution_status).toBe("completed");
    expect(out.structure_warnings).toEqual(["Slide 1 : à relire"]);
  });

  it("ne périme pas non plus le reçu photo", () => {
    const out = invalidateProgressionReceipt({ ...reloaded, photo_review: receipt(original) });
    expect(out.photo_review.execution_status).toBe("completed");
  });

  it("périme toujours le reçu quand le texte a vraiment changé", () => {
    const edited = doc({ type: "before_after", after, before }, "Un autre titre");
    const out = invalidateProgressionReceipt({ ...edited, progression_review: receipt(original) });
    expect(out.progression_review.execution_status).toBe("stale");
  });
});
