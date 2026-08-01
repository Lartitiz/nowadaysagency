import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, act, waitFor } from "@testing-library/react";

// Parcours cassés du 01/08. (1) Depuis /creer, « Ouvrir dans Canva » sans compte
// connecté envoyait dans Paramètres → Connexions ; après l'autorisation Canva on
// retombait sur la page des connexions, et RIEN ne ramenait au contenu en cours.
// Ces tests fabriquent le parcours complet : le départ (mémo posé) et le retour
// (redirection vers le contenu).

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  invokeWithTimeout: vi.fn(),
  invoke: vi.fn(),
  social: { known: true, connectedMap: {} as Record<string, boolean>, refresh: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invokeWithTimeout }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: { user: { id: "u1" } } }),
}));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "u1" }));
vi.mock("@/hooks/use-social-connections", () => ({
  useSocialConnections: () => ({
    known: mocks.social.known,
    isConnected: (p: string) => !!mocks.social.connectedMap[p],
    refresh: mocks.social.refresh,
  }),
}));

import SocialConnectionsCard from "@/components/SocialConnectionsCard";
import { useOpenInCanva } from "@/hooks/use-open-in-canva";
import {
  CHEMIN_CONNEXIONS,
  lireRetour,
  memoriseRetour,
  oublieRetour,
} from "@/lib/retour-apres-detour";

function allerSur(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.social.known = true;
  mocks.social.connectedMap = {};
  mocks.invoke.mockResolvedValue({ data: { connections: [] }, error: null });
  allerSur("/");
});

describe("mémo « d'où je viens »", () => {
  it("garde le chemin ET sa query", () => {
    allerSur("/creer?format=carrousel&sujet=savon");
    memoriseRetour();
    expect(lireRetour()?.chemin).toBe("/creer?format=carrousel&sujet=savon");
  });

  it("refuse une destination externe (pas de redirection sauvage)", () => {
    memoriseRetour("https://site-pirate.example/vol");
    expect(lireRetour()).toBeNull();
    memoriseRetour("//site-pirate.example/vol");
    expect(lireRetour()).toBeNull();
  });

  it("ne se mémorise pas elle-même quand on part DES connexions", () => {
    allerSur(CHEMIN_CONNEXIONS);
    memoriseRetour();
    expect(lireRetour()).toBeNull();
  });

  it("oublie un mémo trop vieux (plus de 30 min)", () => {
    memoriseRetour("/creer");
    const perime = { chemin: "/creer", quoi: "ton contenu en cours", ts: Date.now() - 31 * 60 * 1000 };
    sessionStorage.setItem("retour_apres_detour", JSON.stringify(perime));
    expect(lireRetour()).toBeNull();
  });
});

describe("aller : « Connecter Canva » depuis l'atelier", () => {
  it("note qu'on vient de /creer avant d'aller aux connexions", async () => {
    allerSur("/creer");
    const { result } = renderHook(() => useOpenInCanva());

    await act(() => result.current.openInCanva(async () => new Blob(["x"]), "Mon carrousel"));

    // Le message « pas connecté » propose le bouton : on le clique.
    const [, opts] = mocks.toast.error.mock.calls[0];
    opts.action.onClick();

    expect(mocks.navigate).toHaveBeenCalledWith(CHEMIN_CONNEXIONS);
    expect(lireRetour()?.chemin).toBe("/creer");
    expect(lireRetour()?.quoi).toBe("ton contenu en cours");
  });
});

describe("retour : une fois le compte connecté", () => {
  it("ramène au contenu en cours au lieu de laisser dans les paramètres", async () => {
    memoriseRetour("/creer");
    // Retour d'OAuth : l'edge renvoie sur la page des connexions avec ?connected=
    allerSur(`${CHEMIN_CONNEXIONS}?connected=canva`);

    render(<SocialConnectionsCard />);

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/creer"));
    // Et on le DIT, pour que la redirection ne soit pas une surprise.
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Canva connecté !",
      expect.objectContaining({ description: "On te ramène à ton contenu en cours." }),
    );
    // Mémo consommé : un rechargement de la page ne re-déclenche pas le retour.
    expect(lireRetour()).toBeNull();
  });

  it("sans mémo, on reste sur les connexions (venue exprès des paramètres)", async () => {
    oublieRetour();
    allerSur(`${CHEMIN_CONNEXIONS}?connected=instagram`);

    render(<SocialConnectionsCard />);

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("une connexion en échec garde le mémo pour le prochain essai", async () => {
    memoriseRetour("/calendrier");
    allerSur(`${CHEMIN_CONNEXIONS}?connected=error&message=Jeton%20expir%C3%A9`);

    render(<SocialConnectionsCard />);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(lireRetour()?.chemin).toBe("/calendrier");
  });
});
