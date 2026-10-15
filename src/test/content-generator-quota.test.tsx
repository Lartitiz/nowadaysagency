import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fiche 17 de docs/robustesse/gros-fichiers.md, lot T (test 3) : quota et
   messages d'erreur de `generate` et `generateStream`, figés avant le
   découpage du hook. Le vrai `handleQuotaError` est utilisé (toast simulé). */

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), stream: vi.fn(), handle: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.invoke }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: mocks.stream, reset: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/image-vision", () => ({ downscalePhotosForVision: async (photos: any[]) => photos }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/quota-error-handler", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/quota-error-handler")>();
  mocks.handle.mockImplementation(vrai.handleQuotaError);
  return { ...vrai, handleQuotaError: mocks.handle };
});

import { useContentGenerator } from "@/hooks/use-content-generator";

beforeEach(() => { mocks.invoke.mockReset(); mocks.stream.mockReset(); mocks.handle.mockClear(); });

const QUOTA_CARROUSELS = { reason: "category", category: "carousel", plan: "free", usage: { carousel: { used: 3, limit: 3 } }, renews_at: "2027-03-01T00:00:00Z" };

async function generer(reponse: { data: any; error: any }) {
  mocks.invoke.mockResolvedValue(reponse);
  const hook = renderHook(useContentGenerator);
  await act(async () => { await hook.result.current.generate({ format: "carousel", subject: "Sujet" }); });
  return hook.result.current;
}

async function streamer(erreur: any) {
  mocks.stream.mockRejectedValue(erreur);
  const hook = renderHook(useContentGenerator);
  await act(async () => { await hook.result.current.generateStream({ format: "post", subject: "Sujet" }); });
  return hook.result.current;
}

describe("generate — quota", () => {
  it("limit_reached (code) passe avant l'erreur générique : quota posé, error vide", async () => {
    const r = await generer({ data: { error: "limit_reached", message: "Limite atteinte", quota: QUOTA_CARROUSELS }, error: { message: "Edge function returned 429", isRateLimit: true } });
    const recu = mocks.handle.mock.calls[0][0];
    expect(recu._isQuota).toBe(true);
    expect(recu.data.quota).toEqual(QUOTA_CARROUSELS);
    expect(r.error).toBeNull();
    expect(r.quotaExhausted).toMatchSnapshot();
    expect(r.result).toBeNull();
    expect(r.generating).toBe(false);
  });

  it("quota.reason « error » : pas un quota, l'erreur du serveur est affichée", async () => {
    const r = await generer({ data: { error: "limit_reached", message: "Vérification du forfait impossible.", quota: { reason: "error" } }, error: null });
    expect(r.quotaExhausted).toBeNull();
    expect(r.error).toBe("Vérification du forfait impossible.");
  });

  it("message d'erreur en JSON → phrase lisible", async () => {
    const r = await generer({ data: null, error: { message: '{"error":"x","message":"Le texte lisible."}' } });
    expect(r.error).toBe("Le texte lisible.");
  });

  it("JSON d'erreur sans message → phrase par défaut", async () => {
    const r = await generer({ data: null, error: { message: '{"code":42}' } });
    expect(r.error).toMatchSnapshot();
  });
});

describe("markQuotaExhausted / clearQuotaExhausted", () => {
  it("objet quota lisible → phrase qui nomme la limite ; effacé ensuite", async () => {
    const { result } = renderHook(useContentGenerator);
    act(() => result.current.markQuotaExhausted({ data: { error: "limit_reached", quota: QUOTA_CARROUSELS, message: "x" } }));
    expect(result.current.quotaExhausted).toMatchSnapshot();
    act(() => result.current.clearQuotaExhausted());
    expect(result.current.quotaExhausted).toBeNull();
  });

  it("message serveur « disponible à partir… » gardé tel quel", async () => {
    const { result } = renderHook(useContentGenerator);
    const phrase = "Tes carrousels seront de nouveau disponibles à partir du 1er novembre.";
    act(() => result.current.markQuotaExhausted(phrase));
    expect(result.current.quotaExhausted).toMatchSnapshot();
  });

  it("sans rien de lisible → phrase de secours", async () => {
    const { result } = renderHook(useContentGenerator);
    act(() => result.current.markQuotaExhausted());
    expect(result.current.quotaExhausted).toMatchSnapshot();
  });
});

describe("generateStream — quota et erreurs", () => {
  it("erreur quota du flux → quota posé, error vide", async () => {
    const r = await streamer(Object.assign(new Error("Limite"), { _isQuota: true, data: { error: "limit_reached", quota: QUOTA_CARROUSELS } }));
    expect(r.error).toBeNull();
    expect(r.quotaExhausted).toMatchSnapshot();
  });

  it("autre erreur → message lisible", async () => {
    const r = await streamer(new Error("Le serveur a mis trop de temps."));
    expect(r.quotaExhausted).toBeNull();
    expect(r.error).toMatchSnapshot();
  });
});
