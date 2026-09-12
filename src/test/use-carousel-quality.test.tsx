import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const check = vi.hoisted(() => vi.fn());
vi.mock("@/lib/carousel-quality", () => ({ checkCarouselQuality: check }));
import { useCarouselQuality } from "@/hooks/use-carousel-quality";
beforeEach(() => {
  vi.useFakeTimers();
  check.mockReset();
  check.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
describe("quality publishing gate", () => {
  it("blocks while checking and invalidates an old pass as soon as a slide changes", async () => {
    const { result, rerender } = renderHook(
      (slides) => useCarouselQuality(slides, true),
      { initialProps: [{ html: "A" }] },
    );
    expect(result.current.disabledReason).toContain("en cours");
    await settle();
    expect(result.current.disabledReason).toBeUndefined();
    rerender([{ html: "B" }]);
    expect(result.current.disabledReason).toContain("en cours");
  });
  it("blocks definite errors but not readability advice", async () => {
    check.mockResolvedValueOnce([{ severity: "error", kind: "overflow" }]);
    const { result } = renderHook(() => useCarouselQuality(slides, true));
    await settle();
    expect(result.current.disabledReason).toContain("Corrige");
    check.mockResolvedValueOnce([{ severity: "warning", kind: "size" }]);
    act(() => result.current.recheck());
    await settle();
    expect(result.current.disabledReason).toBeUndefined();
  });
  it("never turns a failed renderer into a successful check", async () => {
    check.mockRejectedValueOnce(new Error("timeout"));
    const { result } = renderHook(() => useCarouselQuality(slides, true));
    await settle();
    expect(result.current.status).toBe("error");
    expect(result.current.disabledReason).toContain("Relance");
  });
  it("cancels outdated checks and ignores their late results", async () => {
    let resolve!: (issues: any[]) => void;
    check.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result, rerender } = renderHook(
      (s) => useCarouselQuality(s, true),
      { initialProps: [{ html: "A" }] },
    );
    await settle();
    const signal = check.mock.calls[0][1];
    rerender([{ html: "B" }]);
    await settle();
    await act(async () => resolve([{ severity: "error" }]));
    expect(signal.aborted).toBe(true);
    expect(result.current.disabledReason).toBeUndefined();
  });
});
const slides = [{ html: "test" }];
