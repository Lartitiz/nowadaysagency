import { describe, expect, it } from "vitest";
import { angleLabelOf, draftFromPost, previewCaptionOf, isoToLocalInput, ANGLE_TO_CAROUSEL, CANAL_META } from "@/features/calendar/post-dialog-helpers";

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

  // Contenu du 30/11 sur le compte d'Auriana (12/11/2026) : enregistré avant la
  // correction, il gardait « HOOK », « BODY », « CTA » à l'ouverture.
  it("reel enregistré avec l'ancien script : passages en français, texte retouché intact", () => {
    const sections = [
      { section: "hook", timing: "0-5 sec", texte_parle: "Ce salon.", texte_overlay: "personne n'en voulait" },
      { section: "body", timing: "5-16 sec", texte_parle: "Le cœur.", format_visuel: "Plan large" },
      { section: "cta", timing: "16-20 sec", texte_parle: "Abonne-toi." },
    ];
    const legacy = "[0-5 sec] HOOK\nCe salon.\n📝 personne n'en voulait\n\n[5-16 sec] BODY\nLe cœur.\n📹 Plan large\n\n[16-20 sec] CTA\nAbonne-toi.";
    const shown = draftFromPost({ content_draft: legacy, story_sequence_detail: { type: "reel", sections } });
    expect(shown).not.toMatch(/HOOK|BODY|\bCTA\b/);
    expect(shown).toContain("[0-5 sec] ACCROCHE\nCe salon.");
    expect(draftFromPost({ content_draft: legacy + "\nma retouche", story_sequence_detail: { type: "reel", sections } })).toBe(legacy + "\nma retouche");
    expect(draftFromPost({ content_draft: legacy, story_sequence_detail: { type: "carousel", slides: [] } })).toBe(legacy);
  });

  // Aperçu Instagram d'un reel au calendrier : la légende, pas le script.
  it("aperçu d'un reel : la légende qui sera publiée ; sinon le texte du contenu", () => {
    const sections = [{ section: "hook", timing: "0-5 sec", texte_parle: "Ce salon." }];
    const detail = { type: "reel", sections, caption: { text: "Ma légende", cta: "Abonne-toi" }, hashtags: ["#renovation"] };
    const script = draftFromPost({ content_draft: "[0-5 sec] HOOK\nCe salon.", story_sequence_detail: detail });
    expect(previewCaptionOf(script, detail)).toBe("Ma légende\n\nAbonne-toi\n\n#renovation");
    expect(previewCaptionOf("Ma légende retouchée", detail)).toBe("Ma légende retouchée");
    expect(previewCaptionOf(script, { type: "reel", sections })).toBe(script);
    expect(previewCaptionOf("Texte du carrousel", { type: "carousel" })).toBe("Texte du carrousel");
    expect(previewCaptionOf(null, null)).toBeNull();
  });
});

