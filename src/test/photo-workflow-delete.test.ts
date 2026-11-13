import { describe, it, expect, vi, beforeEach } from "vitest";
const calls = vi.hoisted(() => ({ eq: [] as [string, string][], result: { data: [{ id: "x" }] as unknown, error: null as unknown } }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = { delete: () => chain, eq: (k: string, v: string) => { calls.eq.push([k, v]); return chain; },
    select: () => Promise.resolve(calls.result) };
  return { supabase: { from: () => chain } };
});
import { deletePhotoWorkflow } from "@/lib/photo-workflows";
const ID = "11111111-1111-4111-8111-111111111111", WS = "22222222-2222-4222-8222-222222222222";
describe("deletePhotoWorkflow", () => {
  beforeEach(() => { calls.eq = []; calls.result = { data: [{ id: ID }], error: null }; });
  it("targets one preparation of the active workspace", async () => {
    await deletePhotoWorkflow(ID, WS);
    expect(calls.eq).toEqual([["id", ID], ["workspace_id", WS], ["kind", "preparation"]]);
  });
  it("reports a silent no-op (already deleted or not allowed) instead of claiming success", async () => {
    calls.result = { data: [], error: null };
    await expect(deletePhotoWorkflow(ID, WS)).rejects.toThrow(/déjà été supprimée/);
  });
  it("rejects malformed ids without calling the database", async () => {
    await expect(deletePhotoWorkflow("x", WS)).rejects.toThrow(/introuvable/);
    expect(calls.eq).toEqual([]);
  });
});
