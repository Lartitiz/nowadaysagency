import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Une nouvelle venue qui clique « S'abonner » sur /pricing arrive sur /login.
// Elle doit voir tout de suite comment créer son compte, pas « Bon retour ! ».

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: {} } }));
vi.mock("@/hooks/use-page-seo", () => ({ usePageSEO: () => {} }));
vi.mock("@/components/BrandLogo", () => ({ default: () => null }));

import LoginPage from "@/pages/LoginPage";

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><LoginPage /></MemoryRouter>);

describe("LoginPage — arrivée par le Premium", () => {
  it("propose de créer un compte en premier quand on vient de « S'abonner »", () => {
    renderAt("/login?offer=outil&redirect=%2Fpricing%3Fselected%3Dpremium");
    expect(screen.queryByText("Bon retour !")).toBeNull();
    const cta = screen.getByRole("link", { name: "Créer mon compte gratuit" });
    expect(cta.getAttribute("href")).toBe("/?offer=outil#signup-section");
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeTruthy();
  });

  it("garde « Bon retour ! » pour une connexion simple", () => {
    renderAt("/login");
    expect(screen.getByText("Bon retour !")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Créer mon compte gratuit" })).toBeNull();
  });
});
