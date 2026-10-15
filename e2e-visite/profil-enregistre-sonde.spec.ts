/**
 * Mon profil : « Enregistrer » écrit vraiment (15/10/2026, #1602) — zéro crédit.
 *
 * Avant le 15/10, l'enregistrement visait profiles par workspace_id (vide) :
 * aucune ligne touchée, et pourtant « Modifications enregistrées ». Aucune
 * routine ne relisait la base après un enregistrement.
 *
 * La sonde pose un lien dans « Mes liens », enregistre, recharge la page et
 * relit le champ, puis remet la valeur de départ (net nul sur le compte test).
 */
import { test, expect, type Page } from "@playwright/test";

const ouvrirLiens = async (page: Page) => {
  await page.goto("/profil?onglet=liens", { waitUntil: "networkidle" });
  const champ = page.locator("#profile-website");
  await expect(champ).toBeVisible({ timeout: 15_000 });
  return champ;
};

const enregistrer = async (page: Page) => {
  await page.getByRole("button", { name: "Enregistrer mes infos" }).click();
  await expect(page.getByText("Modifications enregistrées").first()).toBeVisible({ timeout: 10_000 });
};

test.describe("Mon profil : enregistrer puis relire", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  test("un lien enregistré est relu après rechargement", async ({ page }) => {
    test.setTimeout(90_000);
    const champ = await ouvrirLiens(page);
    const depart = await champ.inputValue();
    const sonde = `https://sonde-visite.test/${Date.now()}`;

    await champ.fill(sonde);
    await enregistrer(page);
    try {
      const relu = await ouvrirLiens(page);
      await expect(relu, "« Enregistré » affiché mais rien en base : le profil n'est pas écrit").toHaveValue(sonde);
      await page.screenshot({ path: "e2e-visite/results/profil-enregistre.png" });
    } finally {
      // Remise à l'état de départ, même si la relecture a échoué.
      const remise = await ouvrirLiens(page);
      if ((await remise.inputValue()) !== depart) {
        await remise.fill(depart);
        await enregistrer(page);
      }
    }
    await expect(await ouvrirLiens(page)).toHaveValue(depart);
  });
});
