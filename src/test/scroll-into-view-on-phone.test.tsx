import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useScrollIntoViewOnPhone } from "@/hooks/use-scroll-into-view-on-phone";

function Probe({ bottom }: { bottom: number }) {
  const ref = useScrollIntoViewOnPhone<HTMLDivElement>();
  return (
    <div
      ref={(el) => {
        (ref as any).current = el;
        if (el) el.getBoundingClientRect = () => ({ top: 400, bottom, height: bottom - 400 } as DOMRect);
      }}
      data-testid="cible"
    />
  );
}

function setDesktop(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: desktop, media: q })) as any;
}

describe("useScrollIntoViewOnPhone", () => {
  const scroll = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    scroll.mockReset();
    (HTMLElement.prototype as any).scrollIntoView = scroll;
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  it("téléphone : défile jusqu'à la story quand elle dépasse l'écran", () => {
    setDesktop(false);
    render(<Probe bottom={1100} />);
    vi.advanceTimersByTime(400);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.calls[0][0]).toMatchObject({ block: "start" });
  });

  it("ordi : ne défile jamais", () => {
    setDesktop(true);
    render(<Probe bottom={1100} />);
    vi.advanceTimersByTime(400);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("téléphone : ne bouge pas si la story tient déjà à l'écran", () => {
    setDesktop(false);
    render(<Probe bottom={800} />);
    vi.advanceTimersByTime(400);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("téléphone : ne reprend pas la main si la personne a déjà défilé", () => {
    setDesktop(false);
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    render(<Probe bottom={1100} />);
    vi.advanceTimersByTime(400);
    expect(scroll).not.toHaveBeenCalled();
  });
});
