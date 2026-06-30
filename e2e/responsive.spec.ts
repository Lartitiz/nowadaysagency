import { test, expect } from "@playwright/test";

/**
 * Invariants responsive — surtout pertinents sous le projet "Mobile Safari"
 * (iPhone 13, 390px), mais valides aussi en desktop. Le bug mobile n°1 = un
 * contenu plus large que le viewport (scroll horizontal). Ces tests tournent
 * sur les pages PUBLIQUES (pas d'auth requise).
 */

const PUBLIC_PAGES = ["/", "/login"];

test.describe("Responsive — pas de débordement horizontal", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} ne déborde pas horizontalement`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      // petite stabilisation (chunks lazy / polices)
      await page.waitForTimeout(800);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      // tolérance 1px (arrondis sous-pixel)
      expect(
        scrollWidth,
        `débordement horizontal sur ${path} : scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});

test.describe("Responsive — formulaire de connexion utilisable", () => {
  test("/login : les champs tiennent dans le viewport", async ({ page }) => {
    await page.goto("/login", { waitUntil: "load" });
    const email = page.getByPlaceholder(/email/i);
    const password = page.getByPlaceholder(/mot de passe|password/i);
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    const vw = page.viewportSize()!.width;
    for (const field of [email, password]) {
      const box = await field.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1);
    }
  });
});
