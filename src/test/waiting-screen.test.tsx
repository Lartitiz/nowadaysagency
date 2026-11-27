import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import WaitingScreen, { DEFAULT_REASSURANCE } from "@/components/creer/WaitingScreen";
import { resetWaitClock, waitPhaseEnded, waitPhaseStarted } from "@/lib/generation-wait-clock";

const bar = () => Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));

describe("WaitingScreen", () => {
  beforeEach(() => { vi.useFakeTimers(); resetWaitClock(); });
  afterEach(() => vi.useRealTimers());

  it("fait tourner les phrases passées en paramètre", () => {
    render(<WaitingScreen rotation={{ messages: ["Un", "Deux", "Trois"], everyMs: 3500 }} />);
    expect(screen.getByText("Un")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3600); });
    expect(screen.getByText("Deux")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(7000); });
    expect(screen.getByText("Un")).toBeTruthy();
  });

  it("barre honnête : monte, ralentit, plafonne sans jamais atteindre 100 %", () => {
    render(<WaitingScreen rotation={{ messages: ["a"], everyMs: 1000 }} tauSeconds={25} ceiling={90} />);
    expect(bar()).toBe(0);
    act(() => { vi.advanceTimersByTime(10_000); });
    const at10 = bar();
    expect(at10).toBeGreaterThan(20);
    act(() => { vi.advanceTimersByTime(20_000); });
    const at30 = bar();
    expect(at30 - at10).toBeLessThan(at10 * 2);
    act(() => { vi.advanceTimersByTime(300_000); });
    expect(bar()).toBe(90);
  });

  it("affiche « Déjà X s » puis en minutes, après la phrase de durée", () => {
    render(<WaitingScreen rotation={{ messages: ["a"], everyMs: 1000 }} hint="Compte une minute." elapsedTestId="t" />);
    expect(screen.getByTestId("t").textContent).toBe("Déjà 0 s.");
    act(() => { vi.advanceTimersByTime(65_000); });
    expect(screen.getByTestId("t").textContent).toBe("Déjà 1 min 05.");
    expect(screen.getByText(/Compte une minute\./)).toBeTruthy();
  });

  it("le chrono continue d'un écran d'attente à l'autre", () => {
    const first = render(<WaitingScreen shareClock rotation={{ messages: ["a"], everyMs: 1000 }} elapsedTestId="t" />);
    act(() => { vi.advanceTimersByTime(40_000); });
    expect(screen.getByTestId("t").textContent).toBe("Déjà 40 s.");
    first.unmount();
    act(() => { vi.advanceTimersByTime(2_000); });
    render(<WaitingScreen shareClock rotation={{ messages: ["b"], everyMs: 1000 }} elapsedTestId="t" />);
    expect(screen.getByTestId("t").textContent).toBe("Déjà 42 s.");
  });

  it("un écran sans chrono partagé repart de zéro", () => {
    waitPhaseStarted(); waitPhaseEnded();
    act(() => { vi.advanceTimersByTime(60_000); });
    render(<WaitingScreen rotation={{ messages: ["a"], everyMs: 1000 }} elapsedTestId="t" />);
    expect(screen.getByTestId("t").textContent).toBe("Déjà 0 s.");
  });

  it("réassurance à 15 s puis à 30 s, pas avant", () => {
    render(<WaitingScreen notes={DEFAULT_REASSURANCE} rotation={{ messages: ["a"], everyMs: 1000 }} />);
    act(() => { vi.advanceTimersByTime(14_000); });
    expect(screen.queryByTestId("waiting-note")).toBeNull();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByTestId("waiting-note").textContent).toBe(DEFAULT_REASSURANCE[0].text);
    act(() => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByTestId("waiting-note").textContent).toBe(DEFAULT_REASSURANCE[1].text);
  });

  it("phrases qui suivent le temps (timeline)", () => {
    render(<WaitingScreen timeline={[{ time: 0, text: "Début" }, { time: 5000, text: "Milieu" }]} />);
    expect(screen.getByText("Début")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5_500); });
    expect(screen.getByText("Milieu")).toBeTruthy();
  });
});
