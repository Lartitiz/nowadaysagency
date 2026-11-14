import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import {
  GENERIC_STORY_QUESTIONS, STORY_KEY_PREFIX, fallbackStoryIdea, fetchStoryIdea, fetchStoryQuestions,
  storyContextForQuestions, storyIdeaText, storyStillApplies, withStoryAnswers, type TakenStory,
} from "@/features/creer/story/story-answers";

const story: TakenStory = {
  subject: "Zéro like, trois messages privés\nLes likes mesurent le bruit, les messages la confiance.",
  answers: [
    { id: "scene", question: "Raconte-moi un moment récent ?", answer: "Une cliente m'appelle en pleurs. Son post n'a eu aucun like." },
    { id: "paroles", question: "Qu'a-t-elle dit ?", answer: "« Personne ne me lit. »" },
    { id: "ressenti", question: "Qu'as-tu ressenti ?", answer: "De la colère contre les likes." },
    { id: "declic", question: "Qu'en retenir ?", answer: "Les likes mesurent le bruit, les messages la confiance." },
  ],
};

describe("réponses de l'histoire envoyées à l'écriture", () => {
  it("passent en premier, dans l'ordre scène, ressenti, déclic, paroles (anecdote, émotion, conviction côté serveur)", () => {
    const out = withStoryAnswers({ "Quel format ?": "Un post court" }, story);
    expect(Object.values(out)).toEqual([
      "Une cliente m'appelle en pleurs. Son post n'a eu aucun like.",
      "De la colère contre les likes.",
      "Les likes mesurent le bruit, les messages la confiance.",
      "« Personne ne me lit. »",
      "Un post court",
    ]);
    expect(Object.keys(out)[0]).toBe(STORY_KEY_PREFIX + "Raconte-moi un moment récent ?");
  });

  it("ajoutées deux fois (doGenerate puis structure du carrousel) : pas de doublon", () => {
    const once = withStoryAnswers({}, story);
    expect(withStoryAnswers(once, story)).toEqual(once);
  });

  it("sans histoire : les réponses Précisions restent telles quelles", () => {
    const ans = { a: "b" };
    expect(withStoryAnswers(ans, null)).toBe(ans);
  });

  it("une réponse vide n'est pas envoyée", () => {
    const out = withStoryAnswers({}, { subject: "x", answers: [{ id: "scene", question: "Q", answer: "  " }] });
    expect(out).toEqual({});
  });
});

describe("l'histoire suit le sujet", () => {
  it("gardée si le titre est retouché", () => {
    expect(storyStillApplies(story, story.subject)).toBe(true);
    expect(storyStillApplies(story, "Zéro like mais trois messages privés")).toBe(true);
  });
  it("lâchée si elle écrit un autre sujet, ou sans histoire", () => {
    expect(storyStillApplies(story, "Mes tarifs pour 2027")).toBe(false);
    expect(storyStillApplies(null, "x")).toBe(false);
  });
});

describe("questions Précisions", () => {
  it("reçoivent l'histoire pour ne pas la redemander", () => {
    const ctx = storyContextForQuestions(story);
    expect(ctx).toContain("ne pas la redemander");
    expect(ctx).toContain("Une cliente m'appelle en pleurs");
    expect(storyContextForQuestions(null)).toBe("");
  });
});

describe("appels au serveur", () => {
  it("questions : repli sur les questions générales si l'appel échoue", async () => {
    vi.mocked(invokeWithTimeout).mockResolvedValueOnce({ data: null, error: { message: "x" } as any });
    const r = await fetchStoryQuestions("ws");
    expect(r.questions).toEqual(GENERIC_STORY_QUESTIONS);
    expect(r.fallback).toBe(true);
  });

  it("questions : plafond du jour → questions générales et message", async () => {
    vi.mocked(invokeWithTimeout).mockResolvedValueOnce({ data: { error: "free_steps_daily_cap", message: "Reviens demain" }, error: { message: "429" } as any });
    const r = await fetchStoryQuestions(null);
    expect(r.capMessage).toBe("Reviens demain");
    expect(r.questions).toHaveLength(4);
  });

  it("idée : repli sur ses mots si l'appel échoue", async () => {
    vi.mocked(invokeWithTimeout).mockResolvedValueOnce({ data: null, error: { message: "x" } as any });
    const idea = await fetchStoryIdea(story.answers);
    expect(idea).toEqual(fallbackStoryIdea(story.answers));
    expect(idea.titre).toBe("Une cliente m'appelle en pleurs.");
    expect(storyIdeaText(idea)).toBe("Une cliente m'appelle en pleurs.\nLes likes mesurent le bruit, les messages la confiance.");
  });

  it("idée : envoie seulement les réponses remplies, avec le mode story_idea", async () => {
    vi.mocked(invokeWithTimeout).mockResolvedValueOnce({ data: { idea: { titre: "Zéro like", angle: "Le bruit" } }, error: null });
    const idea = await fetchStoryIdea([...story.answers.slice(0, 1), { id: "paroles", question: "Q", answer: "" }], "ws");
    expect(idea).toEqual({ titre: "Zéro like", angle: "Le bruit" });
    const body = vi.mocked(invokeWithTimeout).mock.calls.at(-1)![1]!.body;
    expect(body.mode).toBe("story_idea");
    expect(body.story_answers).toHaveLength(1);
    expect(body.workspace_id).toBe("ws");
  });
});
