import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CarouselModePicker, { CAROUSEL_MODES } from "@/components/creer/CarouselModePicker";

// QA du 12/11/2026 : « Texte design, Tes photos en fond… lequel ? ». Chaque rendu porte sa ligne d'explication, visible sans cliquer.
describe("CarouselModePicker : une ligne d'explication sous chaque rendu", () => {
  it("affiche les 5 rendus, chacun avec sa ligne, même non choisi", () => {
    render(<CarouselModePicker value="photo" recommended="photo" onChange={() => {}} />);
    expect(CAROUSEL_MODES.map((m) => m.id)).toEqual(["text", "photo", "mix", "pure_photo", "user_slides"]);
    for (const mode of CAROUSEL_MODES) {
      const card = screen.getByTestId(`carousel-mode-${mode.id}`);
      expect(card).toHaveTextContent(mode.label);
      expect(screen.getByTestId(`carousel-mode-hint-${mode.id}`)).toHaveTextContent(mode.hint);
      expect(card).toContainElement(screen.getByTestId(`carousel-mode-hint-${mode.id}`));
    }
  });

  it("garde des lignes courtes (une ligne lisible sur mobile)", () => {
    for (const mode of CAROUSEL_MODES) expect(mode.hint.length).toBeLessThanOrEqual(45);
  });

  it("garde le rendu conseillé présélectionné et marqué", () => {
    render(<CarouselModePicker value="text" recommended="text" onChange={() => {}} />);
    expect(screen.getByTestId("carousel-mode-text")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("carousel-mode-text")).toHaveTextContent("Conseillé");
    expect(screen.getByTestId("carousel-mode-photo")).not.toHaveTextContent("Conseillé");
  });
});
