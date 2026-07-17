import { test, expect } from "@playwright/test";

/**
 * Responsive mobile des écrans AUTHENTIFIÉS — là où les vrais bugs mobiles se
 * cachent (jamais testé jusqu'ici). Utilise la session sauvegardée par auth.setup.ts.
 * Ne tourne que sous le projet "Mobile Chrome authed" (donc seulement si
 * E2E_TEST_PASSWORD est posé). Le bug mobile n°1 = débordement horizontal.
 *
 * ⚠️ scrollWidth ≤ clientWidth ne suffit PAS : quand un élément incompressible
 * (ex. barre du haut multi-espaces) dépasse, le navigateur mobile ÉLARGIT le
 * layout viewport (window.innerWidth passe de 393 à ~457) et les deux valeurs
 * grossissent ensemble → le test restait vert alors que tout l'écran était coupé.
 * D'où l'assertion window.innerWidth === largeur du device, la seule qui détecte ça.
 */
const AUTHED_PAGES = ["/dashboard", "/creer", "/calendrier", "/photos"];

test.describe("Responsive mobile — écrans authentifiés", () => {
  for (const path of AUTHED_PAGES) {
    test(`${path} ne déborde pas horizontalement`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      // chunks lazy lourds (CreerUnifie, calendrier) + polices
      await page.waitForTimeout(2000);

      const deviceWidth = page.viewportSize()!.width;
      const { scrollWidth, clientWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
      }));

      expect(
        innerWidth,
        `layout viewport élargi sur ${path} : window.innerWidth=${innerWidth} au lieu de ${deviceWidth} — un élément incompressible déborde (souvent la barre du haut)`,
      ).toBe(deviceWidth);

      expect(
        scrollWidth,
        `débordement horizontal sur ${path} : scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test("/photos : le dialogue détail photo tient dans l'écran", async ({ page }) => {
    await page.goto("/photos", { waitUntil: "load" });
    await page.waitForTimeout(2000);

    // Première photo prête (les cartes en erreur/en cours ne sont pas cliquables).
    // Les cartes arrivent après les URLs signées → attendre vraiment avant de skip.
    const card = page.locator("div.group.aspect-square.cursor-pointer").first();
    try {
      await card.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      test.skip(true, "aucune photo prête sur le compte de test — dialogue non testable");
      return;
    }
    await card.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const deviceWidth = page.viewportSize()!.width;
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(
      innerWidth,
      `layout viewport élargi avec le dialogue ouvert : window.innerWidth=${innerWidth} au lieu de ${deviceWidth}`,
    ).toBe(deviceWidth);

    // Le dialogue lui-même doit être entièrement visible (pas coupé à droite)
    const box = await dialog.boundingBox();
    expect(box, "boundingBox du dialogue introuvable").not.toBeNull();
    expect(
      box!.x + box!.width,
      `dialogue coupé à droite : bord droit à ${box!.x + box!.width}px pour un écran de ${deviceWidth}px`,
    ).toBeLessThanOrEqual(deviceWidth + 1);
    expect(box!.x, "dialogue coupé à gauche").toBeGreaterThanOrEqual(-1);
  });
});
