import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";
import { NEWSJACKING_FIELD_QUESTION } from "@/lib/field-question";

describe("CreerStepQuestions — question unique du newsjacking", () => {
  const base = { format: "carousel", subject: "« Montre ton visage », le nouveau « souris » ?", loadingQuestions: false, onBack: vi.fn() };
  const questions = [{ id: "q1", question: "Quel objectif ?" }];

  it("passer sans répondre pose la question de terrain, puis transmet la réponse", () => {
    const onNext = vi.fn(); const onSkip = vi.fn();
    render(<CreerStepQuestions {...base} questions={questions} fieldQuestion={NEWSJACKING_FIELD_QUESTION} onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId("creer-questions-next"));
    expect(onSkip).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(NEWSJACKING_FIELD_QUESTION), { target: { value: "On me répond « non, je ne veux pas me montrer »." } });
    fireEvent.click(screen.getByRole("button", { name: /Générer avec ma réponse/ }));
    expect(onNext).toHaveBeenCalledWith({ [NEWSJACKING_FIELD_QUESTION]: "On me répond « non, je ne veux pas me montrer »." });
  });

  it("la question reste facultative", () => {
    const onNext = vi.fn(); const onSkip = vi.fn();
    render(<CreerStepQuestions {...base} questions={questions} fieldQuestion={NEWSJACKING_FIELD_QUESTION} onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId("creer-questions-next"));
    fireEvent.click(screen.getByRole("button", { name: /Générer sans répondre/ }));
    expect(onSkip).toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("une seule question : un seul bouton « Générer », sans lien « Passer les questions » en dessous", () => {
    render(<CreerStepQuestions {...base} questions={questions} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByTestId("creer-questions-next").textContent).toMatch(/Générer/);
    expect(screen.queryByTestId("creer-generate-direct")).toBeNull();
    expect(screen.queryByRole("button", { name: /Passer les questions|Générer avec mes précisions/ })).toBeNull();
  });

  it("aucune question en plus hors newsjacking ou quand on a déjà répondu", () => {
    const onNext = vi.fn(); const onSkip = vi.fn();
    const { unmount } = render(<CreerStepQuestions {...base} questions={questions} onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId("creer-questions-next"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    unmount();
    render(<CreerStepQuestions {...base} questions={questions} fieldQuestion={NEWSJACKING_FIELD_QUESTION} initialAnswers={{ q1: "Faire réagir" }} onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId("creer-questions-next"));
    expect(onNext).toHaveBeenCalledWith({ q1: "Faire réagir" });
  });
});
