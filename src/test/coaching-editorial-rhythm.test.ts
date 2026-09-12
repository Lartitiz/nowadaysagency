import { expect, it, vi } from "vitest";
import { coachingDatabase } from "./coaching-fixtures";
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock }));
import { saveContentStrategyInsights } from "@/components/branding/brandingCoachingInsights";
it("saves an ambiguous textual recommendation without changing actual post/story frequencies", async () => {
  const db = coachingDatabase({ instagram_editorial_line: [{ id: "e1", workspace_id: "w1", posts_frequency: "2", stories_frequency: "quotidien" }, { id: "e2", workspace_id: "w2", posts_frequency: "1" }] });
  mock.from.mockImplementation(db.from);
  await saveContentStrategyInsights({ content_frequency: "Une publication quand tu as quelque chose à partager" }, { column: "workspace_id", value: "w1", workspaceId: "w1", profileUserId: "owner" }, { invalidateQueries: vi.fn() } as any);
  expect(db.rows.instagram_editorial_line[0]).toMatchObject({ posts_frequency: "2", stories_frequency: "quotidien", recommended_rhythm: "Une publication quand tu as quelque chose à partager" });
  expect(db.rows.instagram_editorial_line[1]).toEqual({ id: "e2", workspace_id: "w2", posts_frequency: "1" });
});
it("a failed editorial lookup does not insert a second row", async () => {
  const db = coachingDatabase(); db.fail("instagram_editorial_line", "read"); mock.from.mockImplementation(db.from);
  await expect(saveContentStrategyInsights({ content_frequency: "2 à 3 posts" }, { column: "workspace_id", value: "w1", workspaceId: "w1", profileUserId: "owner" }, { invalidateQueries: vi.fn() } as any)).rejects.toThrow();
  expect(db.calls.some(c => c.action === "insert")).toBe(false);
});
