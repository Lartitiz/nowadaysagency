import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import CarouselStructureLoader from "@/components/creer/CarouselStructureLoader";

// Le plan photo dure 55-64 s (mesure du 09/10/2026, 3 photos, 10 slides) :
// l'écran ne doit plus annoncer une trentaine de secondes.
describe("CarouselStructureLoader", () => {
  it("annonce une attente d'environ une minute avec des photos", () => {
    render(<CarouselStructureLoader hasPhotos />);
    expect(screen.getByText(/environ une minute/)).toBeTruthy();
    expect(screen.queryByText(/trentaine de secondes/)).toBeNull();
  });

  // 10/10/2026 : le serveur relance un second plan à 80 s ; l'écran le dit
  // au lieu de rester figé à 90 % jusqu'à 170 s.
  it("prévient quand le plan est plus long que d'habitude, pas avant", () => {
    vi.useFakeTimers();
    try {
      render(<CarouselStructureLoader hasPhotos />);
      act(() => { vi.advanceTimersByTime(80_000); });
      expect(screen.queryByText(/plus long que d'habitude/)).toBeNull();
      act(() => { vi.advanceTimersByTime(6_000); });
      expect(screen.getByText(/plus long que d'habitude/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
