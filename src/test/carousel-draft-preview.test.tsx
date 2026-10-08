import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CarouselDraftPreview } from "@/components/creer/CarouselDraftPreview";

const slides = [
  { n: 1, title: "Ce qui rend mon travail unique", text: "" },
  { n: 2, title: "La réponse trop rapide", text: "Je réponds souvent trop vite." },
];

describe("CarouselDraftPreview — slides en brouillon pendant l'écriture", () => {
  it("affiche les slides reçues, le badge brouillon et le compte en cours d'écriture", () => {
    render(<CarouselDraftPreview slides={slides} stage="writing" />);
    expect(screen.getByText("Ce qui rend mon travail unique")).toBeInTheDocument();
    expect(screen.getByText("Je réponds souvent trop vite.")).toBeInTheDocument();
    expect(screen.getByText("Brouillon, sera relu")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 slides écrites");
    // Pas de champ modifiable : c'est un aperçu.
    expect(document.querySelector("input, textarea, [contenteditable]")).toBeNull();
  });

  it("suit les vraies étapes et ne recule jamais (correction après le fil = reprise de l'enchaînement)", () => {
    const { rerender } = render(<CarouselDraftPreview slides={slides} stage="correcting" />);
    expect(screen.getByRole("status")).toHaveTextContent("Je relis ton texte");
    rerender(<CarouselDraftPreview slides={slides} stage="checking" />);
    expect(screen.getByRole("status")).toHaveTextContent("Je vérifie que les slides s'enchaînent");
    rerender(<CarouselDraftPreview slides={slides} stage="correcting" />);
    expect(screen.getByRole("status")).toHaveTextContent("J'ajuste l'enchaînement");
  });
});

describe("CarouselDraftPreview — plan envisagé pendant la réflexion", () => {
  it("montre les titres prévus tant qu'aucune slide n'est écrite, puis les vraies slides", () => {
    const outline = ["Couverture prévue", "Le constat prévu", "La conclusion prévue"];
    const { rerender } = render(<CarouselDraftPreview slides={[]} outline={outline} stage="writing" />);
    expect(screen.getByText("Plan envisagé, peut changer")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("voici le plan envisagé");
    expect(screen.getByText("Le constat prévu")).toBeInTheDocument();
    rerender(<CarouselDraftPreview slides={slides} outline={outline} stage="writing" />);
    expect(screen.queryByText("Le constat prévu")).toBeNull();
    expect(screen.getByText("Brouillon, sera relu")).toBeInTheDocument();
    expect(screen.getByText("La réponse trop rapide")).toBeInTheDocument();
  });
});
