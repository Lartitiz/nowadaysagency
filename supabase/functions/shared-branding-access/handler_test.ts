import { sharedBrandingAccess } from "./handler.ts";
const assert = (ok: unknown, message = "assertion failed") => { if (!ok) throw Error(message); };
const now = new Date("2026-09-14T12:00:00Z");
function fixture() {
  const db: Record<string, any[]> = {
    shared_branding_links: [{ id: "l", token: "t", user_id: "owner", workspace_id: "a", is_active: true, expires_at: "2026-09-15T00:00:00Z", created_at: "2026-08-16T00:00:00Z", views_count: 8 }],
    workspace_members: [{ workspace_id: "a", user_id: "owner", role: "owner" }],
    profiles: [{ user_id: "owner", prenom: "Owner" }, { user_id: "manager", prenom: "Wrong" }],
    persona: [{ id: "p1", workspace_id: "a", user_id: "owner", label: "A" }, { id: "p2", workspace_id: "a", user_id: "owner", label: "B" }, { id: "p3", workspace_id: "b", user_id: "owner", label: "Private" }],
    storytelling: [{ id: "s1", workspace_id: "a", is_primary: true, step_7_polished: "one" }, { id: "s2", workspace_id: "a", is_primary: true, step_7_polished: "two" }, { id: "s3", workspace_id: "a", is_primary: false, step_7_polished: "private" }],
    offers: [{ id: "o1", workspace_id: "a", name: "Offer", promise: "kept" }, { id: "o2", workspace_id: "b", name: "Hidden" }],
  };
  const failures = new Set<string>(); let revokeDuringRead = false;
  const sb = { from(table: string) {
    const filters: Array<(r: any) => boolean> = []; let single = false; let update: any;
    const q: any = { select: () => q, order: () => q, eq: (k: string, v: any) => { filters.push(r => r[k] === v); return q; }, is: (k: string, v: any) => { filters.push(r => r[k] === v); return q; }, maybeSingle: () => { single = true; return q; }, update: (v: any) => { update = v; return q; }, then(resolve: any) {
      if (failures.has(table)) return resolve({ data: null, error: { message: "read failed" } });
      if (revokeDuringRead && table === "offers") db.shared_branding_links[0].is_active = false;
      const rows = (db[table] || []).filter(r => filters.every(f => f(r)));
      if (update) rows.forEach(r => Object.assign(r, update));
      resolve(single ? rows.length > 1 ? { data: null, error: { code: "PGRST116" } } : { data: rows[0] ? { ...rows[0] } : null, error: null } : { data: rows.map(r => ({ ...r })), error: null });
    }}; return q;
  }};
  return { db, failures, run: () => sharedBrandingAccess(new Request("https://fixture.test?token=t"), sb, now), revoke: () => { revokeDuringRead = true; }, sb };
}
Deno.test("N4 multiple publics and primary stories survive with exact offers and no private workspace", async () => {
  const f = fixture(); const before = JSON.stringify({ persona: f.db.persona, stories: f.db.storytelling, offers: f.db.offers });
  const response = await f.run(); const data = await response.json();
  assert(response.status === 200); assert(data.personas.length === 2); assert(data.stories.length === 2); assert(data.offers.length === 1);
  assert(data.persona === null && data.storytelling === null, "never choose arbitrarily for compatibility");
  assert(data.read_at === now.toISOString() && data.link.created_at.startsWith("2026-08-16"));
  assert(data.link.expires_at === "2026-09-15T00:00:00Z"); assert(response.headers.get("cache-control") === "no-store");
  assert(before === JSON.stringify({ persona: f.db.persona, stories: f.db.storytelling, offers: f.db.offers }));
});
for (const table of ["shared_branding_links", "workspace_members", "profiles", "persona", "storytelling", "brand_profile", "brand_proposition", "brand_strategy", "offers"]) {
  Deno.test(`N4 ${table} read failure gives 503 rather than absence`, async () => { const f = fixture(); f.failures.add(table); const response = await f.run(); assert(response.status === 503); assert((await response.json()).personas === undefined); });
}
Deno.test("N4 absence is successful empty data", async () => { const f = fixture(); f.db.persona = []; f.db.storytelling = []; f.db.offers = []; const r = await f.run(); const d = await r.json(); assert(r.status === 200 && d.personas.length === 0 && d.stories.length === 0 && d.offers.length === 0); });
for (const expires_at of ["2026-09-14T12:00:00Z", "2020-01-01", "invalid"]) Deno.test(`N4 expiration ${expires_at}`, async () => { const f = fixture(); f.db.shared_branding_links[0].expires_at = expires_at; assert((await f.run()).status === 410); });
Deno.test("N4 revoked and missing links", async () => { const f = fixture(); f.db.shared_branding_links[0].is_active = false; assert((await f.run()).status === 404); f.db.shared_branding_links = []; assert((await f.run()).status === 404); });
Deno.test("N4 revocation during data reads", async () => { const f = fixture(); f.revoke(); assert((await f.run()).status === 404); });
Deno.test("N4 wrong link owner fails without profile disclosure", async () => { const f = fixture(); f.db.shared_branding_links[0].user_id = "manager"; assert((await f.run()).status === 409); });
Deno.test("N4 owner removed from workspace", async () => { const f = fixture(); f.db.workspace_members = []; assert((await f.run()).status === 409); });
Deno.test("N4 old personal link only reads historical NULL scope", async () => {
  const f = fixture(); f.db.shared_branding_links[0].workspace_id = null; f.db.shared_branding_links[0].expires_at = null;
  f.db.persona.push({ id: "legacy", user_id: "owner", workspace_id: null, label: "Personal" });
  const r = await f.run(); const d = await r.json(); assert(r.status === 200 && d.personas.length === 1 && d.personas[0].id === "legacy"); assert(d.persona.id === "legacy");
});
Deno.test("N4 ambiguous singleton data is a read failure", async () => { const f = fixture(); f.db.brand_profile = [{workspace_id:"a"},{workspace_id:"a"}]; assert((await f.run()).status === 503); });
Deno.test("N4 live data changes on each visit", async () => { const f = fixture(); await f.run(); f.db.offers[0].promise = "Updated"; const d = await (await f.run()).json(); assert(d.offers[0].promise === "Updated"); });
