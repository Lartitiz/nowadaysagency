import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc } }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv("PROD", true);
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test" } } });
  mocks.rpc.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("métadonnées fermées seulement, pas d'URL ni de contenu libre ; dédoublonnage", async () => {
  window.history.replaceState({}, "", "/creer?texte=contenu-prive");
  const { reportClientError } = await import("@/lib/client-error-monitor");
  await reportClientError("runtime", "https://app.example/assets/index-abc.js?secret=confidentiel");
  await reportClientError("runtime", "https://app.example/assets/index-abc.js");
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith("report_client_error", { p_kind: "runtime", p_route: "creer", p_asset: "index-abc.js" });
});
it("visiteur non connecté : aucun envoi", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  const { reportClientError } = await import("@/lib/client-error-monitor");
  await reportClientError("render");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
