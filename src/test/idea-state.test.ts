import { describe, it, expect } from "vitest";
import { getIdeaState, formatLabel, sourceLabel } from "@/lib/idea-state";

describe("getIdeaState — trois états lisibles", () => {
  it("une idée du diagnostic, sans contenu, est « à faire »", () => {
    expect(getIdeaState({ status: "to_explore", content_draft: null, content_data: null })).toBe("todo");
  });

  it("une idée notée à la main (statut par défaut SQL) est « à faire »", () => {
    expect(getIdeaState({ status: null })).toBe("todo");
  });

  it("un contenu généré rangé en idée (content_data) est « en cours »", () => {
    expect(getIdeaState({ status: "to_explore", content_data: { stories: [{ text: "…" }] } })).toBe("in_progress");
  });

  it("un brouillon mis de côté (content_draft texte) est « en cours »", () => {
    expect(getIdeaState({ status: null, content_draft: "SLIDE 1 : …" })).toBe("in_progress");
  });

  it("un content_data vide ne compte pas comme un brouillon", () => {
    expect(getIdeaState({ status: "to_explore", content_data: {} })).toBe("todo");
    expect(getIdeaState({ status: "to_explore", content_draft: "   " })).toBe("todo");
  });

  it("une actu sauvegardée reste « à faire » même si content_data porte l'article", () => {
    expect(getIdeaState({ status: "to_explore", format: "actu", content_data: { titre: "…", resume: "…" } })).toBe("todo");
  });

  it("le lien vers un post du calendrier l'emporte : « créée »", () => {
    expect(getIdeaState({ status: "to_explore", calendar_post_id: "abc" })).toBe("created");
    expect(getIdeaState({ status: "drafting", calendar_post_id: "abc", content_data: { a: 1 } })).toBe("created");
  });

  it("les anciens statuts restent compris", () => {
    expect(getIdeaState({ status: "planned" })).toBe("created");
    expect(getIdeaState({ status: "published" })).toBe("created");
    expect(getIdeaState({ status: "drafting" })).toBe("in_progress");
    expect(getIdeaState({ status: "ready", content_draft: "texte" })).toBe("in_progress");
    expect(getIdeaState({ status: "idea" })).toBe("todo");
  });
});

describe("libellés", () => {
  it("traduit les formats techniques", () => {
    expect(formatLabel("story_serie")).toBe("Série de stories");
    expect(formatLabel("post_carrousel")).toBe("Carrousel");
    expect(formatLabel(null)).toBe("Contenu");
    expect(formatLabel("bidule")).toBe("Bidule");
  });

  it("dit d'où vient l'idée seulement quand c'est utile", () => {
    expect(sourceLabel("diagnostic")).toBe("idée du diagnostic");
    expect(sourceLabel("newsjacking")).toBe("actu repérée");
    expect(sourceLabel(null, "actu")).toBe("actu repérée");
    expect(sourceLabel("creer")).toBeNull();
    expect(sourceLabel(null)).toBeNull();
  });
});
