import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import StoryQuestionsDialog from "./StoryQuestionsDialog";
import { GENERIC_STORY_QUESTIONS } from "@/features/creer/story/story-answers";

describe("Je te pose des questions", () => {
  it("4 questions une à une, la scène obligatoire, les autres passables, puis l'idée gardée avec les réponses", async () => {
    vi.mocked(invokeWithTimeout)
      .mockResolvedValueOnce({ data: { questions: GENERIC_STORY_QUESTIONS }, error: null })
      .mockResolvedValueOnce({ data: { idea: { titre: "Zéro like", angle: "Le bruit et la confiance" } }, error: null });
    const onKeep = vi.fn();
    render(<StoryQuestionsDialog open onOpenChange={() => {}} workspaceId="ws" onKeep={onKeep} />);

    const next = await screen.findByTestId("story-next");
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByTestId("story-answer"), { target: { value: "Une cliente m'appelle en pleurs." } });
    fireEvent.click(next);
    expect(screen.getByText("Question 2 sur 4")).toBeTruthy();
    fireEvent.click(screen.getByTestId("story-skip"));
    fireEvent.click(screen.getByTestId("story-skip"));
    fireEvent.change(screen.getByTestId("story-answer"), { target: { value: "Les likes mesurent le bruit." } });
    fireEvent.click(screen.getByTestId("story-next"));

    fireEvent.click(await screen.findByTestId("story-keep"));
    expect(onKeep).toHaveBeenCalledWith("Zéro like\nLe bruit et la confiance", [
      { id: "scene", question: GENERIC_STORY_QUESTIONS[0].question, answer: "Une cliente m'appelle en pleurs." },
      { id: "declic", question: GENERIC_STORY_QUESTIONS[3].question, answer: "Les likes mesurent le bruit." },
    ]);
    await waitFor(() => expect(vi.mocked(invokeWithTimeout).mock.calls.at(-1)![1]!.body.story_answers).toHaveLength(2));
  });

  it("pendant la préparation des questions : l'attente commune (barre + phrase), puis les questions", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(invokeWithTimeout).mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
    render(<StoryQuestionsDialog open onOpenChange={() => {}} workspaceId="ws" onKeep={() => {}} />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("Je prépare tes questions…")).toBeTruthy();
    resolve({ data: { questions: GENERIC_STORY_QUESTIONS }, error: null });
    expect(await screen.findByTestId("story-answer")).toBeTruthy();
  });
  it("à chaque question, le curseur revient dans la case et l'attente de l'idée ne parle pas de questions", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveIdea!: (v: unknown) => void;
    vi.mocked(invokeWithTimeout)
      .mockResolvedValueOnce({ data: { questions: GENERIC_STORY_QUESTIONS }, error: null })
      .mockReturnValueOnce(new Promise((r) => { resolveIdea = r; }) as never);
    render(<StoryQuestionsDialog open onOpenChange={() => {}} workspaceId="ws" onKeep={() => {}} />);
    const first = await screen.findByTestId("story-answer");
    fireEvent.change(first, { target: { value: "Une cliente m'appelle." } });
    fireEvent.click(screen.getByTestId("story-next"));
    const second = screen.getByTestId("story-answer");
    expect(second).not.toBe(first);
    expect(document.activeElement).toBe(second);
    fireEvent.click(screen.getByTestId("story-skip"));
    fireEvent.click(screen.getByTestId("story-skip"));
    fireEvent.click(screen.getByTestId("story-skip"));
    await act(async () => { vi.advanceTimersByTime(16_000); });
    expect(screen.getByTestId("waiting-note").textContent).not.toMatch(/question/i);
    resolveIdea({ data: { idea: { titre: "T", angle: "A" } }, error: null });
    vi.useRealTimers();
  });
});
