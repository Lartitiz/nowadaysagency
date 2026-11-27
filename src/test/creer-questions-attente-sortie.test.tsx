import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";
import { resetWaitClock } from "@/lib/generation-wait-clock";

// Loom du 27/11/2026 : 30 à 50 s devant « Je creuse… », sans rien pouvoir faire.
describe("CreerStepQuestions : attente qui traîne", () => {
  beforeEach(() => { vi.useFakeTimers(); resetWaitClock(); });
  afterEach(() => vi.useRealTimers());

  it("dit que l'essai est relancé et ouvre « Passer les questions » à 15 s, pas avant", () => {
    const onSkip = vi.fn(); const onNext = vi.fn();
    render(<CreerStepQuestions format="reel" subject="Mon sujet" questions={[]} loadingQuestions onNext={onNext} onSkip={onSkip} onBack={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(14_000); });
    expect(screen.queryByTestId("creer-questions-skip-wait")).toBeNull();
    expect(screen.queryByTestId("waiting-note")).toBeNull();
    act(() => { vi.advanceTimersByTime(1_500); });
    expect(screen.getByTestId("waiting-note").textContent).toMatch(/je relance/);
    fireEvent.click(screen.getByTestId("creer-questions-skip-wait"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });
});
