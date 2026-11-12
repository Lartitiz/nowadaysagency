import { beforeEach, describe, expect, it } from "vitest";
import { resetWaitClock, waitPhaseEnded, waitPhaseStarted } from "@/lib/generation-wait-clock";

describe("chrono d'attente d'une création", () => {
  beforeEach(() => resetWaitClock());

  it("plan puis rédaction enchaînés : un seul départ", () => {
    expect(waitPhaseStarted(1_000)).toBe(1_000);
    waitPhaseEnded(41_000);
    expect(waitPhaseStarted(42_000)).toBe(1_000);
  });

  it("nouvelle création plus tard : le chrono repart", () => {
    waitPhaseStarted(1_000);
    waitPhaseEnded(180_000);
    expect(waitPhaseStarted(240_000)).toBe(240_000);
  });

  it("deux écrans d'attente en même temps : même départ", () => {
    waitPhaseStarted(1_000);
    expect(waitPhaseStarted(3_000)).toBe(1_000);
  });
});
