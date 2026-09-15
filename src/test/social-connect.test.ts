import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ invoke: vi.fn(), memo: vi.fn(), assign: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock("@/lib/retour-apres-detour", () => ({ memoriseRetour: m.memo }));
import { startSocialConnect } from "@/lib/social-connect";
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("window", { location: { pathname: "/creer", search: "?qa=1", origin: "https://qa.invalid", assign: m.assign } }); });
afterEach(() => vi.unstubAllGlobals());
it("late OAuth start cannot navigate another workspace or overwrite its return", async () => {
  let finish!: (v: unknown) => void; let current = true;
  m.invoke.mockReturnValue(new Promise(r => { finish = r; }));
  const pending = startSocialConnect("instagram", "A", { isCurrent: () => current });
  current = false; finish({ data: { url: "https://provider.invalid" }, error: null });
  await pending;
  expect(m.assign).not.toHaveBeenCalled(); expect(m.memo).not.toHaveBeenCalled();
});
it("confirmed current start preserves original destination then navigates once", async () => {
  m.invoke.mockResolvedValue({ data: { url: "https://provider.invalid" }, error: null });
  await startSocialConnect("instagram", "A", { isCurrent: () => true });
  expect(m.memo).toHaveBeenCalledWith("/creer?qa=1", undefined);
  expect(m.assign).toHaveBeenCalledTimes(1);
  expect(m.invoke).toHaveBeenCalledWith("social-oauth-start", { body: { platform: "instagram", workspace_id: "A", return_to: "https://qa.invalid" } });
});
it("failed start preserves previous resume state and never navigates", async () => {
  m.invoke.mockResolvedValue({ data: null, error: { message: "offline" } });
  await expect(startSocialConnect("instagram", "A")).resolves.toEqual({ error: "offline" });
  expect(m.memo).not.toHaveBeenCalled(); expect(m.assign).not.toHaveBeenCalled();
});
