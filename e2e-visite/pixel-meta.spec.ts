/**
 * Pixel Meta sur la page d'arrivée des pubs (https://nowadays-assistant.fr/).
 *
 * Code (src/lib/meta-pixel.ts, appelé par src/main.tsx) : le pixel ne démarre
 * QUE si localStorage.cookie_consent === "accepted". Depuis le 16/11/2026, une
 * visiteuse non connectée le pose via le bandeau cookies (CookieConsentBanner),
 * et une connectée peut changer d'avis dans Paramètres > Cookies et traceurs.
 *
 * Deux contrôles, en contexte NON connecté (comme landing.spec) :
 * 1) « branchement » : avec consentement déjà accepté, fbevents.js se charge,
 *    window.fbq existe et un PageView part vers facebook.com/tr. Prouve que l'ID
 *    du pixel est bien dans le build en ligne et que le code marche.
 * 2) « visiteuse de pub » : sans choix préalable, clic « Accepter » dans le
 *    bandeau → un PageView part.
 *
 * Les requêtes vers facebook.com/tr sont INTERCEPTÉES puis neutralisées :
 * on voit qu'elles partent, mais Meta ne compte pas les passages du robot.
 * Desktop seulement (même code en mobile).
 */

import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

async function captureMetaHits(page: Page) {
  const hits: string[] = [];
  await page.route(/https:\/\/(www\.)?facebook\.com\/tr/, async (route) => {
    hits.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "image/gif", body: "" });
  });
  return hits;
}

test.describe("pixel Meta landing", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  test("branchement : avec consentement accepté, PageView part vers facebook.com/tr", async ({ page }, info) => {
    await page.addInitScript(() => {
      try { localStorage.setItem("cookie_consent", "accepted"); } catch { /* sans stockage */ }
    });
    const hits = await captureMetaHits(page);
    const scriptP = page.waitForResponse((r) => /connect\.facebook\.net\/.*fbevents\.js/.test(r.url()), { timeout: 30_000 });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45_000 });
    const script = await scriptP.catch(() => null);
    expect(script, "fbevents.js ne s'est pas chargé : pixel absent du build en ligne (VITE_META_PIXEL_ID ?) ou code cassé").not.toBeNull();
    expect(script!.status()).toBeLessThan(400);
    expect(await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq === "function"), "window.fbq absent").toBe(true);

    await expect
      .poll(() => hits.some((u) => /[?&]ev=PageView\b/.test(u)), { timeout: 20_000, message: "aucun PageView vers facebook.com/tr" })
      .toBe(true);
    const pv = new URL(hits.find((u) => /[?&]ev=PageView\b/.test(u))!);
    info.annotations.push({ type: "pixel", description: `PageView id=${pv.searchParams.get("id")}` });
    await page.screenshot({ path: info.outputPath("landing-pixel.png") });
  });

  test("visiteuse de pub : « Accepter » dans le bandeau fait partir un PageView", async ({ page }) => {
    const hits = await captureMetaHits(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByTestId("cookie-banner").getByRole("button", { name: "Accepter" }).click({ timeout: 20_000 });
    await expect
      .poll(() => hits.some((u) => /[?&]ev=PageView\b/.test(u)), { timeout: 20_000, message: "aucun PageView après « Accepter »" })
      .toBe(true);
  });
});
