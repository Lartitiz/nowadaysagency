// Audit fixture — entirely in memory, no Supabase requests or paid processing.
import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRetouchExistingPhoto } from "@/hooks/use-user-photos";
const mocks = vi.hoisted(() => ({ row: { id: "audit-photo", status: "ready", storage_path: "result.jpg", original_storage_path: "source.jpg", background_prompt: "Ancien décor", background_preset_key: "studio" }, invoke: vi.fn(), copy: vi.fn(), remove: vi.fn(), rollbackFails: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "audit-user" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "audit-workspace" }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/photo-redescribe", () => ({ redescribePhoto: vi.fn() }));
vi.mock("@/lib/heic", () => ({ convertHeicIfNeeded: vi.fn() }));
vi.mock("@/lib/photo-storage", () => ({ USER_PHOTOS_BUCKET: "audit", uploadPhotoOriginal: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ copy: mocks.copy, remove: mocks.remove }) }, from: () => ({
  update: (patch: any) => ({ eq: async () => { if (patch.status === "ready" && mocks.rollbackFails) return { error: "offline" }; Object.assign(mocks.row, patch); return { error: null }; } }),
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: mocks.row.status } }) }) }),
}) } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.rollbackFails = false;
  Object.assign(mocks.row, { status: "ready", original_storage_path: "source.jpg", background_prompt: "Ancien décor", background_preset_key: "studio" });
  mocks.copy.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
  mocks.invoke.mockResolvedValue({ error: { message: "429 — quota simulé" } });
});
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
it.each([false, true])("première retouche : restaure l’originale sans effacer une copie préexistante (%s)", async (alreadyExists) => {
  mocks.row.original_storage_path = "result.jpg";
  if (alreadyExists) mocks.copy.mockResolvedValue({ error: { message: "already exists" } });
  const { result } = renderHook(() => useRetouchExistingPhoto());
  await act(async () => { await expect(result.current.mutate({ photo: { ...mocks.row } as any, backgroundPrompt: "Nouveau décor" })).rejects.toThrow("429"); });
  expect(mocks.row.original_storage_path).toBe("result.jpg");
  expect(mocks.row.background_prompt).toBe("Ancien décor");
  expect(mocks.remove).toHaveBeenCalledTimes(alreadyExists ? 0 : 1);
});
it("conserve la copie de sécurité si le rollback échoue", async () => {
  mocks.row.original_storage_path = "result.jpg"; mocks.rollbackFails = true;
  const { result } = renderHook(() => useRetouchExistingPhoto());
  await act(async () => { await expect(result.current.mutate({ photo: { ...mocks.row } as any, backgroundPrompt: "Nouveau décor" })).rejects.toThrow("429"); });
  expect(mocks.remove).not.toHaveBeenCalled();
});
