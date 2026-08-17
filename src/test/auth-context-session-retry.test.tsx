import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// Garde-fou : un getSession() initial qui échoue (timeout réseau, déploiement en
// cours, etc.) n'est PAS la même chose qu'une absence de session — ça résout
// normalement avec { session: null }, ça ne rejette pas. AuthContext.tsx doit
// retenter une fois avant de conclure "pas connecté" et de laisser ProtectedRoute
// rediriger vers /login, pour ne pas éjecter un utilisateur en pleine frappe
// (ex. CreerUnifie) sur un simple accroc réseau transitoire.

const state = vi.hoisted(() => ({
  getSession: vi.fn() as any,
  navigate: vi.fn(),
}));

// Navigate stable entre les rendus : un mock qui renvoie une nouvelle fonction
// à chaque appel ferait re-déclencher l'effet (dep [navigate]) et fausserait
// le comptage des appels à getSession().
vi.mock("react-router-dom", () => ({ useNavigate: () => state.navigate }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: state.getSession,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
          })),
        })),
      })),
    })),
  },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DemoProvider } from "@/contexts/DemoContext";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <AuthProvider>{children}</AuthProvider>
    </DemoProvider>
  );
}

describe("AuthContext — retry sur échec réseau du getSession() initial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/creer");
  });

  it("un premier échec réseau suivi d'un succès restaure la session, sans passer par un état déconnecté durable", async () => {
    state.getSession
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ data: { session: { user: { id: "u1" } } } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user?.id).toBe("u1"), { timeout: 3000 });
    expect(result.current.loading).toBe(false);
    expect(state.getSession).toHaveBeenCalledTimes(2);
  }, 5000);

  it("deux échecs consécutifs retombent sur l'état déconnecté (comportement de repli inchangé)", async () => {
    state.getSession.mockRejectedValue(new Error("network timeout"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.user).toBeNull();
    expect(state.getSession).toHaveBeenCalledTimes(2);
  }, 5000);
});
