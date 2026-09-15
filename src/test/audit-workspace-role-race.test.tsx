// Audit only: actual provider with controlled membership responses.
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";

const data = vi.hoisted(() => ({
  roleRequests: [] as { workspace: string; resolve: (value: any) => void }[],
  invalidate: vi.fn(),
  setFlowWorkspaceId: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/use-flow-persistence", () => ({ setFlowWorkspaceId: data.setFlowWorkspaceId }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "audit-user" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: data.invalidate }) }));
vi.mock("sonner", () => ({ toast: { error: data.toastError } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let workspace = "";
      const query: any = {
        select: () => query,
        eq: (key: string, value: string) => {
          if (key === "workspace_id") workspace = value;
          return query;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve({
            error: null,
            data: [
              ["A", "owner"],
              ["B", "manager"],
              ["C", "viewer"],
            ].map(([id, role]) => ({
              role,
              workspaces: { id, name: id, slug: null, avatar_url: null, plan: "free" },
            })),
          }).then(resolve, reject),
        maybeSingle: () => new Promise((resolve) => data.roleRequests.push({ workspace, resolve })),
      };
      return query;
    },
  },
}));

beforeEach(() => {
  localStorage.clear();
  data.roleRequests = [];
  data.invalidate.mockClear();
  data.setFlowWorkspaceId.mockClear();
  data.toastError.mockClear();
});

afterEach(cleanup);

async function mount() {
  const view = renderHook(() => useWorkspace(), {
    wrapper: ({ children }: any) => <WorkspaceProvider>{children}</WorkspaceProvider>,
  });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  expect(view.result.current.activeWorkspace?.id).toBe("A");
  return view;
}

it("control: one resolved switch yields matching workspace and role", async () => {
  const { result } = await mount();
  let done!: Promise<boolean>;
  act(() => {
    done = result.current.switchWorkspace("C");
  });
  await act(async () => {
    data.roleRequests[0].resolve({ data: { role: "viewer" }, error: null });
    await done;
  });
  expect(result.current.activeWorkspace?.id).toBe("C");
  expect(result.current.activeRole).toBe("viewer");
});

it("G3: a pending switch exposes no inherited rights and keeps the last coherent workspace", async () => {
  const { result } = await mount();

  act(() => {
    void result.current.switchWorkspace("C");
  });

  expect(result.current.activeWorkspace?.id).toBe("A");
  expect(result.current.activeRole).toBeNull();
  expect(result.current.loading).toBe(true);
  expect(result.current.switchingWorkspaceId).toBe("C");
  expect(data.setFlowWorkspaceId).toHaveBeenLastCalledWith("A");
});

it("G3: a stale B role response must not replace the role of current workspace C", async () => {
  const { result } = await mount();
  let b!: Promise<boolean>;
  let c!: Promise<boolean>;
  act(() => {
    b = result.current.switchWorkspace("B");
  });
  act(() => {
    c = result.current.switchWorkspace("C");
  });
  let cSucceeded: boolean | undefined;
  await act(async () => {
    data.roleRequests.find((request) => request.workspace === "C")!.resolve({ data: { role: "viewer" }, error: null });
    cSucceeded = await c;
  });
  let bSucceeded: boolean | undefined;
  await act(async () => {
    data.roleRequests.find((request) => request.workspace === "B")!.resolve({ data: { role: "manager" }, error: null });
    bSucceeded = await b;
  });
  expect(cSucceeded).toBe(true);
  expect(bSucceeded).toBe(false);
  expect(result.current.activeWorkspace?.id).toBe("C");
  expect(result.current.activeRole).toBe("viewer");
  expect(result.current.switchingWorkspaceId).toBeNull();
  expect(data.invalidate).toHaveBeenCalledTimes(1);
});

it("G3: a failed role lookup must not confirm switching with inherited owner rights", async () => {
  const { result } = await mount();
  let done!: Promise<boolean>;
  let success: boolean | undefined;
  act(() => {
    done = result.current.switchWorkspace("C");
  });
  await act(async () => {
    data.roleRequests[0].resolve({ data: null, error: { message: "Role unavailable" } });
    success = await done;
  });
  expect(success).toBe(false);
  expect(result.current.activeWorkspace?.id).toBe("A");
  expect(result.current.activeRole).toBe("owner");
  expect(result.current.loading).toBe(false);
  expect(result.current.switchingWorkspaceId).toBeNull();
  expect(localStorage.getItem("active_workspace_id")).toBe("A");
  expect(data.invalidate).not.toHaveBeenCalled();
  expect(data.toastError).toHaveBeenCalledWith(
    "Impossible de vérifier tes droits sur cet espace.",
    expect.objectContaining({ description: expect.stringContaining("L'espace actuel reste ouvert") }),
  );
});

it("G3: returning to A cancels an unresolved A to B switch", async () => {
  const { result } = await mount();
  let b!: Promise<boolean>;
  let backToA!: Promise<boolean>;

  act(() => {
    b = result.current.switchWorkspace("B");
  });
  act(() => {
    backToA = result.current.switchWorkspace("A");
  });

  await expect(backToA).resolves.toBe(true);
  expect(result.current.activeWorkspace?.id).toBe("A");
  expect(result.current.activeRole).toBe("owner");
  expect(result.current.loading).toBe(false);

  let staleSucceeded: boolean | undefined;
  await act(async () => {
    data.roleRequests.find((request) => request.workspace === "B")!.resolve({ data: { role: "manager" }, error: null });
    staleSucceeded = await b;
  });

  expect(staleSucceeded).toBe(false);
  expect(result.current.activeWorkspace?.id).toBe("A");
  expect(result.current.activeRole).toBe("owner");
  expect(data.invalidate).not.toHaveBeenCalled();
});

it("G3: a newly granted workspace is added only with its verified role", async () => {
  const { result } = await mount();
  let done!: Promise<boolean>;

  act(() => {
    done = result.current.switchWorkspace("D");
  });

  await act(async () => {
    data.roleRequests[0].resolve({
      data: {
        role: "manager",
        workspaces: { id: "D", name: "Delta", slug: null, avatar_url: null, plan: "free" },
      },
      error: null,
    });
    await expect(done).resolves.toBe(true);
  });

  expect(result.current.activeWorkspace?.id).toBe("D");
  expect(result.current.activeRole).toBe("manager");
  expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(["A", "B", "C", "D"]);
});
