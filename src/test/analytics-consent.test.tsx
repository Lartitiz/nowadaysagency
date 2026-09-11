import { beforeEach, afterEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), opt_in_capturing: vi.fn(), opt_out_capturing: vi.fn() }));
const sentry = vi.hoisted(() => ({ init: vi.fn(), browserTracingIntegration: vi.fn(), replayIntegration: vi.fn(), addIntegration: vi.fn(), getClient: vi.fn(() => ({})), getReplay: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));
vi.mock("@sentry/react", () => sentry);

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  vi.stubEnv("VITE_POSTHOG_KEY", "test-key");
  vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.com/1");
  vi.stubEnv("PROD", true);
});
afterEach(() => vi.unstubAllEnvs());
for (const preference of [null, "refused"]) {
  it(`préférence ${preference} : aucun analytics ni replay après chargement`, async () => {
    if (preference) localStorage.setItem("cookie_consent", preference);
    const p = await import("@/lib/posthog"); const s = await import("@/lib/sentry");
    p.initPostHog(); s.initSentry();
    expect(sdk.init).not.toHaveBeenCalled(); expect(sentry.replayIntegration).not.toHaveBeenCalled();
  });
}
it("acceptation après chargement : initialise PostHog et Replay une seule fois", async () => {
  const p = await import("@/lib/posthog"); const s = await import("@/lib/sentry");
  p.initPostHog(); s.initSentry();
  localStorage.setItem("cookie_consent", "accepted");
  p.enablePostHog(); p.enablePostHog(); s.enableSentryReplays();
  expect(sdk.init).toHaveBeenCalledTimes(1); expect(sentry.addIntegration).toHaveBeenCalledTimes(1);
  localStorage.setItem("cookie_consent", "refused"); p.disablePostHog();
  expect(sdk.opt_out_capturing).toHaveBeenCalledOnce();
});
