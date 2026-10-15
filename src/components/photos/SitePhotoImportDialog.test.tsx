import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ owner: "cliente-1", profileReads: [] as string[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "manager-1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "ws-1", useProfileUserId: () => m.owner }));
vi.mock("@/hooks/use-social-connections", () => ({
  useSocialConnections: () => ({ connected: {}, known: true, loading: false, refresh: vi.fn() }),
}));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (_col: string, val: string) => ({ maybeSingle: () => {
    m.profileReads.push(val);
    return Promise.resolve({ data: { website_url: "www.site-cliente.fr" } });
  } }) }) }),
} }));
import { SitePhotoImportDialog } from "@/components/photos/SitePhotoImportDialog";

const props = { open: true, onOpenChange: vi.fn(), maxSelectable: 5, onImportFiles: vi.fn() };
beforeEach(() => { m.owner = "cliente-1"; m.profileReads = []; });
afterEach(cleanup);

describe("SitePhotoImportDialog — site pré-rempli", () => {
  it("mode Binôme : pré-remplit le site de la cliente, pas celui de la manager", async () => {
    render(<SitePhotoImportDialog {...props} />);
    await waitFor(() => expect(screen.getByDisplayValue("www.site-cliente.fr")).toBeInTheDocument());
    expect(m.profileReads).toEqual(["cliente-1"]);
  });

  it("ne lit aucun profil tant que la propriétaire de l'espace n'est pas connue", async () => {
    m.owner = "";
    render(<SitePhotoImportDialog {...props} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(m.profileReads).toEqual([]);
  });
});
