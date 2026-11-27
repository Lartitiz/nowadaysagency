import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { StudioPendingSteps, pendingSteps } from "@/features/visual-studio/StudioPendingSteps";

// Loom du 27/11/2026 : pendant l'attente, le fil montre les étapes au lieu
// d'un seul « Je lis ta demande… » figé.
describe("Studio : étapes pendant l'attente de la réponse", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("avance d'étape en étape, les précédentes cochées", () => {
    render(<StudioPendingSteps withImages />);
    expect(screen.getByText(/Je lis ta demande/)).toBeTruthy();
    expect(screen.queryByText(/Je regarde ta photo/)).toBeNull();
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.getByText(/Je regarde ta photo/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText(/Je prépare ma proposition/)).toBeTruthy();
    expect(screen.getByText(/Je lis ta demande/).closest("li")?.className).toContain("text-muted-foreground");
  });

  it("sans image, ne prétend pas regarder une photo", () => {
    expect(pendingSteps(false).some((s) => /photo/.test(s.label))).toBe(false);
  });
});
