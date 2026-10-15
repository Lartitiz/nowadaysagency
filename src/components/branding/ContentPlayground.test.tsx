import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContentPlayground from "./ContentPlayground";

const m = vi.hoisted(() => ({ calls: [] as any[][], body: null as any, owner: "owner-1" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "manager-1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({
  useWorkspaceFilter: () => ({ column: "workspace_id", value: "ws-1" }),
  useProfileFilter: () => ({ column: "user_id", value: m.owner }),
}));
vi.mock("@/lib/invoke-with-timeout", () => ({
  invokeWithTimeout: (_fn: string, opts: any) => { m.body = opts.body; return Promise.resolve({ data: { content: "Texte" }, error: null }); },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "t" } } }) },
  from: (table: string) => {
    const q: any = {
      select: () => q,
      eq: (col: string, val: string) => { m.calls.push([table, col, val]); return q; },
      maybeSingle: () => Promise.resolve({ data: { prenom: "Camille" }, error: null }),
    };
    return q;
  },
} }));

beforeEach(() => { m.calls = []; m.body = null; m.owner = "owner-1"; });

describe("ContentPlayground", () => {
  it("lit le profil de la propriétaire par user_id, jamais par workspace_id", async () => {
    render(<MemoryRouter><ContentPlayground section="story" /></MemoryRouter>);
    fireEvent.click(screen.getByText("3 accroches basées sur mon histoire"));
    await waitFor(() => expect(m.body).not.toBeNull());
    expect(m.calls).toEqual([["profiles", "user_id", "owner-1"]]);
    expect(m.body.profile).toEqual({ prenom: "Camille" });
  });

  it("n'appelle pas l'IA tant que la propriétaire n'est pas connue", async () => {
    m.owner = "";
    render(<MemoryRouter><ContentPlayground section="story" /></MemoryRouter>);
    fireEvent.click(screen.getByText("3 accroches basées sur mon histoire"));
    await new Promise((r) => setTimeout(r, 20));
    expect(m.body).toBeNull();
    expect(m.calls).toEqual([]);
  });
});
