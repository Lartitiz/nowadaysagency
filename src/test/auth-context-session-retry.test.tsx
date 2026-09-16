import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, screen, act } from "@testing-library/react";
import type { ReactNode } from "react";

// Read failures are not proof of sign-out. Verify recovery UI, real sign-out,
// SDK error responses, and auth events winning over stale bootstrap reads.

const state = vi.hoisted(() => ({
  getSession: vi.fn() as any,
  navigate: vi.fn(),
  listener: null as any,
}));

// Navigate stable entre les rendus : un mock qui renvoie une nouvelle fonction
// à chaque appel ferait re-déclencher l'effet (dep [navigate]) et fausserait
// le comptage des appels à getSession().
vi.mock("react-router-dom", () => ({ useNavigate: () => state.navigate }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((listener) => { state.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
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
    state.getSession.mockReset();
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

  it("deux erreurs affichent une reprise sans les confondre avec une déconnexion", async () => {
    state.getSession.mockRejectedValue(new DOMException("signal is aborted without reason", "AbortError"));
    renderHook(() => useAuth(), { wrapper });
    expect(await screen.findByRole("button", { name: "Recharger la page" }, { timeout: 3000 })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de vérifier ta connexion");
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.getSession).toHaveBeenCalledTimes(2);
  });

  it("une réponse avec error est une lecture échouée, même sans rejet de promesse", async () => {
    state.getSession.mockResolvedValue({ data: { session: null }, error: new Error("offline") });
    renderHook(() => useAuth(), { wrapper });
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toBeVisible();
  });

  it("une absence de session confirmée reste déconnectée, sans écran d'erreur", async () => {
    state.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("INITIAL_SESSION null ne conclut pas avant la lecture qui peut échouer", async () => {
    let reject!: (reason: unknown) => void;
    state.getSession.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await state.listener("INITIAL_SESSION", null); });
    expect(result.current.loading).toBe(true);
    // Nettoyage de la promesse sans démarrer de seconde lecture pendant le test.
    await act(async () => { await state.listener("SIGNED_OUT", null); reject(new Error("late")); });
  });

  it("un événement de session valide gagne contre un échec initial tardif", async () => {
    let reject!: (reason: unknown) => void;
    state.getSession.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await state.listener("SIGNED_IN", { access_token: "new", user: { id: "u2" } });
      reject(new Error("late error"));
    });
    expect(result.current.user?.id).toBe("u2");
    expect(result.current.loading).toBe(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(state.getSession).toHaveBeenCalledTimes(1);
  });

  it("une déconnexion explicite gagne contre un ancien succès tardif", async () => {
    let resolve!: (value: unknown) => void;
    state.getSession.mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await state.listener("SIGNED_OUT", null);
      resolve({ data: { session: { access_token: "old", user: { id: "old" } } } });
    });
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(state.navigate).toHaveBeenCalledWith("/login");
  });

  it("un nouvel événement valide permet de sortir de l'écran de reprise", async () => {
    state.getSession.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await screen.findByRole("alert", {}, { timeout: 3000 });
    await act(async () => { await state.listener("TOKEN_REFRESHED", { access_token: "fresh", user: { id: "u1" } }); });
    await waitFor(() => expect(result.current.user?.id).toBe("u1"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("une session initiale valide respecte le retour interne depuis login", async () => {
    window.history.replaceState({}, "", "/login?redirect=%2Fcreer%3Fcanal%3Dlinkedin");
    state.getSession.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await state.listener("INITIAL_SESSION", { access_token: "valid", user: { id: "u1" } }); });
    expect(result.current.user?.id).toBe("u1");
    expect(state.navigate).toHaveBeenCalledWith("/creer?canal=linkedin");
  });

  it("changer de route ne relance pas la lecture initiale de session", async () => {
    state.getSession.mockResolvedValue({ data: { session: { access_token: "valid", user: { id: "u1" } } } });
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe("u1"));
    state.navigate = vi.fn();
    window.history.replaceState({}, "", "/photos");
    rerender();
    expect(state.getSession).toHaveBeenCalledTimes(1);
  });

});
