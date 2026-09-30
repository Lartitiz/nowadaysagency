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

describe("CreerStepQuestions — nouveau récit", () => {
  const base = { format: "carousel", subject: "Présenter la collection", loadingQuestions: false, onBack: vi.fn() };

  it("garde une réponse libre quand la personne passe les questions restantes", () => {
    const onNext = vi.fn(); const onSkip = vi.fn();
    render(<CreerStepQuestions {...base} questions={[{ id: "q1", question: "Quel objectif ?" }, { id: "q2", question: "Quel détail ?" }]} onNext={onNext} onSkip={onSkip} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Finalement je veux raconter pourquoi j'ai arrêté les séries identiques." } });
    fireEvent.click(screen.getByRole("button", { name: "Générer avec mes précisions" }));
    expect(onNext).toHaveBeenCalledWith({ q1: "Finalement je veux raconter pourquoi j'ai arrêté les séries identiques." });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("permet un récit libre même sans question IA et le persiste", async () => {
    const onNext = vi.fn(); const onSkip = vi.fn(); const onAnswersChange = vi.fn();
    render(<CreerStepQuestions {...base} questions={[]} allowNarrative onNext={onNext} onSkip={onSkip} onAnswersChange={onAnswersChange} />);
    fireEvent.click(screen.getByText("Un autre récit à raconter ?"));
    fireEvent.change(screen.getByLabelText("Ce que tu veux raconter (optionnel)"), { target: { value: "Je veux expliquer un choix, pas présenter la collection." } });
    await waitFor(() => expect(onAnswersChange).toHaveBeenLastCalledWith({ "Le récit que je souhaite raconter": "Je veux expliquer un choix, pas présenter la collection." }));
    fireEvent.click(screen.getByRole("button", { name: "Générer directement" }));
    expect(onNext).toHaveBeenCalledWith({ "Le récit que je souhaite raconter": "Je veux expliquer un choix, pas présenter la collection." });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("reprend le récit sauvegardé sans imposer de réponse supplémentaire", () => {
    const onNext = vi.fn(); const onSkip = vi.fn();
    render(<CreerStepQuestions {...base} questions={[]} allowNarrative initialAnswers={{ "Le récit que je souhaite raconter": "Un souvenir fourni" }} onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Générer directement" }));
    expect(onNext).toHaveBeenCalledWith({ "Le récit que je souhaite raconter": "Un souvenir fourni" });
  });

  it("garde la génération sans précisions lorsque les champs sont vides", () => {
    const onNext = vi.fn(); const onSkip = vi.fn();
    render(<CreerStepQuestions {...base} questions={[]} allowNarrative initialAnswers={{ "Le récit que je souhaite raconter": "  " }} onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Générer directement" }));
    expect(onSkip).toHaveBeenCalledOnce(); expect(onNext).not.toHaveBeenCalled();
  });
});
