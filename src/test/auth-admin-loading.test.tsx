import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// Garde-fou anti-course sur la résolution du rôle admin (AuthContext.tsx
// lignes 32-36 et 282-286) : `adminLoading` est DÉRIVÉ au rendu à partir de
// `adminCheckedForUserId`, pas piloté par un effet, pour qu'il passe à `true`
// dans le MÊME rendu que celui où `user` devient défini. Un state piloté par
// effet serait toujours en retard d'un rendu, ouvrant une fenêtre où
// AdminRoute verrait `user` défini et `adminLoading` encore false → redirection
// à tort d'un admin légitime vers /dashboard. Ce test verrouille cette garantie.

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const state = vi.hoisted(() => ({
  session: Promise.resolve({ data: { session: null } }) as Promise<any>,
  role: Promise.resolve({ data: null }) as Promise<any>,
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => state.session),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => state.role),
          })),
        })),
      })),
    })),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DemoProvider } from "@/contexts/DemoContext";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <AuthProvider>{children}</AuthProvider>
    </DemoProvider>
  );
}

describe("AuthContext — adminLoading dérivé (garde anti-course)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Éloigne le path de "/", "/login", "/connexion" pour ne pas déclencher
    // la résolution post-auth (resolvePostAuthRoute), hors sujet ici.
    window.history.replaceState({}, "", "/admin/audit");
  });

  it("adminLoading passe à true dès que `user` est défini, avant que le rôle soit vérifié", async () => {
    const roleDeferred = createDeferred<{ data: { role: string } | null }>();
    state.session = Promise.resolve({ data: { session: { user: { id: "admin-1" } } } });
    state.role = roleDeferred.promise;

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user?.id).toBe("admin-1"));
    // Le rôle n'est pas encore revenu du serveur : adminLoading doit déjà être vrai.
    expect(result.current.adminLoading).toBe(true);
    expect(result.current.isAdmin).toBe(false);

    roleDeferred.resolve({ data: { role: "admin" } });

    await waitFor(() => expect(result.current.adminLoading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("utilisateur connecté mais non-admin : adminLoading retombe à false, isAdmin reste false", async () => {
    const roleDeferred = createDeferred<{ data: null }>();
    state.session = Promise.resolve({ data: { session: { user: { id: "u1" } } } });
    state.role = roleDeferred.promise;

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user?.id).toBe("u1"));
    expect(result.current.adminLoading).toBe(true);

    roleDeferred.resolve({ data: null });

    await waitFor(() => expect(result.current.adminLoading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });

  it("pas de session : adminLoading reste false et aucune vérification de rôle n'est lancée", async () => {
    state.session = Promise.resolve({ data: { session: null } });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.adminLoading).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
