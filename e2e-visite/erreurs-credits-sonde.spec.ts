/**
 * Erreurs et crédits compréhensibles (chantier E, 15/10/2026) — zéro crédit.
 *
 * Réponses interceptées (aucune génération réelle) :
 * 1. quota « carrousels » sur la création → la limite est nommée, jamais
 *    « tous tes crédits » ;
 * 2. coupure réseau sur la création → message en français, jamais
 *    « Failed to fetch » ni « Edge Function » ;
 * 3. compteur de crédits → « Il te reste ce mois-ci » par type ;
 * 4. Studio en panne (500 avec un code technique) → aucun code affiché.
 */
import { test, expect, type Page } from "@playwright/test";

const TECHNIQUE = /Failed to fetch|Edge Function|non-2xx|TypeError|undefined|internal_boom/i;

async function allerAuxQuestions(page: Page) {
  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const textarea = page.locator("#creation-idea").or(page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager|nouveauté|coulisses/i)).first();
  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await textarea.fill("Pourquoi je montre les coulisses de mon atelier");
  await page.getByRole("button", { name: /^(suivant|continuer)$/i }).click();
  await page.getByRole("button", { name: /instagram/i }).first().click();
  await page.getByRole("button", { name: /Post/ }).filter({ hasText: "Post" }).first().click();
  const suivant = page.getByRole("button", { name: /^(suivant|continuer)$/i });
  await expect(suivant).toBeEnabled({ timeout: 5_000 });
  await suivant.click();
  const genDir = page.getByRole("button", { name: /générer directement/i }).first();
  await expect(genDir).toBeVisible({ timeout: 90_000 });
  return genDir;
}

test.describe("erreurs et crédits compréhensibles", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  test("quota sur la création : la limite atteinte est nommée", async ({ page }) => {
    test.setTimeout(180_000);
    await page.route("**/functions/v1/creative-flow", async (route) => {
      const body = route.request().postDataJSON() as { step?: string } | null;
      if (body?.step !== "generate") return route.fallback();
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "limit_reached",
          message: "Tu as utilisé tes 3 carrousels ce mois. Tes crédits se renouvellent le 1 novembre.",
          remaining: 0,
          category: "category",
          quota: {
            allowed: false, plan: "free", reason: "category", category: "carousel",
            usage: { carousel: { used: 3, limit: 3 }, total: { used: 5, limit: 23 } },
            renews_at: "2026-11-01T00:00:00.000Z", eligible_solutions: ["premium", "renewal"],
          },
        }),
      });
    });
    const genDir = await allerAuxQuestions(page);
    await genDir.click();
    await expect(page.getByText(/Tu as fait tes 3 carrousels du mois/).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    // Un seul message, celui du quota : pas de « service indisponible » en plus.
    await expect(page.getByText(/momentanément indisponible/)).toHaveCount(0);
    await expect(page.getByText(/tous tes crédits/i)).toHaveCount(0);
    await page.screenshot({ path: "e2e-visite/results/chantier-e-quota.png" });
  });

  test("coupure réseau sur la création : message en français", async ({ page }) => {
    test.setTimeout(180_000);
    await page.route("**/functions/v1/creative-flow", async (route) => {
      const body = route.request().postDataJSON() as { step?: string } | null;
      if (body?.step !== "generate") return route.fallback();
      await route.abort("failed");
    });
    const genDir = await allerAuxQuestions(page);
    await genDir.click();
    await expect(page.getByText(/indisponible|connexion|réessaie/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(TECHNIQUE)).toHaveCount(0);
    await page.screenshot({ path: "e2e-visite/results/chantier-e-reseau.png" });
  });

  test("compteur : ce qui reste par type", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByText(/Illimité|crédit/).first()).toBeVisible({ timeout: 15_000 });
    const compteur = page.getByRole("button", { name: /crédits IA restants|Textes sans compter/ }).first();
    // Compte à accès illimité (9999, comme Camille) : rien à détailler.
    test.skip((await compteur.count()) === 0, "accès illimité : pas de plafond par type");
    await compteur.click();
    await expect(page.getByText("Il te reste ce mois-ci")).toBeVisible();
    await expect(page.getByText("Carrousels").first()).toBeVisible();
    await page.screenshot({ path: "e2e-visite/results/chantier-e-compteur.png" });
  });

  test("Studio en panne : aucun code technique affiché", async ({ page }) => {
    await page.route("**/functions/v1/visual-studio", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal_boom" }) }));
    await page.goto("/photos/studio", { waitUntil: "networkidle" });
    await page.waitForTimeout(4_000);
    await expect(page.getByText(TECHNIQUE)).toHaveCount(0);
    await page.screenshot({ path: "e2e-visite/results/chantier-e-studio.png" });
  });
});
