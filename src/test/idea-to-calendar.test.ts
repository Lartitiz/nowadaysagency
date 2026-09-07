import { describe, it, expect } from "vitest";
import { buildCalendarPostFromIdea, ideaFormatToCreerFormat, cleanIdeaTitle } from "@/lib/idea-to-calendar";

const RAW_STORIES = {
  stories: [
    { number: 1, timing: "matin", format_label: "Texte", text: "7h, l'atelier sent encore l'huile d'olive." },
    { number: 2, timing: "midi", format_label: "Sondage", text: "Je pèse la soude au gramme près.", sticker: { type: "poll", label: "Tu savais ?" } },
  ],
  total_stories: 2,
  structure_label: "Coulisses",
  structure_type: "behind_the_scenes",
};

describe("buildCalendarPostFromIdea — une idée emporte son contenu", () => {
  it("idée nue (diagnostic) → post « idea » sans contenu", () => {
    const p = buildCalendarPostFromIdea({ titre: "Mes plantes locales", format: "reel", canal: "instagram", objectif: "visibilite" });
    expect(p.status).toBe("idea");
    expect(p.content_draft).toBeNull();
    expect(p.story_sequence_detail).toBeNull();
    expect(p.theme).toBe("Mes plantes locales");
  });

  it("série de stories gardée depuis Créer (result.raw) → story_sequence_detail + compteurs", () => {
    const p = buildCalendarPostFromIdea({
      titre: "📱 Ma journée à l'atelier",
      format: "story_serie",
      canal: "instagram",
      objectif: "confiance",
      content_draft: JSON.stringify(RAW_STORIES),
      content_data: RAW_STORIES,
    });
    expect(p.theme).toBe("Ma journée à l'atelier");
    expect(p.status).toBe("drafting");
    expect(p.content_draft).toContain("STORY 1");
    expect(p.content_draft).toContain("Je pèse la soude");
    expect(p.accroche).toBe("7h, l'atelier sent encore l'huile d'olive.");
    expect((p.story_sequence_detail as any).type).toBe("stories");
    expect((p.story_sequence_detail as any).stories).toHaveLength(2);
    expect(p.stories_count).toBe(2);
    expect(p.stories_structure).toBe("Coulisses");
    expect(p.stories_objective).toBe("confiance");
  });

  it("content_data en chaîne JSON est compris aussi", () => {
    const p = buildCalendarPostFromIdea({ titre: "x", format: "story", content_data: JSON.stringify(RAW_STORIES) });
    expect(p.stories_count).toBe(2);
  });

  it("carrousel gardé depuis Créer → slides dans le détail", () => {
    const p = buildCalendarPostFromIdea({
      titre: "🎠 3 erreurs de prix",
      format: "carousel",
      content_data: { caption: { hook: "Hook", body: "Body" }, slides: [{ title: "S1", body: "b1" }, { title: "S2", body: "b2" }] },
    });
    expect(p.status).toBe("drafting");
    expect((p.story_sequence_detail as any).type).toBe("carousel");
    expect((p.story_sequence_detail as any).slides).toHaveLength(2);
    expect(p.accroche).toBe("Hook");
    expect(p.stories_count).toBeNull();
  });

  it("idée revenue du calendrier (« Remettre en idée ») → détail restitué tel quel", () => {
    const detail = { type: "stories", stories: [{ text: "a" }, { text: "b" }, { text: "c" }], structure_label: "Teaser" };
    const p = buildCalendarPostFromIdea({
      titre: "Retour",
      format: "story_serie",
      content_draft: "STORY 1\na\n\nSTORY 2\nb",
      content_data: { content: "STORY 1\na", accroche: "a", story_sequence_detail: detail, stories_count: 3, media_urls: ["https://x/1.jpg"] },
    });
    expect(p.status).toBe("drafting");
    expect(p.story_sequence_detail).toEqual(detail);
    expect(p.stories_count).toBe(3);
    expect(p.stories_structure).toBe("Teaser");
    expect(p.content_draft).toBe("STORY 1\na\n\nSTORY 2\nb");
    expect(p.accroche).toBe("a");
    expect(p.media_urls).toEqual(["https://x/1.jpg"]);
  });

  it("brouillon texte simple → drafting avec l'accroche = 1re ligne", () => {
    const p = buildCalendarPostFromIdea({ titre: "📝 Brouillon", format: "post", content_draft: "Première ligne\nSuite" });
    expect(p.status).toBe("drafting");
    expect(p.content_draft).toBe("Première ligne\nSuite");
    expect(p.accroche).toBe("Première ligne");
  });

  it("un content_draft JSON sans content_data exploitable ne part pas tel quel", () => {
    const p = buildCalendarPostFromIdea({ titre: "x", format: "post", content_draft: "{\"foo\":1}", content_data: { foo: 1 } });
    expect(p.status).toBe("idea");
    expect(p.content_draft).toBeNull();
  });

  it("actu sauvegardée (newsjacking) → point de départ, pas de contenu", () => {
    const p = buildCalendarPostFromIdea({ titre: "📰 Une actu", format: "actu", content_data: { titre: "Une actu", resume: "…" } });
    expect(p.status).toBe("idea");
    expect(p.story_sequence_detail).toBeNull();
  });
});

describe("helpers", () => {
  it("mappe les formats d'idée vers ceux de Créer", () => {
    expect(ideaFormatToCreerFormat("story_serie")).toBe("story");
    expect(ideaFormatToCreerFormat("post_carrousel")).toBe("carousel");
    expect(ideaFormatToCreerFormat("pinterest")).toBe("pinterest_visual");
    expect(ideaFormatToCreerFormat("actu")).toBeNull();
    expect(ideaFormatToCreerFormat(null)).toBeNull();
  });
  it("retire l'emoji de rangement du titre", () => {
    expect(cleanIdeaTitle("📱 Sujet")).toBe("Sujet");
    expect(cleanIdeaTitle("Sujet")).toBe("Sujet");
    expect(cleanIdeaTitle("🎬")).toBe("🎬");
  });
});
