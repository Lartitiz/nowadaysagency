import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const ph = vi.hoisted(() => ({ enablePostHog: vi.fn(), disablePostHog: vi.fn() }));
const se = vi.hoisted(() => ({ enableSentryReplays: vi.fn(), disableSentryReplays: vi.fn() }));
const mp = vi.hoisted(() => ({ enableMetaPixel: vi.fn(), disableMetaPixel: vi.fn() }));
vi.mock("@/lib/posthog", () => ph);
vi.mock("@/lib/sentry", () => se);
vi.mock("@/lib/meta-pixel", () => mp);

import CookieConsentBanner from "@/components/consent/CookieConsentBanner";

const renderBanner = () => render(<MemoryRouter><CookieConsentBanner /></MemoryRouter>);

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

it("sans choix : bandeau visible, Refuser et Accepter côte à côte", () => {
  renderBanner();
  expect(screen.getByTestId("cookie-banner")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Accepter" })).toBeInTheDocument();
});

for (const choice of ["accepted", "refused"]) {
  it(`choix déjà fait (${choice}) : pas de bandeau`, () => {
    localStorage.setItem("cookie_consent", choice);
    renderBanner();
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });
}

it("Accepter : enregistre le choix et allume PostHog, replays et pixel", async () => {
  renderBanner();
  fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
  expect(screen.queryByTestId("cookie-banner")).toBeNull();
  expect(localStorage.getItem("cookie_consent")).toBe("accepted");
  await waitFor(() => {
    expect(ph.enablePostHog).toHaveBeenCalledOnce();
    expect(se.enableSentryReplays).toHaveBeenCalledOnce();
    expect(mp.enableMetaPixel).toHaveBeenCalledOnce();
  });
});

it("Refuser : enregistre le choix et n'allume rien", async () => {
  renderBanner();
  fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
  expect(localStorage.getItem("cookie_consent")).toBe("refused");
  await waitFor(() => expect(ph.disablePostHog).toHaveBeenCalledOnce());
  expect(ph.enablePostHog).not.toHaveBeenCalled();
  expect(mp.enableMetaPixel).not.toHaveBeenCalled();
});
