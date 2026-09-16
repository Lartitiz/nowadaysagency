import { beforeEach, describe, expect, it, vi } from "vitest";
import { identityPresentation, loadIdentityOverview, referencePublic } from "@/lib/identity-overview";
const m = vi.hoisted(() => ({ db: {} as Record<string, any[]>, fail: "" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filters: [string, unknown][] = [];
  const q: any = { select: () => q, eq: (key: string, val: unknown) => { filters.push([key, val]); return q; }, is: (key: string, val: unknown) => { filters.push([key, val]); return q; },
    then: (resolve: any) => Promise.resolve({ data: (m.db[table] || []).filter(r => filters.every(([k, v]) => r[k] === v)), error: m.fail === table ? new Error("fixture failure") : null }).then(resolve) };
  return q;
} } }));
beforeEach(() => { m.db = {}; m.fail = ""; });
describe("identity overview", () => {
  it("keeps full lists and gives precedence to the reference over variants", async () => {
    m.db.persona = [{ id: "p1", workspace_id: "A" }, { id: "p2", workspace_id: "A" }];
    m.db.storytelling = [{ id: "s1", workspace_id: "A" }, { id: "s2", workspace_id: "A" }];
    m.db.brand_proposition = [{ id: "prop", workspace_id: "A", version_final: "Reference", version_pitch_naturel: "Variant" }];
    const data = await loadIdentityOverview("workspace_id", "A");
    expect(data.storytellingList).toHaveLength(2); expect(data.publics).toHaveLength(2);
    expect(identityPresentation(data)).toMatchObject({ activity: "Reference", needsPublicChoice: true });
  });
  it("shows a historical formulation when no new reference was set", async () => {
    m.db.brand_proposition = [{ workspace_id: "A", version_complete: "Legacy presentation" }];
    expect(identityPresentation(await loadIdentityOverview("workspace_id", "A")).activity).toBe("Legacy presentation");
  });
  it("does not pick an arbitrary public when multiple primary flags conflict", () => {
    expect(referencePublic([{ id: "a" }, { id: "b" }])).toBeNull();
    expect(referencePublic([{ id: "a", is_primary: true }, { id: "b", is_primary: true }])).toBeNull();
    expect(referencePublic([{ id: "a" }, { id: "b", is_primary: true }])?.id).toBe("b");
  });
  it("does not mistake a failed or ambiguous reference read for empty data", async () => {
    m.fail = "brand_charter"; await expect(loadIdentityOverview("workspace_id", "A")).rejects.toThrow("fixture failure");
    m.fail = ""; m.db.brand_profile = [{ workspace_id: "A" }, { workspace_id: "A" }];
    await expect(loadIdentityOverview("workspace_id", "A")).rejects.toThrow("Plusieurs fiches");
  });
  it("isolates the legacy personal space and never falls back to another space", async () => {
    m.db.brand_profile = [{ user_id: "u", workspace_id: "A", voice_description: "A" }, { user_id: "u", workspace_id: null, voice_description: "Personal" }];
    expect((await loadIdentityOverview("user_id", "u")).brandProfile?.voice_description).toBe("Personal");
    expect((await loadIdentityOverview("workspace_id", "B")).brandProfile).toBeNull();
  });
});
