import { describe, it, expect } from "vitest";
import { parseDeepIdea, ideaToEditorialBrief, preserveIdeaBrief, BRIEF_MARKER, safeSourceUrl, type DeepIdea } from "../../supabase/functions/_shared/ideas/contract";
import { withIdeaBrief } from "../lib/idea-brief-request";
import { buildCalendarPostFromIdea } from "../lib/idea-to-calendar";
import { resumeIdea } from "../lib/resume-idea";
const idea: DeepIdea = { subject: "Un détail de conception et son usage", angle: "Analyse d'usage", insight: "L'effort de fabrication et l'intérêt pour l'acheteur sont deux informations différentes.", mechanism: "Une anse change la prise en main ; expliquer ce choix permet de relier la fabrication à l'usage.", reader_benefit: "Choisir une pièce selon son usage.", outline: ["Montrer un choix de conception", "Expliquer sa conséquence"], example: "Démonstration à réaliser sur une pièce réelle.", nuance: "La valeur esthétique compte aussi.", grounding: "La céramiste présente une pièce à des particuliers.", objective_tag: "credibilite", sources: [{ id: "S1", title: "Source", url: "https://example.org/source", claim: "Assertion précise", accessed_at: "2026-09-16" }], to_verify: ["Vérifier l'effet sur la pièce montrée"] };

describe("direct ideas contract and persistence", () => {
  it("refuses an empty title, missing mechanism and decorative analogy", () => {
    expect(parseDeepIdea({ subject: "Titre" })).toBeNull();
    expect(parseDeepIdea({ ...idea, analogy: { mapping: "Carte", limit: "" } })).toBeNull();
    expect(parseDeepIdea(idea, idea.sources)?.mechanism).toBe(idea.mechanism);
  });
  it("accepts only retrieved source IDs and safe links", () => {
    expect(parseDeepIdea({ ...idea, source_ids: ["invented"], sources: [{ id: "invented", url: "https://invented.example" }] }, idea.sources)?.sources).toEqual([]);
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("https://name:secret@example.org")).toBeNull();
  });
  it("keeps explanation, nuance and sources when saved, planned and reopened", () => {
    const brief = ideaToEditorialBrief(idea);
    expect(brief.length).toBeGreaterThan(400);
    const saved = { titre: idea.subject, angle: brief, format: "carousel", canal: "linkedin" };
    const calendar = buildCalendarPostFromIdea(saved);
    expect(calendar.angle).toBe(brief);
    expect(calendar.status).toBe("idea");
    expect(calendar.content_draft).toBeNull();
    expect(resumeIdea(saved)).toBeNull(); // a developed idea is not a generated carousel
    expect(preserveIdeaBrief("Comparaison", brief)).toContain(idea.nuance);
    expect(preserveIdeaBrief("Comparaison", brief)?.split(BRIEF_MARKER)[0]).toBe("Comparaison");
  });
});
describe("generation request adapter", () => {
  const brief = ideaToEditorialBrief(idea);
  it("leaves unrelated endpoints and legacy angle IDs untouched", () => {
    const old = { editorial_angle: "mythe", context: "test" };
    expect(withIdeaBrief("creative-flow", old)).toBe(old);
    expect(withIdeaBrief("other-endpoint", { editorial_angle: brief })).toEqual({ editorial_angle: brief });
  });
  it("moves the full carousel brief before the server's 100 character clamp", () => {
    const body = { editorial_angle: brief, deepening_answers: { own: "Mon exemple réel" } };
    const sent = withIdeaBrief("carousel-ai", body);
    expect(sent.editorial_angle).toBe(idea.angle);
    expect(sent.deepening_answers.own).toBe("Mon exemple réel");
    expect(sent.deepening_answers["Brief éditorial choisi"]).toContain(idea.sources[0].url);
    expect(body.editorial_angle).toBe(brief);
  });
  it.each(["editorial_angle", "editorialFormat", "editorialFormatLabel"])("keeps complete material for creative-flow via %s", key => {
    const sent = withIdeaBrief("creative-flow", { [key]: brief, context: idea.subject, answers: [{ question: "Q", answer: "R" }] });
    expect(sent[key]).toBe(idea.angle);
    expect(sent.context).toContain(idea.mechanism);
    expect(sent.context).toContain(idea.nuance);
    expect(sent.answers).toEqual([{ question: "Q", answer: "R" }]);
  });
  it("keeps the questions branch material and rejects overflow instead of truncating", () => {
    expect(withIdeaBrief("creative-flow", { angle: { title: brief }, context: idea.subject }).context).toContain(idea.nuance);
    expect(() => withIdeaBrief("creative-flow", { editorial_angle: brief, context: "x".repeat(8000) })).toThrow(/long/);
  });
  it("keeps Pinterest's valid enum while passing full brief as context", () => {
    const sent = withIdeaBrief("pinterest-visual", { pin_type: brief, subject: idea.subject });
    expect(sent.pin_type).toBe("infographie");
    expect(sent.subject).toContain(idea.nuance);
  });
});
