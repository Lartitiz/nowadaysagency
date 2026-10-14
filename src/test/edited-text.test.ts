import { describe, it, expect } from "vitest";
import { applyEditedText, carouselEditText, storiesEditText, structuredEditText, withoutEditedText, MARKERS_LOST_MESSAGE } from "@/features/creer/edited-text";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { extractInstagramCaption } from "@/features/creer/publish-guards";

// Lot 7 « robustesse création de contenu » (14/10/2026) : une seule version du
// texte modifié. Carrousel et stories : le texte de « Modifier » retrouve sa
// place dans la structure ; plus de copie à plat qui écrase la suite.

const carousel = () => ({
  carousel_type: "tips",
  slides: [
    { slide_number: 1, role: "hook", title: "Le talent n'existe pas", body: "" },
    { slide_number: 2, role: "content", title: "200 bols ratés", body: "C'est ça, la méthode.\nEt rien d'autre." },
    { slide_number: 3, role: "cta", title: "Enregistre ce post", body: "Pour ta prochaine séance." },
  ],
  caption: { hook: "Ce qu'on appelle talent.", body: "Ligne 1.\n\nLigne 2.", cta: "Dis-moi en commentaire.", hashtags: ["ceramique", "atelier"] },
});

const stories = () => ({
  stories: [
    { number: 1, type: "intro", text: "J'ai arrêté les remises.", sticker: null },
    { number: 2, type: "sondage", text: "Et toi ?", sticker: { type: "sondage", label: "Tu fais des remises ?" } },
  ],
});

describe("carrousel : le texte retrouve sa place", () => {
  it("texte inchangé : la structure reste identique et rien n'est gardé à plat", () => {
    const raw = carousel();
    const res = applyEditedText("carousel", raw, carouselEditText(raw));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.raw.slides).toEqual(raw.slides);
    expect(res.raw.caption).toEqual(raw.caption);
    expect(res.raw.edited_text).toBeUndefined();
    expect(res.slideChanges).toEqual([]);
  });

  it("titre et texte d'une slide modifiés, avec le détail pour mettre à jour le visuel", () => {
    const raw = carousel();
    const text = carouselEditText(raw).replace("200 bols ratés\nC'est ça, la méthode.", "Deux cents bols ratés\nC'est la seule méthode.");
    const res = applyEditedText("carousel", raw, text);
    if (res.ok === false) throw new Error(res.error);
    expect(res.raw.slides[1]).toMatchObject({ title: "Deux cents bols ratés", body: "C'est la seule méthode.\nEt rien d'autre." });
    expect(res.raw.slides[0]).toBe(raw.slides[0]);
    expect(res.slideChanges).toEqual([
      { index: 1, field: "title", oldText: "200 bols ratés", newText: "Deux cents bols ratés" },
      { index: 1, field: "body", oldText: "C'est ça, la méthode.\nEt rien d'autre.", newText: "C'est la seule méthode.\nEt rien d'autre." },
    ]);
  });

  it("légende modifiée : accroche, corps (plusieurs paragraphes), appel à l'action et hashtags", () => {
    const raw = carousel();
    const text = carouselEditText(raw)
      .replace("Ce qu'on appelle talent.", "Ce qu'on appelle le talent.")
      .replace("Ligne 2.", "Ligne 2.\n\nLigne 3.")
      .replace("#ceramique #atelier", "#ceramique #potier");
    const res = applyEditedText("carousel", raw, text);
    if (res.ok === false) throw new Error(res.error);
    expect(res.raw.caption).toEqual({ hook: "Ce qu'on appelle le talent.", body: "Ligne 1.\n\nLigne 2.\n\nLigne 3.", cta: "Dis-moi en commentaire.", hashtags: ["ceramique", "potier"] });
  });

  it("un repère de slide supprimé : refus clair, rien n'est appliqué", () => {
    const raw = carousel();
    const text = carouselEditText(raw).replace("--- SLIDE 2 (content) ---\n", "");
    expect(applyEditedText("carousel", raw, text)).toEqual({ ok: false, error: MARKERS_LOST_MESSAGE });
  });

  it("une slide photo sans texte ne reçoit pas de texte en douce", () => {
    const raw = { carousel_type: "photo", slides: [{ slide_number: 1, overlay_text: "Mes mains" }, { slide_number: 2, title: "Fin", body: "" }], caption: { hook: "Accroche" } };
    const text = carouselEditText(raw).replace("--- SLIDE 1 () ---\n", "--- SLIDE 1 () ---\nTexte ajouté");
    const res = applyEditedText("carousel", raw, text);
    expect(res.ok).toBe(false);
  });

  it("après « Modifier », le calendrier et Instagram reçoivent la légende seule, pas le texte des slides", () => {
    const raw = carousel();
    const res = applyEditedText("carousel", raw, carouselEditText(raw).replace("Dis-moi en commentaire.", "Dis-moi tout."));
    if (res.ok === false) throw new Error(res.error);
    const caption = extractInstagramCaption(res.raw);
    expect(caption).toContain("Dis-moi tout.");
    expect(caption).not.toContain("--- SLIDE");
    expect(caption).not.toContain("200 bols ratés");
    expect(buildCalendarContent("carousel", res.raw).contentDraft).not.toContain("--- SLIDE");
  });
});

describe("stories : le texte retrouve sa place", () => {
  it("le sticker s'affiche en clair (plus de [object Object]) et n'est pas réécrit", () => {
    const raw = stories();
    const text = storiesEditText(raw);
    expect(text).toContain("🏷️ Sticker : Tu fais des remises ?");
    expect(text).not.toContain("[object Object]");
    const res = applyEditedText("story", raw, text.replace("Et toi ?", "Et toi, tu en fais ?"));
    if (res.ok === false) throw new Error(res.error);
    expect(res.raw.stories[1]).toEqual({ ...raw.stories[1], text: "Et toi, tu en fais ?" });
    expect(res.raw.stories[0]).toBe(raw.stories[0]);
  });

  it("écrit dans le champ que la story utilisait déjà", () => {
    const raw = { sequences: [{ number: 1, texte: "Bonjour" }] };
    const res = applyEditedText("story", raw, storiesEditText(raw).replace("Bonjour", "Salut"));
    if (res.ok === false) throw new Error(res.error);
    expect(res.raw.sequences[0]).toEqual({ number: 1, texte: "Salut" });
  });

  it("une story en trop ou en moins : refus clair", () => {
    const raw = stories();
    expect(applyEditedText("story", raw, storiesEditText(raw) + "\n\n--- STORY 3 () ---\nEn plus").ok).toBe(false);
  });

  it("après « Modifier », le calendrier montre les stories retouchées (plus d'ancienne copie qui prime)", () => {
    const raw = { ...stories(), edited_text: "ANCIEN TEXTE À PLAT" };
    const res = applyEditedText("story", raw, storiesEditText(raw).replace("J'ai arrêté les remises.", "Fini les remises."));
    if (res.ok === false) throw new Error(res.error);
    const draft = buildCalendarContent("story", res.raw).contentDraft;
    expect(draft).toContain("Fini les remises.");
    expect(draft).not.toContain("ANCIEN TEXTE");
  });
});

describe("formats à texte unique et retouches directes", () => {
  it("post, LinkedIn, newsletter, reel : le texte reste dans edited_text, comme avant", () => {
    for (const format of ["post", "linkedin", "newsletter", "reel", "pinterest_visual"]) {
      const res = applyEditedText(format, { content: "IA" }, "Ma version");
      expect(res).toMatchObject({ ok: true, structured: false, raw: { content: "IA", edited_text: "Ma version" } });
    }
  });

  it("structuredEditText ne concerne que carrousel et stories", () => {
    expect(structuredEditText("carousel", carousel())).toContain("--- SLIDE 1 (hook) ---");
    expect(structuredEditText("story", stories())).toContain("--- STORY 1 (intro) ---");
    expect(structuredEditText("post", { content: "x" })).toBeNull();
    expect(structuredEditText("carousel", { slides: [] })).toBeNull();
  });

  it("une retouche directe des slides efface l'ancienne copie à plat", () => {
    expect(withoutEditedText({ slides: [], edited_text: "vieux" })).toEqual({ slides: [] });
    const raw = { slides: [] };
    expect(withoutEditedText(raw)).toBe(raw);
  });
});

describe("branchement dans /creer", () => {
  it("les retouches directes (slides, stories, script du reel) effacent la copie à plat", async () => {
    const fs = await import("node:fs");
    const creer = fs.readFileSync(new URL("../pages/CreerUnifie.tsx", import.meta.url), "utf8");
    expect(creer).toContain("const nextRaw = { ...withoutEditedText(prev.raw), slides };");
    expect(creer).toContain("raw: { ...withoutEditedText(prev.raw), [key]: stories }");
    expect(creer).toContain("scriptChanged ? withoutEditedText(nextReel) : nextReel");
    expect(creer).toContain("const applied = applyEditedText(selectedFormat, result?.raw, edited);");
  });
});
