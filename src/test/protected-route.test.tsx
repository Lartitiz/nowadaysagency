import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ProtectedRoute (src/components/ProtectedRoute.tsx) est un fichier très
// actif avec plusieurs bugs de race condition déjà corrigés d'après ses
// propres commentaires (ex: le 13/08, une redirection prématurée arrachait
// une utilisatrice d'une page déjà affichée en plein travail). Ces tests
// couvrent : la redirection /login, l'absence de redirection prématurée
// pendant le chargement de la session, le gating onboarding, et le
// blocage/déblocage des routes admin cachées (isRouteVisible).

const mocks = vi.hoisted(() => ({
  auth: {
    user: null as { id: string } | null,
    session: null as { access_token: string } | null,
    loading: false,
    isAdmin: false,
    adminLoading: false,
  },
  demo: { isDemoMode: false },
  location: { pathname: "/dashboard" },
  resolveOnboardingStatus: vi.fn(async () => "done" as "done" | "needs" | "unknown"),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => mocks.location,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => mocks.demo }));
vi.mock("@/lib/onboarding-status", () => ({
  resolveOnboardingStatus: (...args: unknown[]) => mocks.resolveOnboardingStatus(...(args as [])),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="app-header" /> }));
vi.mock("@/components/demo/DemoBanner", () => ({ default: () => <div data-testid="demo-banner" /> }));

import ProtectedRoute from "@/components/ProtectedRoute";

function renderProtected() {
  return render(
    <ProtectedRoute>
      <div data-testid="children">contenu protégé</div>
    </ProtectedRoute>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.auth.user = { id: "u1" };
  mocks.auth.session = { access_token: "tok" };
  mocks.auth.loading = false;
  mocks.auth.isAdmin = false;
  mocks.auth.adminLoading = false;
  mocks.demo.isDemoMode = false;
  mocks.location.pathname = "/dashboard";
  mocks.resolveOnboardingStatus.mockResolvedValue("done");
});

describe("ProtectedRoute — redirection /login", () => {
  it("redirige vers /login quand il n'y a pas d'utilisateur·ice", async () => {
    mocks.auth.user = null;
    renderProtected();
    await waitFor(() => {
      const nav = screen.getByTestId("navigate");
      expect(nav).toHaveAttribute("data-to", "/login");
    });
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });
});

describe("ProtectedRoute — pas de redirection prématurée pendant le chargement", () => {
  it("affiche l'état de chargement (pas /login) tant que la session est en cours de résolution", async () => {
    mocks.auth.loading = true;
    mocks.auth.session = null;
    renderProtected();

    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
    expect(screen.getByTestId("app-header")).toBeInTheDocument();
  });

  it("n'appelle pas resolveOnboardingStatus tant que le token de session n'est pas injecté", async () => {
    mocks.auth.loading = false;
    mocks.auth.session = null;
    renderProtected();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mocks.resolveOnboardingStatus).not.toHaveBeenCalled();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });
});

describe("ProtectedRoute — gating onboarding", () => {
  it("redirige vers /onboarding quand le statut est \"needs\"", async () => {
    mocks.resolveOnboardingStatus.mockResolvedValue("needs");
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/onboarding");
    });
  });

  it("laisse passer et affiche les enfants quand le statut est \"done\"", async () => {
    mocks.resolveOnboardingStatus.mockResolvedValue("done");
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("laisse passer sans rediriger quand le statut est \"unknown\" (pas de faux positif sur un null)", async () => {
    mocks.resolveOnboardingStatus.mockResolvedValue("unknown");
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("ne redéclenche pas le check quand on est déjà sur /onboarding", async () => {
    mocks.location.pathname = "/onboarding";
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
    expect(mocks.resolveOnboardingStatus).not.toHaveBeenCalled();
  });
});

describe("ProtectedRoute — routes admin cachées (isRouteVisible)", () => {
  // /seo est un module désactivé (enabled: false) dans src/config/feature-flags.ts,
  // donc invisible pour les non-admin et visible pour les admin. On teste avec le
  // vrai isRouteVisible plutôt qu'un mock, pour couvrir l'intégration réelle.
  it("redirige un·e utilisateur·ice non-admin loin d'un module masqué", async () => {
    mocks.location.pathname = "/seo";
    mocks.auth.isAdmin = false;
    mocks.auth.adminLoading = false;
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/dashboard");
    });
  });

  it("laisse un·e admin accéder à un module masqué", async () => {
    mocks.location.pathname = "/seo";
    mocks.auth.isAdmin = true;
    mocks.auth.adminLoading = false;
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("attend la résolution du rôle admin avant de rediriger (pas de faux négatif au cold load)", async () => {
    mocks.location.pathname = "/seo";
    mocks.auth.isAdmin = false;
    mocks.auth.adminLoading = true;
    renderProtected();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("laisse passer une route non concernée par un flag (pas de faux positif)", async () => {
    mocks.location.pathname = "/dashboard";
    mocks.auth.isAdmin = false;
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId("children")).toBeInTheDocument();
    });
  });
});
