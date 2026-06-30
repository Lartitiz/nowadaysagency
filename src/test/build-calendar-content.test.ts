import { describe, it, expect } from "vitest";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";

describe("buildCalendarContent", () => {
  it("retourne du vide si raw est absent", () => {
    expect(buildCalendarContent("post", null)).toEqual({ contentDraft: "", accroche: "", storyDetail: null });
  });

  it("post générique (else) : content + accroche = 1re ligne", () => {
    const res = buildCalendarContent("post", { content: "Ligne 1\nLigne 2" });
    expect(res.contentDraft).toBe("Ligne 1\nLigne 2");
    expect(res.accroche).toBe("Ligne 1");
    expect(res.storyDetail).toBeNull();
  });

  it("linkedin : utilise full_text et déduit l'accroche", () => {
    const res = buildCalendarContent("linkedin", { full_text: "Phrase d'accroche. Suite du post." });
    expect(res.contentDraft).toBe("Phrase d'accroche. Suite du post.");
    expect(res.accroche).toBe("Phrase d'accroche");
  });

  it("carousel avec slides : caption + section SLIDES + storyDetail.type=carousel", () => {
    const res = buildCalendarContent("carousel", {
      caption: { hook: "Hook", body: "Body", cta: "CTA" },
      slides: [{ title: "S1", body: "b1" }, { title: "S2", body: "b2" }],
      carousel_type: "tips",
    });
    expect(res.accroche).toBe("Hook");
    expect(res.contentDraft).toContain("───── SLIDES ─────");
    expect(res.contentDraft).toContain("S1");
    expect(res.storyDetail).toMatchObject({ type: "carousel", carousel_type: "tips" });
  });

  it("carousel photo : storyDetail.type=carousel_photo", () => {
    const res = buildCalendarContent("carousel", {
      carousel_type: "photo",
      caption: { hook: "H" },
      slides: [{ slide_number: 1, overlay_text: "Texte" }],
    });
    expect(res.storyDetail.type).toBe("carousel_photo");
    expect(res.contentDraft).toContain("SLIDE 1: Texte");
  });

  it("newsletter : préfixe Objet/Preview", () => {
    const res = buildCalendarContent("newsletter", { subject: "Mon objet", preview_text: "Preview", body: "Corps" });
    expect(res.contentDraft).toContain("Objet : Mon objet");
    expect(res.contentDraft).toContain("Preview : Preview");
    expect(res.contentDraft).toContain("Corps");
  });

  it("edited_text prime sur la version IA", () => {
    const res = buildCalendarContent("post", { content: "version IA", edited_text: "version éditée" });
    expect(res.contentDraft).toBe("version éditée");
  });
});
