import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarronnierBanner } from "@/components/calendar/MarronnierBanner";

const profile: { data: Record<string, unknown> } = { data: {} };
vi.mock("@/hooks/use-profile", () => ({ useProfile: () => profile }));
vi.mock("@/lib/marronniers", () => ({
  activeMarronnier: () => ({ marronnier: { key: "halloween", label: "Halloween", emoji: "🎃" }, date: new Date("2026-10-31"), daysUntil: 6 }),
}));

describe("bandeau saisonnier « photos produit »", () => {
  it("s'affiche à qui vend des produits", () => {
    profile.data = { type_activite: "coach", product_or_service: "both" };
    render(<MarronnierBanner onDecliner={() => {}} />);
    expect(screen.getByText(/Halloween, c'est dans 6 jours/)).toBeInTheDocument();
  });

  it("ne s'affiche pas à qui a dit « Des services » à l'inscription (champ product_or_service)", () => {
    profile.data = { type_activite: "coach", product_or_service: "services" };
    const { container } = render(<MarronnierBanner onDecliner={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
