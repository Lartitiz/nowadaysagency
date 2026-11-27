import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QuestionCounter, QuestionField, QuestionsWaiting } from "@/components/creer/QuestionParts";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";
import { resetWaitClock } from "@/lib/generation-wait-clock";

describe("Pièces communes des questions", () => {
  beforeEach(() => { vi.useFakeTimers(); resetWaitClock(); });
  afterEach(() => vi.useRealTimers());

  it("l'attente : phrases qui tournent, barre qui plafonne, réassurance à 15 s puis 30 s", () => {
    render(<QuestionsWaiting messages={["Un", "Deux"]} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Un")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3600); });
    expect(screen.getByText("Deux")).toBeTruthy();
    expect(screen.queryByTestId("waiting-note")).toBeNull();
    act(() => { vi.advanceTimersByTime(12_000); });
    expect(screen.getByTestId("waiting-note").textContent).toMatch(/Je creuse/);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByTestId("waiting-note").textContent).toMatch(/un peu plus long/);
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThanOrEqual(90);
  });

  it("le compteur dit « Question 2 sur 4 » ou « Une question »", () => {
    const { rerender } = render(<QuestionCounter index={1} total={4} testId="c" />);
    expect(screen.getByTestId("c").textContent).toBe("Question 2 sur 4");
    rerender(<QuestionCounter index={0} total={1} suffix=" · facultatif" testId="c" />);
    expect(screen.getByTestId("c").textContent).toBe("Une question · facultatif");
  });

  it("le champ montre l'exemple et remonte la saisie", () => {
    const onChange = vi.fn();
    render(<QuestionField id="q1" question="Qui ?" example="une cliente" value="" onChange={onChange} placeholder="Ta réponse…" labelClassName="x" />);
    expect(screen.getByText("Par exemple : une cliente")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Qui ?"), { target: { value: "Moi" } });
    expect(onChange).toHaveBeenCalledWith("Moi");
  });

  it("/creer : pendant la préparation, l'écran d'attente commun s'affiche", () => {
    render(<CreerStepQuestions format="post" subject="s" questions={[]} loadingQuestions onNext={() => {}} onSkip={() => {}} onBack={() => {}} />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText(/Je prépare des questions sur-mesure/)).toBeTruthy();
  });
});
