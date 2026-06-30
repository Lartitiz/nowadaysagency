import { test, expect } from "@playwright/test";

/**
 * Responsive mobile des écrans AUTHENTIFIÉS — là où les vrais bugs mobiles se
 * cachent (jamais testé jusqu'ici). Utilise la session sauvegardée par auth.setup.ts.
 * Ne tourne que sous le projet "Mobile Chrome authed" (donc seulement si
 * E2E_TEST_PASSWORD est posé). Le bug mobile n°1 = débordement horizontal.
 */
const AUTHED_PAGES = ["/dashboard", "/creer", "/calendrier"];

test.describe("Responsive mobile — écrans authentifiés", () => {
  for (const path of AUTHED_PAGES) {
    test(`${path} ne déborde pas horizontalement`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      // chunks lazy lourds (CreerUnifie, calendrier) + polices
      await page.waitForTimeout(2000);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        scrollWidth,
        `débordement horizontal sur ${path} : scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});
