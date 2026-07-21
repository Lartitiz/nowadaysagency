import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Garde Canva : si aucun compte Canva n'est connecté, cliquer « Ouvrir dans
// Canva » ne doit RIEN lancer (pas d'onglet, pas d'export PPTX de 1-2 min qui
// échoue à la fin) mais inviter tout de suite à connecter, avec un bouton vers
// Paramètres → Connexions. Bug du 21/07 : sur un compte sans Canva, l'onglet
// « Préparation… » s'ouvrait puis se fermait après 2 min sur un message sec.

const mocks = vi.hoisted(() => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  invokeWithTimeout: vi.fn(),
  navigate: vi.fn(),
  social: {
    known: true,
    connectedMap: {} as Record<string, boolean>,
    refresh: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invokeWithTimeout }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "u1" }));
vi.mock("@/hooks/use-social-connections", () => ({
  useSocialConnections: () => ({
    known: mocks.social.known,
    isConnected: (p: string) => !!mocks.social.connectedMap[p],
    refresh: mocks.social.refresh,
  }),
}));

import { useOpenInCanva } from "@/hooks/use-open-in-canva";

function makeFakeTab() {
  return {
    document: { write: vi.fn(), close: vi.fn() },
    closed: false,
    close: vi.fn(),
    location: { href: "" },
  } as any;
}

describe("garde « Ouvrir dans Canva » sans compte connecté", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.social.known = true;
    mocks.social.connectedMap = {};
  });

  it("bloque net : pas d'onglet, pas d'export, invitation à connecter", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(makeFakeTab());
    const buildBlob = vi.fn(async () => new Blob(["x"]));

    const { result } = renderHook(() => useOpenInCanva());
    expect(result.current.canvaConnected).toBe(false);

    await act(() => result.current.openInCanva(buildBlob, "Mon carrousel"));

    expect(openSpy).not.toHaveBeenCalled();
    expect(buildBlob).not.toHaveBeenCalled();
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);

    // Le message propose un bouton qui emmène vers la page de connexion.
    const [, opts] = mocks.toast.error.mock.calls[0];
    expect(opts.action.label).toBe("Connecter Canva");
    opts.action.onClick();
    expect(mocks.navigate).toHaveBeenCalledWith("/parametres/connexions");
    openSpy.mockRestore();
  });

  it("statut inconnu (échec réseau) → ne bloque pas, le serveur reste le filet", async () => {
    mocks.social.known = false;
    const fakeTab = makeFakeTab();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeTab);
    mocks.invokeWithTimeout.mockResolvedValue({ data: { error: "not_connected" }, error: null });

    const { result } = renderHook(() => useOpenInCanva());
    expect(result.current.canvaConnected).toBe(null);

    await act(() => result.current.openInCanva(async () => new Blob(["x"]), "Mon carrousel"));

    // Le flux a tenté sa chance, le serveur a répondu « pas connecté » :
    // l'onglet d'attente se ferme et la même invitation s'affiche.
    await waitFor(() => expect(fakeTab.close).toHaveBeenCalled());
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error.mock.calls[0][1].action.label).toBe("Connecter Canva");
    openSpy.mockRestore();
  });

  it("Canva connecté → le flux normal se déroule jusqu'à l'URL d'édition", async () => {
    mocks.social.connectedMap = { canva: true };
    const fakeTab = makeFakeTab();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeTab);
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { editUrl: "https://www.canva.com/design/xyz/edit" },
      error: null,
    });

    const { result } = renderHook(() => useOpenInCanva());
    expect(result.current.canvaConnected).toBe(true);

    await act(() => result.current.openInCanva(async () => new Blob(["x"]), "Mon carrousel"));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
    expect(fakeTab.location.href).toBe("https://www.canva.com/design/xyz/edit");
    expect(fakeTab.close).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
