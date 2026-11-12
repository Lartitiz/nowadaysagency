import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { draftLinkedToIdea, draftMatchesSavedIdea } from "@/features/creer/draft-saved-check";

// Demande du 12/11/2026 : passer d'un carrousel à l'autre comme sur Canva,
// sans « Tu as déjà un contenu en cours » quand rien ne peut se perdre.
const photoBase64 = Buffer.from("x".repeat(30_000)).toString("base64");
const dataUrl = `data:image/jpeg;base64,${photoBase64}`;
const hash = createHash("sha256").update(Buffer.from(photoBase64, "base64")).digest("hex");
const storedUrl = `https://abc.supabase.co/storage/v1/object/public/calendar-visuals/user-1/carousel-media/${hash}.jpg`;

const raw = (extra: Record<string, unknown> = {}) => ({
  carousel_editor_version: 1,
  slides: [{ title: "Accroche", body: "Texte" }],
  _carousel_document_id: "doc-1",
  ...extra,
});
const draft = (overrides: Record<string, unknown> = {}) => ({
  step: "result",
  editingIdeaId: "idea-1",
  result: { raw: raw({ _carousel_cloud: { revision: "r1", history: [] } }) },
  visualSlides: [{ slide_number: 1, html: `<img src="${dataUrl}">` }],
  ...overrides,
});
const saved = (extra: Record<string, unknown> = {}) =>
  raw({ _carousel_cloud: { revision: "r2", history: [{ savedAt: "x", raw: {} }] }, visual_html: [{ slide_number: 1, html: `<img src="${storedUrl}">` }], ...extra });

describe("Ouvrir un autre contenu sans fenêtre quand le carrousel en cours est enregistré", () => {
  it("le contenu identique à Mes idées (photo rangée en lien, autre version) passe sans fenêtre", async () => {
    expect(await draftMatchesSavedIdea(draft(), saved())).toBe(true);
  });

  it("une retouche pas encore partie dans Mes idées garde la fenêtre", async () => {
    const edited = draft({ result: { raw: raw({ slides: [{ title: "Accroche retouchée", body: "Texte" }], _carousel_cloud: { revision: "r1", history: [] } }) } });
    expect(await draftMatchesSavedIdea(edited, saved())).toBe(false);
  });

  it("un visuel différent garde la fenêtre", async () => {
    const other = draft({ visualSlides: [{ slide_number: 1, html: "<p>Autre</p>" }] });
    expect(await draftMatchesSavedIdea(other, saved())).toBe(false);
  });

  it("fiche introuvable ou contenu sans fiche : la fenêtre reste", async () => {
    expect(await draftMatchesSavedIdea(draft(), null)).toBe(false);
    expect(draftLinkedToIdea(draft({ editingIdeaId: null }))).toBe(false);
    expect(draftLinkedToIdea(draft({ step: "generating" }))).toBe(false);
    expect(draftLinkedToIdea({ step: "idea", editingIdeaId: null, result: null })).toBe(false);
  });

  // Extension du 12/11/2026 : contenu rouvert sans modification, même sans sauvegarde continue.
  it("ancien carrousel sans visuels rouvert à l'identique : pas de fenêtre ; modifié : fenêtre", async () => {
    const old = { carousel_type: "photo", slides: [{ title: "Avant" }] };
    const reopened = { step: "result", editingIdeaId: "old-1", result: { raw: { ...old } }, visualSlides: [] };
    expect(await draftMatchesSavedIdea(reopened, { ...old })).toBe(true);
    const changed = { ...reopened, result: { raw: { ...old, slides: [{ title: "Après" }] } } };
    expect(await draftMatchesSavedIdea(changed, { ...old })).toBe(false);
  });

  it("post rouvert : le texte retouché doit être celui de la fiche", async () => {
    const post = { content: "Mon post", edited_text: "Ma version" };
    const base = { step: "result", editingIdeaId: "p-1", result: { raw: { ...post } } };
    expect(await draftMatchesSavedIdea({ ...base, editContent: "Ma version" }, { ...post })).toBe(true);
    expect(await draftMatchesSavedIdea({ ...base, editContent: "Ma version retouchée" }, { ...post })).toBe(false);
    expect(await draftMatchesSavedIdea(base, { content: "Mon post" })).toBe(false);
  });

  it("les stories enregistrées passent aussi", async () => {
    const stories = { step: "result", editingIdeaId: "s-1", result: { raw: { story_editor_version: 1, stories: [{ text: "Bonjour" }], _carousel_cloud: { revision: "a", history: [] } } } };
    expect(await draftMatchesSavedIdea(stories, { story_editor_version: 1, stories: [{ text: "Bonjour" }], _carousel_cloud: { revision: "b", history: [] } })).toBe(true);
  });
});
