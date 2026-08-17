import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// AdminRoute (src/components/AdminRoute.tsx) protège /admin/* : elle ne doit
// JAMAIS trancher `isAdmin` tant que `adminLoading` est vrai (fenêtre
// documentée dans AuthContext.tsx lignes 32-36 — un admin légitime ne doit pas
// se faire rediriger vers /dashboard le temps que son rôle soit vérifié).

const authState = vi.hoisted(() => ({
  current: {
    user: null as { id: string } | null,
    loading: false,
    isAdmin: false,
    adminLoading: false,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState.current,
}));

vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));

import AdminRoute from "@/components/AdminRoute";

function renderAdminRoute() {
  return render(
    <AdminRoute>
      <div data-testid="admin-content">Contenu admin</div>
    </AdminRoute>
  );
}

describe("AdminRoute — résolution de l'accès admin", () => {
  beforeEach(() => {
    authState.current = { user: null, loading: false, isAdmin: false, adminLoading: false };
  });

  it("session en cours de résolution (loading) → écran de chargement, ni redirection ni contenu", () => {
    authState.current = { user: null, loading: true, isAdmin: false, adminLoading: false };
    renderAdminRoute();

    expect(screen.queryByTestId("navigate")).toBeNull();
    expect(screen.queryByTestId("admin-content")).toBeNull();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it("état transitoire adminLoading=true (user connu, rôle pas encore vérifié) → écran de chargement, PAS de redirection vers /dashboard", () => {
    authState.current = { user: { id: "admin-1" }, loading: false, isAdmin: false, adminLoading: true };
    renderAdminRoute();

    expect(screen.queryByTestId("navigate")).toBeNull();
    expect(screen.queryByTestId("admin-content")).toBeNull();
    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it("pas connecté → redirige vers /login", () => {
    authState.current = { user: null, loading: false, isAdmin: false, adminLoading: false };
    renderAdminRoute();

    const nav = screen.getByTestId("navigate");
    expect(nav.dataset.to).toBe("/login");
    expect(screen.queryByTestId("admin-content")).toBeNull();
  });

  it("connecté mais pas admin (rôle résolu) → redirige vers /dashboard", () => {
    authState.current = { user: { id: "u1" }, loading: false, isAdmin: false, adminLoading: false };
    renderAdminRoute();

    const nav = screen.getByTestId("navigate");
    expect(nav.dataset.to).toBe("/dashboard");
    expect(screen.queryByTestId("admin-content")).toBeNull();
  });

  it("admin légitime, rôle résolu → affiche le contenu admin, aucune redirection", () => {
    authState.current = { user: { id: "admin-1" }, loading: false, isAdmin: true, adminLoading: false };
    renderAdminRoute();

    expect(screen.queryByTestId("navigate")).toBeNull();
    expect(screen.getByTestId("admin-content")).toBeInTheDocument();
  });
});
