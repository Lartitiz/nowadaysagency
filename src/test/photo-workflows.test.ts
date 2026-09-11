import { beforeEach, expect, it, vi } from "vitest";
import { makePhotoRecipe } from "@/lib/photo-composition";
const mock = vi.hoisted(() => ({ responses: [] as any[], calls: [] as any[], sign: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call: any = { table }; mock.calls.push(call);
  const query: any = { then: (resolve: any, reject: any) => Promise.resolve(mock.responses.shift() || { data: null, error: null }).then(resolve, reject) };
  for (const method of ["select", "eq", "in", "update", "insert", "maybeSingle", "single", "order", "limit"]) query[method] = (...args: any[]) => { (call[method] ||= []).push(args); return query; };
  return query;
} } }));
vi.mock("@/lib/photo-storage", () => ({ USER_PHOTOS_BUCKET: "user-photos", getSignedPhotoUrl: mock.sign }));
import { parsePreparation, serialisePreparation, saveWorkflowCalendarDraft, savePhotoWorkflow, isCalendarDate, type PreparedPhotoOutput } from "@/lib/photo-workflows";
const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"];
const output = (): PreparedPhotoOutput => ({ id: ids[0], photoId: ids[1], postId: ids[2], sourceIndex: 0, label: "Post", recipe: makePhotoRecipe(), enabled: true, approved: true, savedPhoto: true, caption: "Sac Alba", date: "2026-09-18" });
beforeEach(() => { mock.calls.length = 0; mock.responses.length = 0; mock.sign.mockReset().mockResolvedValue("https://example.test/private.png"); });
it("keeps only asset references, survives a roundtrip, and rejects broken sources", () => {
  const data = serialisePreparation([{ id: ids[0], photoId: ids[0], name: "Source", dataUrl: "data:image/png;base64,secret", cutoutUrl: "data:image/png;base64,mask" }], [output()], {});
  expect(JSON.stringify(data)).not.toMatch(/base64|secret|mask/);
  expect(parsePreparation(data).outputs[0]).toEqual({ ...output(), savedPost: false });
  expect(() => parsePreparation({ ...data, outputs: [] })).toThrow();
  expect(() => parsePreparation({ ...data, sources: [{ photoId: "other-workspace" }] })).toThrow();
});
it("rejects impossible dates", () => { expect(isCalendarDate("2026-02-29")).toBe(false); expect(isCalendarDate("2028-02-29")).toBe(true); });
it("does not write an unapproved image, missing date, or a reel cover as video", async () => {
  const input = { userId: ids[0], workspaceId: ids[1], name: "Alba", workflowId: ids[3] };
  await expect(saveWorkflowCalendarDraft({ ...output(), approved: false }, input)).rejects.toThrow();
  await expect(saveWorkflowCalendarDraft({ ...output(), date: "" }, input)).rejects.toThrow();
  await expect(saveWorkflowCalendarDraft({ ...output(), recipe: makePhotoRecipe("cover") }, input)).rejects.toThrow();
  expect(mock.calls).toHaveLength(0);
});
it("retries an existing calendar draft without inserting or modifying it", async () => {
  mock.responses.push({ data: { id: ids[2] }, error: null });
  await saveWorkflowCalendarDraft(output(), { userId: ids[0], workspaceId: ids[1], name: "Alba", workflowId: ids[3] });
  expect(mock.calls).toHaveLength(1); expect(mock.calls[0].insert).toBeUndefined(); expect(mock.sign).not.toHaveBeenCalled();
});
it("stores the exact rendered asset as a manual calendar draft", async () => {
  mock.responses.push({ data: null }, { data: { storage_path: "source.png", status: "ready" } }, { error: null });
  await saveWorkflowCalendarDraft(output(), { userId: ids[0], workspaceId: ids[1], name: "Alba", workflowId: ids[3] });
  const row = mock.calls[2].insert[0][0];
  expect(row).toMatchObject({ id: ids[2], status: "drafting", workspace_id: ids[1], auto_publish: false, scheduled_publish_at: null, media_urls: ["https://example.test/private.png"] });
  expect(row.story_sequence_detail.type).toBe("photo_composition");
});
it("updates a collaborator’s preparation without changing its creator or passing INSERT policy", async () => {
  mock.responses.push({ data: { id: ids[0] } });
  await savePhotoWorkflow({ id: ids[0], user_id: ids[2], workspace_id: ids[1], kind: "preparation", name: "Collection", data: {} });
  expect(mock.calls).toHaveLength(1); expect(mock.calls[0].update[0][0]).toEqual({ name: "Collection", data: {} });
  expect(mock.calls[0].eq).toContainEqual(["workspace_id", ids[1]]);
});
