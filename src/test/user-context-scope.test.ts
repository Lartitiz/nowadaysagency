import { describe, expect, it } from "vitest";
import { getUserContext, formatContextForAI } from "../../supabase/functions/_shared/user-context";

// Execute the production assembler; only its database transport is substituted.
function database(rows: Record<string, any[]>, fail?: string) {
  const queried: string[] = [];
  const sb = { queried, from(table: string) {
    queried.push(table);
    let selected = rows[table] ?? [];
    let single = false;
    const q: any = {
      select: () => q,
      eq: (col: string, val: unknown) => { selected = selected.filter(r => r[col] === val); return q; },
      is: (col: string, val: unknown) => { selected = selected.filter(r => r[col] === val); return q; },
      contains: (col: string, vals: unknown[]) => { selected = selected.filter(r => vals.every(v => r[col]?.includes(v))); return q; },
      order: () => q,
      limit: (n: number) => { selected = selected.slice(0, n); return q; },
      maybeSingle: () => { single = true; return q; },
      then: (resolve: any, reject: any) => Promise.resolve(table === fail
        ? { data: null, error: { message: "private diagnostic", code: "503" } }
        : single && selected.length > 1 ? { data: null, error: { code: "PGRST116" } }
        : { data: single ? selected[0] ?? null : selected, error: null }).then(resolve, reject),
    };
    return q;
  }};
  return sb;
}
const members = [
  { workspace_id: "A", user_id: "owner", role: "owner" },
  { workspace_id: "B", user_id: "owner", role: "owner" },
  { workspace_id: "A", user_id: "manager", role: "manager" },
];

describe("R4 context scope and real reference assembly", () => {
  it("does not inject a voice belonging to B into A", async () => {
    const sb = database({ workspace_members: members, voice_profile: [{user_id: "owner", workspace_id: "B", voice_summary: "R4 VOICE B"}] });
    const ctx = await getUserContext(sb, "manager", "A");
    expect(ctx.voice).toBeNull();
    expect(formatContextForAI(ctx)).not.toContain("R4 VOICE B");
  });
  it("personal context excludes scoped offers and preserves legacy NULL rows", async () => {
    const sb = database({ offers: [
      {user_id: "owner", workspace_id: "A", name: "R4 OFFER A"},
      {user_id: "owner", workspace_id: null, name: "R4 LEGACY"},
    ] });
    expect((await getUserContext(sb, "owner")).offers.map((o: any) => o.name)).toEqual(["R4 LEGACY"]);
  });
  it("rejects inaccessible workspace without reading personal branding instead", async () => {
    const sb = database({workspace_members: members});
    await expect(getUserContext(sb, "outsider", "A")).rejects.toThrow();
    expect(sb.queried).toEqual(["workspace_members"]);
  });
  it("rejects failed owner lookup rather than reading the manager profile", async () => {
    const sb = database({workspace_members: [{workspace_id: "A", user_id: "manager", role: "manager"}]});
    await expect(getUserContext(sb, "manager", "A")).rejects.toThrow();
    expect(sb.queried).not.toContain("profiles");
  });
  it("rejects failed branding read rather than presenting missing identity", async () => {
    await expect(getUserContext(database({workspace_members: members}, "brand_profile"), "manager", "A")).rejects.toThrow();
  });
  it.each(["owner", "manager", "editor", "viewer"])("reads the requested scope for %s without borrowing their personal profile", async (role) => {
    const ctx = await getUserContext(database({
      workspace_members: role === "owner" ? members : [...members, {workspace_id: "A", user_id: "reader", role}],
      profiles: [{user_id: "owner", prenom: "R4 owner"}, {user_id: "reader", prenom: "R4 reader"}],
      voice_profile: [{user_id: "owner", workspace_id: "A", voice_summary: "R4 VOICE A"}],
    }), role === "owner" ? "owner" : "reader", "A");
    expect(ctx.profile.prenom).toBe("R4 owner");
    expect(ctx.voice.voice_summary).toBe("R4 VOICE A");
  });
  it.each(["storytelling", "persona", "brand_profile", "brand_proposition", "brand_strategy", "instagram_editorial_line", "profiles", "offers", "instagram_audit", "voice_profile", "brand_charter", "branding_mirror_results"])("rejects a failed %s read with no private diagnostic in its message", async (table) => {
    const result = getUserContext(database({workspace_members: members}, table), "manager", "A", "instagram");
    await expect(result).rejects.toThrow("Impossible de charger");
    await expect(result).rejects.not.toThrow("private diagnostic");
  });
  it("preserves legacy voice only in the personal scope", async () => {
    const sb = database({workspace_members: members, voice_profile: [{user_id: "owner", workspace_id: null, voice_summary: "R4 LEGACY VOICE"}]});
    expect((await getUserContext(sb, "owner")).voice.voice_summary).toBe("R4 LEGACY VOICE");
    expect((await getUserContext(sb, "owner", "A")).voice).toBeNull();
  });
  it("uses channel-specific persona while preserving primary fallback", async () => {
    const sb = database({workspace_members: members, persona: [
      {workspace_id: "A", is_primary: true, channels: [], label: "R4 PRIMARY"},
      {workspace_id: "A", is_primary: false, channels: ["instagram"], label: "R4 INSTAGRAM"},
      {workspace_id: "B", is_primary: false, channels: ["linkedin"], label: "R4 B"},
    ]});
    expect((await getUserContext(sb, "manager", "A", "instagram")).persona.label).toBe("R4 INSTAGRAM");
    expect((await getUserContext(sb, "manager", "A", "linkedin")).persona.label).toBe("R4 PRIMARY");
  });
  it("keeps an actually empty new identity valid", async () => {
    const ctx = await getUserContext(database({workspace_members: members}), "owner", "A");
    expect(ctx.offers).toEqual([]);
    expect(ctx.voice).toBeNull();
  });
  it("transmits final proposition, charter and multiple offers without replacing them by coaching", async () => {
    const ctx = await getUserContext(database({
      workspace_members: members,
      brand_proposition: [{workspace_id: "A", version_final: "R4 FINAL", version_complete: "R4 EXERCISE"}],
      brand_charter: [{workspace_id: "A", color_primary: "#123456", font_title: "R4 FONT"}],
      offers: [{workspace_id: "A", name: "R4 OFFER ONE"}, {workspace_id: "A", name: "R4 OFFER TWO"}],
    }), "manager", "A");
    const prompt = formatContextForAI(ctx);
    expect(prompt).toContain("R4 FINAL");
    expect(prompt).not.toContain("R4 EXERCISE");
    expect(prompt).toContain("R4 OFFER ONE");
    expect(prompt).toContain("R4 OFFER TWO");
    expect(prompt).toContain("#123456");
  });
});
