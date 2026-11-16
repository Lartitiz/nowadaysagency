/**
 * PostHog + bandeau cookies sur le site public (https://nowadays-assistant.fr/).
 *
 * Pourquoi cette sonde : jusqu'au 16/11/2026, PostHog n'a JAMAIS rien reçu du
 * site publié (clé VITE_POSTHOG_KEY absente du build → démarrage supprimé à la
 * compilation), et depuis le 11/09 il attendait un consentement qu'aucun
 * bandeau ne permettait de donner. Personne ne l'a vu pendant 2 mois.
 *
 * Contrôles, en contexte NON connecté :
 * 1) sans choix : le bandeau s'affiche et RIEN ne part vers PostHog ;
 * 2) clic « Accepter » : un évènement part vers eu.i.posthog.com
 *    (prouve que la clé est dans le build en ligne et que le code marche) ;
 * 3) clic « Refuser » : le bandeau disparaît, rien ne part, et il ne revient
 *    pas au rechargement.
 *
 * Les requêtes vers PostHog sont INTERCEPTÉES et neutralisées : on voit
 * qu'elles partent, mais les passages du robot ne sont pas comptés.
 * Desktop seulement (même code en mobile).
 */
import { test, expect, type Page } from "@playwright/test";

// PostHog jette les évènements des robots (agent « HeadlessChrome »,
// navigator.webdriver, userAgentData) : on se présente en Chrome ordinaire,
// sinon rien ne part même quand tout marche.
test.use({
  storageState: { cookies: [], origins: [] },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
});

async function capturePosthogHits(page: Page) {
  const hits: string[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
    Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
  });
  await page.route(/https:\/\/eu(-assets)?\.i\.posthog\.com\//, async (route) => {
    const url = route.request().url();
    if (/eu\.i\.posthog\.com\/(e|i\/v0\/e|batch|capture)\b/.test(url)) hits.push(url);
    if (/eu-assets\./.test(url)) return route.abort();
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return hits;
}

test.describe("PostHog + bandeau cookies", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  test("sans choix : bandeau visible, rien n'est envoyé ; « Accepter » allume PostHog", async ({ page }, info) => {
    const hits = await capturePosthogHits(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45_000 });

    const banner = page.getByTestId("cookie-banner");
    await expect(banner, "bandeau cookies absent pour une visiteuse sans choix").toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    expect(hits, "PostHog envoie AVANT le consentement").toHaveLength(0);
    await page.screenshot({ path: info.outputPath("bandeau.png") });

    await banner.getByRole("button", { name: "Accepter" }).click();
    await expect(banner).toBeHidden();
    await expect
      .poll(() => hits.length, {
        timeout: 25_000,
        message: "aucun évènement vers eu.i.posthog.com après « Accepter » : clé VITE_POSTHOG_KEY absente du build en ligne ?",
      })
      .toBeGreaterThan(0);
  });

  test("« Refuser » : rien n'est envoyé et le bandeau ne revient pas", async ({ page }) => {
    const hits = await capturePosthogHits(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45_000 });
    const banner = page.getByTestId("cookie-banner");
    await banner.getByRole("button", { name: "Refuser" }).click();
    await expect(banner).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0);
    expect(hits, "PostHog envoie malgré le refus").toHaveLength(0);
  });
});
