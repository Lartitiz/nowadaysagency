// Vérification temporaire : le diagnostic d'onboarding rend en slides (desktop inclus).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DEMO_DIAGNOSTIC } from "@/lib/diagnostic-data";

vi.mock("@/hooks/use-pending-brand-review", () => ({
  usePendingBrandReview: () => ({ pending: false, checking: false }),
}));
vi.mock("@/components/onboarding/BrandLearnedSection", () => ({
  default: () => <div data-testid="brand-learned">Fiche marque</div>,
}));
vi.mock("@/components/Confetti", () => ({ default: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import DiagnosticView from "@/components/onboarding/DiagnosticView";

describe("DiagnosticView — mode slides unique", () => {
  it("rend en slides sur desktop : une section à la fois, navigation Suivant + clavier", async () => {
    render(<DiagnosticView data={DEMO_DIAGNOSTIC} prenom="Léa" onComplete={() => {}} />);
    // Slide 1 : accroche visible, niveau PAS encore rendu (pas de page à scroller)
    expect(screen.getByText(/voilà ce que je vois/)).toBeTruthy();
    expect(screen.queryByText("Où tu en es aujourd'hui")).toBeNull();
    expect(screen.getByText(/Clique Suivant ou utilise les flèches/)).toBeTruthy();

    // Avance au clavier jusqu'au niveau (slide 2 ou 3 selon présence du résumé)
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Où tu en es aujourd'hui")).toBeTruthy();

    // Avance avec le bouton Suivant jusqu'à la fin
    for (let i = 0; i < 10; i++) {
      const next = screen.queryByRole("button", { name: /Suivant/ });
      if (!next) break;
      fireEvent.click(next);
    }
    // Dernière slide : écran final avec CTA, plus de bouton Suivant
    expect(await screen.findByText(/Maintenant, tu sais d'où tu pars/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Suivant/ })).toBeNull();
  });
});
