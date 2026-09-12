import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachingDatabase } from "./coaching-fixtures";
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock }));
import { mapOfferInsights, objectionsText, reconcileObjections, saveOfferInsights } from "@/lib/offer-coaching-persistence";
import { loadCoachingSession, persistCoachingSession } from "@/lib/branding-coaching-session";

const original = { id: "a", workspace_id: "w1", name: "Conseil", description_short: "Ancienne", objections: [{ objection: "Cher", response: "Échelonnement possible", emoji: "€" }], features_to_benefits: [{ feature: "atelier", benefit: "autonomie" }], linked_freebie_id: "free", promise_long: "Variante longue" };
let db: ReturnType<typeof coachingDatabase>;
beforeEach(() => { db = coachingDatabase({ offers: [original, { id: "b", workspace_id: "w1", name: "Formation" }, { id: "c", workspace_id: "w2", name: "Service" }] }); mock.from.mockImplementation(db.from); });
describe("offer persistence", () => {
  it("keeps responses, metadata, duplicate objections and legacy representations", () => {
    expect(reconcileObjections(objectionsText(original.objections), original.objections)).toEqual(original.objections);
    expect(reconcileObjections("Autre\nCher", original.objections)).toEqual([{ objection: "Autre", response: "" }, original.objections[0]]);
    for (const legacy of [["Cher"], "Cher", { old: "untouched" }, null]) expect(reconcileObjections(objectionsText(legacy), legacy)).toEqual(legacy ?? []);
    const duplicates = [{ objection: "Cher", response: "1" }, { objection: "Cher", response: "2" }];
    expect((reconcileObjections("Cher\nCher\nNouveau", duplicates) as any[]).slice(0, 2)).toEqual(duplicates);
  });
  it("maps the five branding fields to the selected offer, preserving advanced fields and other offers", async () => {
    await saveOfferInsights({ offer_name: "Conseil individuel", offer_price: "90 €", offer_target: "Indépendants", offer_promise: "Clarté", offer_includes: "Deux séances" }, { column: "workspace_id", value: "w1" }, "a");
    expect(db.rows.offers[0]).toMatchObject({ ...original, name: "Conseil individuel", price_text: "90 €", target_ideal: "Indépendants", promise: "Clarté", features: ["Deux séances"] });
    expect(db.rows.offers.slice(1).map(r => r.name)).toEqual(["Formation", "Service"]);
    expect(db.calls.every(c => c.table === "offers")).toBe(true);
  });
  it("accepts legacy description, preserves explicit empty edits, rejects unknown/contradictory keys", () => {
    expect(mapOfferInsights({ description: "", benefits: "Autonomie\nConfiance" })).toEqual({ description_short: "", benefits: ["Autonomie", "Confiance"] });
    expect(() => mapOfferInsights({ id: "b" })).toThrow();
    expect(() => mapOfferInsights({ description: "A", description_short: "B" })).toThrow();
  });
  it("fails closed for missing IDs, another space, a read failure or a zero-row write", async () => {
    await expect(saveOfferInsights({ name: "X" }, { column: "workspace_id", value: "w1" })).rejects.toThrow();
    await expect(saveOfferInsights({ name: "X" }, { column: "workspace_id", value: "w2" }, "a")).rejects.toThrow();
    db.fail("offers", "read");
    await expect(saveOfferInsights({ name: "X" }, { column: "workspace_id", value: "w1" }, "a")).rejects.toThrow();
    expect(db.calls.some(c => c.action === "insert" || c.action === "update")).toBe(false);
    db.recover(); db.fail("offers", "update");
    await expect(saveOfferInsights({ name: "X" }, { column: "workspace_id", value: "w1" }, "a")).rejects.toThrow();
  });
});
describe("coaching session identity", () => {
  it("resumes only the selected public and space and leaves legacy history unassigned", async () => {
    db = coachingDatabase({ branding_coaching_sessions: [
      { id: "old", workspace_id: "w1", section: "persona", is_complete: true },
      { id: "p1", workspace_id: "w1", section: "persona", persona_id: "p1", messages: ["Instagram"] },
      { id: "p2", workspace_id: "w1", section: "persona", persona_id: "p2", messages: ["LinkedIn"] },
      { id: "other", workspace_id: "w2", section: "persona", persona_id: "p1" },
    ] }); mock.from.mockImplementation(db.from);
    expect((await loadCoachingSession({ column: "workspace_id", value: "w1", section: "persona", personaId: "p2" })).id).toBe("p2");
    expect(await loadCoachingSession({ column: "workspace_id", value: "w1", section: "persona", personaId: "new" })).toBeNull();
    await persistCoachingSession("new-session", false, { column: "workspace_id", value: "w1", section: "persona", personaId: "new" }, { section: "persona", workspace_id: "w1", user_id: "owner", messages: ["Pinterest"] });
    expect(db.rows.branding_coaching_sessions[0]).toEqual({ id: "old", workspace_id: "w1", section: "persona", is_complete: true });
    expect(db.rows.branding_coaching_sessions.at(-1)).toMatchObject({ persona_id: "new", offer_id: null });
  });
  it("propagates read/write failures and does not update another offer session", async () => {
    db.fail("branding_coaching_sessions", "read");
    await expect(loadCoachingSession({ column: "workspace_id", value: "w1", section: "offers", offerId: "a" })).rejects.toThrow();
    db.recover();
    await expect(persistCoachingSession("unrelated", true, { column: "workspace_id", value: "w1", section: "offers", offerId: "a" }, { messages: [] })).rejects.toThrow();
  });
});
