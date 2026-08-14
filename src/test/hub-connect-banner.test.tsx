import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Vérifie le signal de connexion ajouté au calendrier (audit du 14/08, PR #741) :
// HubConnectBanner doit s'afficher pour Instagram/LinkedIn quand le compte n'est
// PAS connecté, et rester invisible connecté ou pendant le chargement (jamais de
// faux « déconnecté » pendant un cold start). Pas de compte de test disponible
// pour vérifier ça en live (comptes réels tous connectés) → couvert ici.

const mocks = vi.hoisted(() => ({
  social: { loading: false, connectedMap: {} as Record<string, boolean> },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-social-connections", () => ({
  useSocialConnections: () => ({
    loading: mocks.social.loading,
    isConnected: (p: string) => !!mocks.social.connectedMap[p],
  }),
}));

import HubConnectBanner from "@/components/hub/HubConnectBanner";

beforeEach(() => {
  mocks.social.loading = false;
  mocks.social.connectedMap = {};
});

describe("HubConnectBanner — compte déconnecté", () => {
  it("invite à connecter Instagram avec un lien vers les connexions", () => {
    render(<HubConnectBanner platform="instagram" />);
    expect(screen.getByText(/publier tes posts en 1 clic/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Connecter Instagram/ });
    expect(link).toHaveAttribute("href", "/parametres/connexions");
  });

  it("invite à connecter LinkedIn avec un lien vers les connexions", () => {
    render(<HubConnectBanner platform="linkedin" />);
    const link = screen.getByRole("link", { name: /Connecter LinkedIn/ });
    expect(link).toHaveAttribute("href", "/parametres/connexions");
  });
});

describe("HubConnectBanner — pas de faux négatif", () => {
  it("ne s'affiche pas quand le compte est déjà connecté", () => {
    mocks.social.connectedMap = { instagram: true };
    const { container } = render(<HubConnectBanner platform="instagram" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ne s'affiche pas pendant le chargement (pas de flash « déconnecté »)", () => {
    mocks.social.loading = true;
    const { container } = render(<HubConnectBanner platform="linkedin" />);
    expect(container).toBeEmptyDOMElement();
  });
});
