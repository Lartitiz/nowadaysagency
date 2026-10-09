import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CarouselStructureLoader from "@/components/creer/CarouselStructureLoader";

// Le plan photo dure 55-64 s (mesure du 09/10/2026, 3 photos, 10 slides) :
// l'écran ne doit plus annoncer une trentaine de secondes.
describe("CarouselStructureLoader", () => {
  it("annonce une attente d'environ une minute avec des photos", () => {
    render(<CarouselStructureLoader hasPhotos />);
    expect(screen.getByText(/environ une minute/)).toBeTruthy();
    expect(screen.queryByText(/trentaine de secondes/)).toBeNull();
  });
});
