import { beforeEach, expect, it, vi } from "vitest";
import {
  deletePhotoCompletely,
  removePhotoFromLibrary,
  restorePhotoToLibrary,
} from "@/lib/photo-storage";
import { saveWorkflowCalendarDraft } from "@/lib/photo-workflows";
import { makePhotoRecipe } from "@/lib/photo-composition";

const state = vi.hoisted(() => ({
  rpcError: null as null | { message: string },
  files: new Set<string>(),
  row: true,
  removed: false,
  calendar: [] as any[],
  rpc: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: state.rpc,
    storage: {
      from: () => ({
        remove: state.remove,
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://assets.example.test/${path}` },
          error: null,
        }),
      }),
    },
    from: () => {
      const query: any = {
        eq: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({
          data: { storage_path: "fixture/final.jpg", status: "ready" },
          error: null,
        }),
      };
      return {
        select: () => query,
        insert: async (row: any) => {
          state.calendar.push(row);
          return { error: null };
        },
      };
    },
  },
}));

const photo = {
  id: "fixture-photo",
  storage_path: "fixture/final.jpg",
  original_storage_path: "fixture/original.jpg",
};

beforeEach(() => {
  state.rpcError = null;
  state.row = true;
  state.removed = false;
  state.calendar = [];
  state.files = new Set([photo.storage_path, photo.original_storage_path]);
  state.remove.mockReset();
  state.rpc.mockReset().mockImplementation(async (_name: string, args: any) => {
    if (state.rpcError) return { data: null, error: state.rpcError };
    state.removed = args.p_removed;
    return { data: { photo_id: args.p_photo_id, removed: state.removed }, error: null };
  });
});
it("G2: legacy complete deletion now performs a recoverable library removal", async () => {
  await deletePhotoCompletely(photo);
  expect(state.removed).toBe(true);
  expect(state.row).toBe(true);
  expect(state.files).toEqual(new Set([photo.storage_path, photo.original_storage_path]));
  expect(state.remove).not.toHaveBeenCalled();
});

it("G2: database failure preserves the row and every storage object", async () => {
  state.rpcError = { message: "Database unavailable" };
  await expect(removePhotoFromLibrary(photo)).rejects.toThrow("Database unavailable");
  expect(state.removed).toBe(false);
  expect(state.row).toBe(true);
  expect(state.files).toEqual(new Set([photo.storage_path, photo.original_storage_path]));
  expect(state.remove).not.toHaveBeenCalled();
});

it("G2: retries are safe and a removed photo can be restored", async () => {
  await removePhotoFromLibrary(photo);
  await removePhotoFromLibrary(photo);
  expect(state.removed).toBe(true);
  await restorePhotoToLibrary(photo.id);
  expect(state.removed).toBe(false);
  expect(state.rpc).toHaveBeenLastCalledWith("set_photo_library_visibility", {
    p_photo_id: photo.id,
    p_removed: false,
  });
});

it("G2: removing a library photo preserves the rendered calendar asset", async () => {
  await saveWorkflowCalendarDraft(
    {
      id: "output-id",
      photoId: photo.id,
      postId: "post-id",
      sourceIndex: 0,
      label: "Post",
      recipe: makePhotoRecipe(),
      enabled: true,
      approved: true,
      savedPhoto: true,
      caption: "Texte conservé",
      date: "2026-10-01",
    },
    {
      userId: "fixture-user",
      workspaceId: "fixture-workspace",
      name: "Visuel",
      workflowId: "workflow-id",
    },
  );
  const referencedPath = state.calendar[0].media_urls[0].replace(
    "https://assets.example.test/",
    "",
  );

  await deletePhotoCompletely(photo);

  expect(state.calendar[0].content_draft).toBe("Texte conservé");
  expect(state.files.has(referencedPath)).toBe(true);
  expect(state.row).toBe(true);
  expect(state.remove).not.toHaveBeenCalled();
});
