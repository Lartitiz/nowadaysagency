// Audit fixture — entirely in memory, no Supabase requests or paid processing.
import { expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRetouchExistingPhoto } from "@/hooks/use-user-photos";
const mocks = vi.hoisted(() => ({ row: { id: "audit-photo", status: "ready", storage_path: "result.jpg", original_storage_path: "source.jpg", background_prompt: "Ancien décor", background_preset_key: "studio" }, invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "audit-user" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "audit-workspace" }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/photo-redescribe", () => ({ redescribePhoto: vi.fn() }));
vi.mock("@/lib/heic", () => ({ convertHeicIfNeeded: vi.fn() }));
vi.mock("@/lib/photo-storage", () => ({ USER_PHOTOS_BUCKET: "audit", uploadPhotoOriginal: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  update: (patch: any) => ({ eq: async () => { Object.assign(mocks.row, patch); return { error: null }; } }),
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: mocks.row.status } }) }) }),
}) } }));
it("après refus 429 restaure la photo et les métadonnées du décor précédent", async () => {
  mocks.invoke.mockResolvedValue({ error: { message: "429 — quota simulé" } });
  const { result } = renderHook(() => useRetouchExistingPhoto());
  await act(async () => {
    await expect(result.current.mutate({ photo: { ...mocks.row } as any, backgroundPrompt: "Nouveau décor" })).rejects.toThrow("429");
  });
  expect(mocks.row.status).toBe("ready");
  expect(mocks.row.original_storage_path).toBe("source.jpg");
  expect(mocks.row.background_prompt).toBe("Ancien décor");
  expect(mocks.row.background_preset_key).toBe("studio");
  expect(result.current.isPending).toBe(false);
});
