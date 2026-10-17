import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CarouselPhotoWarning from "@/components/creer/CarouselPhotoWarning";

// Mesuré le 17/10/2026 : l'alerte naissait sous l'écran (ordi et téléphone), la cliente
// cliquait « Suivant » sans rien voir. Elle doit se ramener au milieu de l'écran.
describe("CarouselPhotoWarning : visible dès qu'elle apparaît", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  const noop = () => {};

  it("se fait défiler au milieu de l'écran à son apparition", () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<CarouselPhotoWarning libraryCount={3} onLibrary={noop} onStock={noop} onText={noop} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ block: "center" });
    expect(spy.mock.instances[0]).toBe(screen.getByTestId("carousel-photo-warning"));
    expect(screen.getByText("→ Choisir dans mes photos (3)")).toBeTruthy();
  });

  it("sans animation quand le mouvement réduit est demandé", () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    render(<CarouselPhotoWarning libraryCount={0} onLibrary={noop} onStock={noop} onText={noop} />);
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: "auto" });
  });
});
