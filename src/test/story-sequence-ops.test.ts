import { describe, expect, it } from "vitest";
import { duplicateStoryAt, insertBlankStoryAfter, MAX_STORIES, moveStory } from "@/lib/story-sequence-ops";
import { buildStoryRedoPrompt, cleanStoryRedo } from "@/lib/story-redo";
import { buildStoryFrameHtml, storyTextSizeFactor } from "@/lib/story-visual";
import { attachedPhotoSlots, pinAttachedPhotos } from "@/lib/story-attached-photos";

const s = (text: string, visual: any = { gabarit: "fond_pills", background: "fond_couleur" }) => ({ text, visual });

describe("story-sequence-ops", () => {
  it("bloque l'ajout et la copie au-delà de MAX_STORIES", () => {
    const full = Array.from({ length: MAX_STORIES }, (_, i) => s(`S${i}`));
    expect(insertBlankStoryAfter(full, 0)).toBe(full);
    expect(duplicateStoryAt(full, 0)).toBe(full);
  });

  it("la copie ne garde pas le mot clé d'accroche et n'est pas liée à l'originale", () => {
    const list = [s("Accroche", { gabarit: "fond_pills", mot_cle: "Accroche" })];
    const out = duplicateStoryAt(list, 0);
    expect(out[1].visual.mot_cle).toBeNull();
    expect(out[0].visual.mot_cle).toBe("Accroche");
    out[1].visual.background = "photo";
    expect(list[0].visual.background).toBeUndefined();
  });

  it("moveStory ignore les places hors séquence", () => {
    expect(moveStory([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveStory([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});

describe("taille du texte", () => {
  it("absente ou inconnue = moyen (rendu historique inchangé)", () => {
    expect(storyTextSizeFactor(undefined)).toBe(1);
    expect(storyTextSizeFactor("énorme")).toBe(1);
    const base = buildStoryFrameHtml(s("Bonjour"), null, { preview: false });
    expect(buildStoryFrameHtml(s("Bonjour", { gabarit: "fond_pills", background: "fond_couleur", text_size: "moyen" }), null, { preview: false })).toBe(base);
    expect(buildStoryFrameHtml(s("Bonjour", { gabarit: "fond_pills", background: "fond_couleur", text_size: "petit" }), null, { preview: false })).not.toBe(base);
  });
});

describe("refaire une story", () => {
  it("la consigne reste sous le plafond serveur même avec des voisines très longues", () => {
    const long = "x".repeat(5000);
    const prompt = buildStoryRedoPrompt({ number: 2, total: 5, role: "Accroche", instruction: long, previous: long, next: long });
    expect(prompt.length).toBeLessThanOrEqual(1000);
    expect(prompt).toContain("Retourne seulement le texte de la story.");
  });

  it("retire les guillemets d'encadrement", () => {
    expect(cleanStoryRedo("« Bonjour »")).toBe("Bonjour");
    expect(cleanStoryRedo('"Bonjour"')).toBe("Bonjour");
    expect(cleanStoryRedo(null)).toBe("");
  });
});

describe("photos attachées", () => {
  const photo = (x: string) => ({ preview: x });
  const photoStory = (visual: any = {}) => s("", { background: "photo", ...visual });

  it("répartit comme avant quand aucune photo n'est notée", () => {
    const slots = attachedPhotoSlots([photoStory(), s("couleur"), photoStory()], [photo("a"), photo("b")]);
    expect([...slots]).toEqual([[0, 0], [2, 1]]);
  });

  it("une photo notée passe avant la répartition", () => {
    const stories = pinAttachedPhotos([photoStory(), photoStory()], new Map([[0, 0], [1, 1]]));
    const swapped = [stories[1], stories[0]];
    expect([...attachedPhotoSlots(swapped, [photo("a"), photo("b")])]).toEqual([[0, 1], [1, 0]]);
  });
});
