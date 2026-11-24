import { beforeEach, describe, expect, it, vi } from "vitest";

/* Le compteur de crédits de l'en-tête suit un appel payant réussi, et
   seulement celui-là (24/11/2026 : « Réécrire ma carte » débitait 1 crédit,
   l'en-tête restait à 23 jusqu'à la première génération). */

const invoke = vi.hoisted(() => vi.fn());
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
vi.mock("@/hooks/use-user-plan", () => ({ invalidateUserPlanCache: invalidate }));

import { invokeAndRefreshCredits } from "@/lib/invoke-and-refresh-credits";

beforeEach(() => {
  invoke.mockReset();
  invalidate.mockReset();
});

describe("invokeAndRefreshCredits", () => {
  it("après un succès : rend la réponse telle quelle et recharge le compteur partout", async () => {
    const answer = { data: { section_data: { full_story: "x" } }, error: null };
    invoke.mockResolvedValue(answer);
    const result = await invokeAndRefreshCredits("branding-quick-refine", { body: { a: 1 } }, 90000);
    expect(result).toBe(answer);
    expect(invoke).toHaveBeenCalledWith("branding-quick-refine", { body: { a: 1 } }, 90000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(true);
  });

  it("après un échec : pas de rechargement (rien n'a été débité)", async () => {
    invoke.mockResolvedValue({ data: null, error: { code: "NETWORK", message: "indisponible" } });
    const result = await invokeAndRefreshCredits("branding-quick-refine", { body: {} });
    expect(result.error?.code).toBe("NETWORK");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("un compteur qui plante ne fait pas échouer l'action réussie", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    invalidate.mockImplementation(() => { throw new Error("boom"); });
    await expect(invokeAndRefreshCredits("persona-ai", {})).resolves.toEqual({ data: { ok: true }, error: null });
  });
});
