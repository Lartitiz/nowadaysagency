import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  demo: false,
  website: "www.mon-site.fr" as string | null,
  charter: null as { id?: string; logo_url?: string | null } | null,
  scan: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  owner: "user-test",
  profileReads: [] as string[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-test" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: m.demo }) }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: "workspace_id", value: "ws-1" }),
  useWorkspaceId: () => "ws-1",
  useProfileUserId: () => m.owner,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.scan }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table !== "profiles") return { data: m.charter, error: null };
            m.profileReads.push(val);
            return { data: { website_url: m.website } };
          },
        }),
      }),
      update: (payload: unknown) => ({ eq: async () => { m.update(payload); return { error: null }; } }),
      insert: async (payload: unknown) => { m.insert(payload); return { error: null }; },
    }),
    storage: {
      from: () => ({
        upload: async (...args: unknown[]) => { m.upload(...args); return { error: null }; },
        getPublicUrl: () => ({ data: { publicUrl: "https://storage.test/brand-assets/user-test/logo/logo" } }),
      }),
    },
  },
}));
import { BrandLogoSuggestion } from "@/components/branding/BrandLogoSuggestion";

beforeEach(() => {
  m.demo = false;
  m.website = "www.mon-site.fr";
  m.charter = null;
  m.owner = "user-test";
  m.profileReads = [];
  vi.clearAllMocks();
  m.scan.mockImplementation(async (_fn: string, { body }: { body: { mode: string } }) =>
    body.mode === "logo"
      ? { data: { success: true, logo: "https://mon-site.fr/logo.png" } }
      : { data: { base64: btoa("x"), contentType: "image/png" } },
  );
});
afterEach(cleanup);

describe("BrandLogoSuggestion", () => {
  it("propose le logo du site et l'ajoute à la charte au clic", async () => {
    render(<BrandLogoSuggestion placement="brand_review" />);
    expect(await screen.findByAltText("Logo trouvé sur ton site")).toHaveAttribute("src", "https://mon-site.fr/logo.png");
    expect(m.upload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce logo" }));

    await screen.findByText("Ajouté à ta charte graphique");
    expect(m.upload.mock.calls[0][0]).toBe("user-test/logo/logo");
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-test", workspace_id: "ws-1", logo_url: expect.stringContaining("?v=") }),
    );
  });

  it("met à jour la charte existante sans logo", async () => {
    m.charter = { id: "charter-1", logo_url: null };
    render(<BrandLogoSuggestion placement="welcome" />);
    fireEvent.click(await screen.findByRole("button", { name: "Utiliser ce logo" }));
    await screen.findByText("Ajouté à ta charte graphique");
    expect(m.update).toHaveBeenCalledWith({ logo_url: expect.stringContaining("?v=") });
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("ne propose rien si la charte a déjà un logo", async () => {
    m.charter = { id: "charter-1", logo_url: "https://storage.test/old.png" };
    const { container } = render(<BrandLogoSuggestion placement="welcome" />);
    await waitFor(() => expect(m.scan).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("se masque si le site n'a pas de logo ou si l'edge n'est pas à jour", async () => {
    m.scan.mockResolvedValueOnce({ data: { error: "mode invalide (scan | fetch | instagram)" } });
    const { container } = render(<BrandLogoSuggestion placement="welcome" />);
    await waitFor(() => expect(m.scan).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("« Ce n'est pas mon logo » masque la carte sans rien écrire", async () => {
    const { container } = render(<BrandLogoSuggestion placement="welcome" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ce n'est pas mon logo" }));
    expect(container).toBeEmptyDOMElement();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("mode Binôme : lit le site dans le profil de la cliente, pas celui de la manager", async () => {
    m.owner = "cliente-1";
    render(<BrandLogoSuggestion placement="brand_review" />);
    await screen.findByAltText("Logo trouvé sur ton site");
    expect(m.profileReads).toEqual(["cliente-1"]);
  });

  it("attend de connaître la propriétaire de l'espace avant de lire le profil", async () => {
    m.owner = "";
    render(<BrandLogoSuggestion placement="welcome" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(m.profileReads).toEqual([]);
    expect(m.scan).not.toHaveBeenCalled();
  });

  it("reste masqué en mode démo", () => {
    m.demo = true;
    const { container } = render(<BrandLogoSuggestion placement="welcome" />);
    expect(container).toBeEmptyDOMElement();
    expect(m.scan).not.toHaveBeenCalled();
  });
});
