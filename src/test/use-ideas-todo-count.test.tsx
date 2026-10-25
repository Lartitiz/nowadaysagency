import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// Client Supabase factice : rpc + from().select().eq().is().or() (la chaîne du repli).
const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  head: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => db.rpc(...a),
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ or: () => db.head() }) }),
      }),
    }),
  },
}));
import {
  fetchIdeasTodoCount,
  ideasCountRetryDelay,
  IDEAS_COUNT_RETRY,
  isMissingFunction,
  useIdeasTodoCount,
} from "@/hooks/use-ideas-todo-count";

const client = { rpc: (...a: unknown[]) => db.rpc(...a), from: () => ({ select: () => ({ eq: () => ({ is: () => ({ or: () => db.head() }) }) }) }) } as never;

beforeEach(() => {
  db.rpc.mockReset();
  db.head.mockReset();
  localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const wrap = (retry: number | boolean = false) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, Wrapper, retry };
};

describe("fetchIdeasTodoCount", () => {
  it("prend le compte de la RPC quand elle existe", async () => {
    db.rpc.mockResolvedValue({ data: 487, error: null });
    await expect(fetchIdeasTodoCount(client, "u1", "ws1")).resolves.toBe(487);
    expect(db.rpc).toHaveBeenCalledWith("count_ideas_a_faire", { p_workspace_id: "ws1" });
    expect(db.head).not.toHaveBeenCalled();
  });
  it("sans espace, appelle la RPC sans argument (count par user_id côté base)", async () => {
    db.rpc.mockResolvedValue({ data: 3, error: null });
    await expect(fetchIdeasTodoCount(client, "u1", null)).resolves.toBe(3);
    expect(db.rpc).toHaveBeenCalledWith("count_ideas_a_faire", {});
  });
  it("retombe sur l'ancien HEAD count tant que la fonction n'est pas en base (PGRST202)", async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.count_ideas_a_faire" } });
    db.head.mockResolvedValue({ count: 12, error: null });
    await expect(fetchIdeasTodoCount(client, "u1", "ws1")).resolves.toBe(12);
    expect(db.head).toHaveBeenCalledTimes(1);
  });
  it("laisse remonter une vraie erreur (délai dépassé) avec son code en console, sans la maquiller en 0", async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    await expect(fetchIdeasTodoCount(client, "u1", "ws1")).rejects.toMatchObject({ code: "57014" });
    expect(db.head).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[accueil] compteur d'idées (rpc)", "57014", expect.stringContaining("timeout"));
  });
  it("reconnaît une fonction absente, pas une autre erreur", () => {
    expect(isMissingFunction({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunction({ code: "42883" })).toBe(true);
    expect(isMissingFunction({ code: "57014" })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
  it("retente 2 fois, après 1 s puis 3 s", () => {
    expect(IDEAS_COUNT_RETRY).toBe(2);
    expect(ideasCountRetryDelay(0)).toBe(1000);
    expect(ideasCountRetryDelay(1)).toBe(3000);
    expect(ideasCountRetryDelay(2)).toBe(3000);
  });
});

describe("useIdeasTodoCount", () => {
  it("lecture réussie : affiche le compte et le mémorise pour la prochaine fois", async () => {
    db.rpc.mockResolvedValue({ data: 42, error: null });
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useIdeasTodoCount("u1", "ws1", { retry: false }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.count).toBe(42));
    expect(result.current).toMatchObject({ known: true, fromMemory: false, isError: false });
    expect(localStorage.getItem("lac_ideas_todo_count:ws1")).toBe("42");
  });
  it("échec sans rien de connu : known=false → le bandeau a sa place, jamais « 0 » silencieux", async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useIdeasTodoCount("u1", "ws1", { retry: false }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toMatchObject({ count: 0, known: false, fromMemory: false });
  });
  it("échec avec un compte d'hier en mémoire : le garde (fromMemory) au lieu du bandeau", async () => {
    localStorage.setItem("lac_ideas_todo_count:ws1", "487");
    db.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useIdeasTodoCount("u1", "ws1", { retry: false }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toMatchObject({ count: 487, known: true, fromMemory: true });
  });
  it("la mémoire d'un autre espace ne déteint pas", async () => {
    localStorage.setItem("lac_ideas_todo_count:ws-autre", "99");
    db.rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useIdeasTodoCount("u1", "ws1", { retry: false }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.known).toBe(false);
  });
  it("sans utilisatrice : rien n'est lu", () => {
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useIdeasTodoCount(undefined, null), { wrapper: Wrapper });
    expect(result.current.known).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
    act(() => undefined);
  });
});
