/**
 * « Choisir dans mes photos » sur le carrousel (17/10/2026, après #1722/#1730) — zéro crédit, ordi.
 *
 * Le gros bouton de la zone photo et le lien de l'alerte « il faut au moins une photo »
 * ouvrent la bibliothèque ; on choisit 2 photos de Camille, elles arrivent dans la zone
 * (« Tes photos (2) ») et « Suivant » passe à l'étape Précisions sans alerte.
 * Les tests CI ne vérifient que le signal d'ouverture : l'ouverture réelle et l'import
 * des photos signées ne se voyaient qu'en ligne.
 * Aucun appel d'IA ne part : toute fonction de génération est coupée.
 */
import { test, expect, type Page } from "@playwright/test";

async function versCarrousel(page: Page) {
  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const fermer = page.locator('[data-testid="branding-banner-close"]').first();
  if (await fermer.isVisible({ timeout: 1500 }).catch(() => false)) await fermer.click();
  const idee = page.getByTestId("creer-idea-input").or(page.locator("#creation-idea")).first();
  await expect(idee).toBeVisible({ timeout: 15_000 });
  await idee.fill("Les coulisses de mon atelier : comment je prépare une nouvelle collection");
  await page.getByTestId("creer-idea-next").or(page.getByRole("button", { name: /^(suivant|continuer)$/i })).first().click();
  await page.getByTestId("creer-channel-instagram").click();
  await page.getByTestId("creer-format-carousel").click();
  await expect(page.getByTestId("carousel-mode-photo")).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
}

async function choisirDeux(page: Page) {
  const biblio = page.getByRole("dialog").filter({ hasText: "Choisir dans mes photos" });
  await expect(biblio, "la bibliothèque ne s'ouvre pas").toBeVisible({ timeout: 10_000 });
  const tuiles = biblio.locator("button[aria-pressed]");
  await expect(tuiles.nth(1), "moins de 2 photos dans la bibliothèque").toBeVisible({ timeout: 15_000 });
  await tuiles.nth(0).click();
  await tuiles.nth(1).click();
  await biblio.getByRole("button", { name: "Utiliser ces photos" }).click();
  await expect(biblio).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/Tes photos \(2\)/).first(), "les 2 photos n'arrivent pas dans la zone").toBeVisible({ timeout: 30_000 });
}

async function suivantVersPrecisions(page: Page) {
  await page.getByTestId("creer-format-next").click();
  await expect(page.getByTestId("carousel-photo-warning")).toHaveCount(0);
  await expect(page.getByText(/Étape 3 sur 4/i).first(), "« Suivant » n'avance pas à Précisions").toBeVisible({ timeout: 15_000 });
}

// Deux tests séparés : chacun part d'un onglet neuf, sans le brouillon de l'autre.
const PARCOURS = [
  ["gros bouton", async (page: Page) => {
    await page.getByTestId("photo-zone-library-main").click();
    await choisirDeux(page);
  }],
  ["lien de l'alerte", async (page: Page) => {
    await page.getByTestId("creer-format-next").click();
    const alerte = page.getByTestId("carousel-photo-warning");
    await expect(alerte, "pas d'alerte sans photo").toBeVisible({ timeout: 8_000 });
    await alerte.getByRole("button", { name: /Choisir dans mes photos/ }).click();
    await choisirDeux(page);
    await expect(alerte, "l'alerte reste affichée après l'ajout").toHaveCount(0);
  }],
] as const;

for (const [nom, ouvrir] of PARCOURS) {
  test(`carrousel : « Choisir dans mes photos » par le ${nom}`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "ordi seulement");
    test.setTimeout(90_000);
    // Zéro crédit : aucune fonction d'IA ne part.
    await page.route(/\/functions\/v1\//, (r) => {
      const fn = r.request().url().split("/functions/v1/")[1]?.split("?")[0] ?? "";
      return /(-ai|generate|creative-flow|photo-dump-plan)/.test(fn) ? r.abort() : r.continue();
    });
    let ok = false;
    try {
      await versCarrousel(page);
      await ouvrir(page);
      await suivantVersPrecisions(page);
      ok = true;
    } finally {
      console.log(`📚 Mes photos (carrousel) · ${nom} : ${ok ? "✅" : "❌"}`);
      await page.screenshot({ path: `e2e-visite/results/mes-photos-carrousel-${nom.replace(/\W+/g, "-")}.png` }).catch(() => {});
    }
  });
}
