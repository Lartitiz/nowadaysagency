import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";

describe("CreerStepQuestions — sauvegarde pendant la saisie", () => {
  it("remonte immédiatement les réponses préremplies puis les modifications", async () => {
    const onAnswersChange = vi.fn();
    render(
      <CreerStepQuestions
        format="post"
        subject="Mon sujet"
        questions={[{ id: "q1", question: "Quel résultat ?" }]}
        loadingQuestions={false}
        initialAnswers={{ q1: "Réponse sauvegardée" }}
        onAnswersChange={onAnswersChange}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(onAnswersChange).toHaveBeenCalledWith({ q1: "Réponse sauvegardée" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Réponse modifiée" } });
    await waitFor(() => expect(onAnswersChange).toHaveBeenLastCalledWith({ q1: "Réponse modifiée" }));
  });
});
