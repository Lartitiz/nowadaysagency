import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-page-seo", () => ({ usePageSEO: vi.fn() }));
vi.mock("@/components/landing/MiniDiagnostic", () => ({
  default: () => <div>Diagnostic existant</div>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: vi.fn(), resend: vi.fn() } },
}));
import LandingPage from "@/pages/LandingPage";

function openLanding(path = "/") {
  window.history.replaceState({}, "", path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/dashboard"
          element={<div>Tableau de bord existant</div>}
        />
        <Route
          path="/onboarding"
          element={<div>Bienvenue dans le parcours initial</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("Accueil public — parcours conservés après refonte", () => {
  it("raccorde tous les appels à créer un compte au vrai formulaire", () => {
    openLanding();
    const form = screen.getByRole("form", { name: "Formulaire d'inscription" });
    expect(form.closest("#signup-section")).not.toBeNull();
    for (const link of screen.getAllByRole("link", {
      name: /Créer mon compte/,
    })) {
      expect(link).toHaveAttribute("href", "#signup-section");
    }
    expect(screen.getByLabelText("Email")).toBeVisible();
  });
  it("conserve le choix Premium dans l’inscription et la connexion", () => {
    openLanding("/?offer=outil#signup-section");
    expect(screen.getByText(/Offre choisie/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
      "href",
      "/login?offer=outil&redirect=%2Fpricing%3Fselected%3Dpremium",
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
  it("ouvre la vue produit qui correspond à chaque aperçu", () => {
    openLanding();
    fireEvent.click(screen.getByRole("link", { name: /Ton calendrier/ }));
    expect(
      screen.getByRole("heading", {
        name: "Vois ta communication d’un coup d’œil.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Les organiser" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("link", { name: /Tes carrousels/ }));
    expect(
      screen.getByRole("heading", { name: "Ajuste le texte et les slides." }),
    ).toBeVisible();
  });
  it("ferme le menu mobile après une navigation", () => {
    openLanding();
    const menu = screen.getByRole("button", { name: "Menu ☰" });
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("link", { name: "La méthode" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
  it("redirige un compte existant vers son tableau de bord", () => {
    auth.user = { id: "existing-user" };
    openLanding();
    expect(screen.getByText("Tableau de bord existant")).toBeVisible();
  });
  it("conserve la priorité de l’onboarding sans consommer son marqueur", () => {
    auth.user = { id: "new-user" };
    sessionStorage.setItem("lac_fresh_signup", "1");
    openLanding();
    expect(
      screen.getByText("Bienvenue dans le parcours initial"),
    ).toBeVisible();
    expect(sessionStorage.getItem("lac_fresh_signup")).toBe("1");
  });
});
