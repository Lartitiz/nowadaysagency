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

  it("carousel mix : tags par type de slide + storyDetail.type=carousel_mix", () => {
    const res = buildCalendarContent("carousel", {
      carousel_type: "mix",
      caption: { hook: "H" },
      slides: [
        { slide_number: 1, slide_type: "photo_full", overlay_text: "Texte photo" },
        { slide_number: 2, slide_type: "photo_integrated", title: "T2", body: "B2" },
        { slide_number: 3, slide_type: "text_only", title: "T3", body: "B3" },
      ],
    });
    expect(res.storyDetail.type).toBe("carousel_mix");
    expect(res.contentDraft).toContain("SLIDE 1 [📸]: Texte photo");
    expect(res.contentDraft).toContain("SLIDE 2 [📷+📝]: T2 — B2");
    expect(res.contentDraft).toContain("SLIDE 3 [📝]: T3 — B3");
  });

  it("reel : timings + storyDetail.type=reel", () => {
    const res = buildCalendarContent("reel", {
      sections: [{ timing: "0-3s", label: "hook", texte_parle: "Accroche parlée", texte_overlay: "Overlay" }],
    });
    expect(res.accroche).toBe("Accroche parlée");
    expect(res.contentDraft).toContain("[0-3s] HOOK");
    expect(res.contentDraft).toContain("Accroche parlée");
    expect(res.storyDetail.type).toBe("reel");
  });

  it("story : format STORY + storyDetail.type=stories", () => {
    const res = buildCalendarContent("story", {
      stories: [{ number: 1, timing: "matin", text: "Mon texte story", format: "question" }],
    });
    expect(res.accroche).toBe("Mon texte story");
    expect(res.contentDraft).toContain("STORY 1");
    expect(res.contentDraft).toContain("Mon texte story");
    expect(res.storyDetail.type).toBe("stories");
  });

  it("pinterest_visual : titre + description", () => {
    const res = buildCalendarContent("pinterest_visual", { title: "Mon pin", description: "Desc du pin" });
    expect(res.accroche).toBe("Mon pin");
    expect(res.contentDraft).toContain("📌 Mon pin");
    expect(res.contentDraft).toContain("Desc du pin");
  });

  it("pinterest_photo : inclut le brief photo", () => {
    const res = buildCalendarContent("pinterest_photo", {
      title: "Pin photo",
      description: "Desc",
      photo_brief: { what: "Sujet", framing: "Plan large", lighting: "Naturelle", props: ["a", "b"], colors: "Pastel", mood: "Doux" },
    });
    expect(res.accroche).toBe("Pin photo");
    expect(res.contentDraft).toContain("BRIEF PHOTO");
    expect(res.contentDraft).toContain("Sujet : Sujet");
  });
});
