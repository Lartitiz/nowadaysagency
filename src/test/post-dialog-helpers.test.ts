import { describe, expect, it } from "vitest";
import { angleLabelOf, draftFromPost, isoToLocalInput, ANGLE_TO_CAROUSEL, CANAL_META } from "@/features/calendar/post-dialog-helpers";

/* Fiche 13 de docs/robustesse/gros-fichiers.md (lot 1) : les fonctions pures
   sorties de CalendarPostDialog.tsx. */

describe("fonctions de la fenêtre d'un post du calendrier", () => {
  it("angleLabelOf : libellé connu, id brut connu, id mis en forme, rien", () => {
    expect(angleLabelOf("Storytelling")).toBe("Récit");
    expect(angleLabelOf("Before / After")).toBe("Avant / après");
    expect(angleLabelOf("storytelling_pro")).toBe("Récit");
    expect(angleLabelOf("angle_maison")).toBe("Angle maison");
    expect(angleLabelOf(null)).toBeNull();
  });

  it("draftFromPost : content_draft > full_content > stories > script reel > rien", () => {
    expect(draftFromPost({ content_draft: "A", story_sequence_detail: { full_content: "B" } })).toBe("A");
    expect(draftFromPost({ story_sequence_detail: { full_content: "B" } })).toBe("B");
    expect(draftFromPost({ story_sequence_detail: { stories: [{ text: "S1" }, {}] } })).toBe("S1\n\n");
    expect(draftFromPost({ story_sequence_detail: { script: [{ texte_parle: "P1" }, { texte_parle: "P2" }] } })).toBe("P1\n\nP2");
    expect(draftFromPost({})).toBeNull();
  });

  it("isoToLocalInput : heure locale au format datetime-local", () => {
    const d = new Date(2026, 10, 3, 9, 5);
    expect(isoToLocalInput(d.toISOString())).toBe("2026-11-03T09:05");
  });

  it("tables : carrousel par angle et en-tête par réseau", () => {
    expect(ANGLE_TO_CAROUSEL["Mythe à déconstruire"]).toBe("mythe_realite");
    expect(CANAL_META.linkedin).toEqual({ emoji: "💼", label: "LinkedIn" });
  });
});
