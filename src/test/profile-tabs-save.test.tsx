import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import Profile from "@/pages/Profile";

// Page /profil : 4 onglets (plan simplicité du 15/10/2026) et enregistrement
// qui vise profiles par user_id. Avant, l'enregistrement visait workspace_id
// (vide dans profiles) : aucune ligne touchée, mais « Modifications enregistrées ».
const m = vi.hoisted(() => ({
  writes: [] as { table: string; patch: any; filters: any[][] }[],
  updatedRows: [{ user_id: "owner-1" }] as any[],
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  // Objet stable : un nouvel objet à chaque rendu relancerait le chargement sans fin.
  profile: {
    data: { prenom: "Camille", activite: "Savonnière", type_activite: "artisane", main_goal: "visibility", weekly_time: "1h", website_url: "" },
    isLoading: false, isError: false, refetch: () => {},
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: "workspace_id", value: "ws-1" }),
  useProfileFilter: () => ({ column: "user_id", value: "owner-1" }),
}));
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => m.profile,
}));
vi.mock("@/hooks/use-active-channels", () => ({
  ALL_CHANNELS: [{ id: "instagram", label: "Instagram", emoji: "📱" }],
  useActiveChannels: () => ({ channels: ["instagram"], setChannels: async () => true, loading: false, error: "", saving: false, canEdit: true, reload: () => {} }),
}));
vi.mock("@/hooks/use-unsaved-changes", () => ({ useUnsavedChanges: () => {} }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: (props: any) => <input {...props} /> }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: m.toastSuccess, error: m.toastError }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: any[][] = [];
      let patch: any = null;
      const q: any = {
        select: () => (patch ? Promise.resolve({ data: table === "profiles" ? m.updatedRows : [{ user_id: "owner-1" }], error: null }) : q),
        update: (p: any) => { patch = p; m.writes.push({ table, patch: p, filters }); return q; },
        eq: (...args: any[]) => { filters.push(args); return q; },
        maybeSingle: () => Promise.resolve({
          // Ligne ancienne sans workspace_id : seule la lecture par user_id la trouve.
          data: filters.some(f => f[0] === "user_id") ? { main_goal: "visibility", level: "beginner", weekly_time: "less_2h" } : null,
          error: null,
        }),
      };
      return q;
    },
  },
}));

beforeEach(() => { m.writes = []; m.updatedRows = [{ user_id: "owner-1" }]; m.toastSuccess.mockReset(); m.toastError.mockReset(); });

const renderAt = (url: string) => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}><Profile /></MemoryRouter></QueryClientProvider>,
);

it("ouvre l'onglet demandé dans l'adresse et affiche les choix au bon format", async () => {
  renderAt("/profil?onglet=rythme");
  // « 1h » (format onboarding) est ignoré au profit de user_plan_config.
  const chip = await screen.findByRole("button", { name: "Moins de 2h" });
  expect(chip.className).toContain("bg-primary");
  expect(screen.queryByLabelText("Prénom")).toBeNull();
});

it("enregistre profiles par user_id et prévient si aucune ligne n'est touchée", async () => {
  renderAt("/profil?onglet=liens");
  fireEvent.change(await screen.findByLabelText("Site web"), { target: { value: "https://exemple.fr" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes infos" }));
  await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled());
  const profileWrite = m.writes.find(w => w.table === "profiles")!;
  expect(profileWrite.filters).toEqual([["user_id", "owner-1"]]);
  expect(profileWrite.patch.website_url).toBe("https://exemple.fr");

  m.updatedRows = [];
  fireEvent.change(screen.getByLabelText("Site web"), { target: { value: "https://autre.fr" } });
  // Le bouton affiche « ✅ Enregistré » 2 s après un succès.
  fireEvent.click(await screen.findByRole("button", { name: "Enregistrer mes infos" }, { timeout: 3000 }));
  await waitFor(() => expect(m.toastError).toHaveBeenCalled());
});

it("montre le compte Instagram donné au démarrage et garde les deux champs alignés", async () => {
  // Passe complète du 16/10/2026 : le démarrage range le compte dans
  // instagram_username, l'onglet Mes liens ne lisait que instagram_url (vide).
  m.profile.data = { ...m.profile.data, instagram_username: "atelier_lou" } as any;
  try {
    renderAt("/profil?onglet=liens");
    const field = await screen.findByLabelText("Instagram");
    expect((field as HTMLInputElement).value).toBe("https://instagram.com/atelier_lou");
    fireEvent.change(field, { target: { value: "instagram.com/lou_ceramique/" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes infos" }));
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled());
    const patch = m.writes.find(w => w.table === "profiles")!.patch;
    expect(patch.instagram_url).toBe("instagram.com/lou_ceramique/");
    expect(patch.instagram_username).toBe("lou_ceramique");
  } finally {
    delete (m.profile.data as any).instagram_username;
  }
});
