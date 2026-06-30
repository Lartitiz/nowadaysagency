import { test as setup } from "@playwright/test";

/**
 * Connexion au compte de test, puis sauvegarde de la session (storageState).
 * Le mot de passe vient UNIQUEMENT d'une variable d'env (jamais commité) :
 *   E2E_TEST_PASSWORD='...' npx playwright test --project="Mobile Chrome authed"
 * (E2E_TEST_EMAIL optionnel ; défaut = compte test « Camille ».)
 */
const AUTH_STORAGE = "e2e/.auth/camille.json";

setup("se connecter (compte test)", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL || "laetitiatest@nowadaysagency.com";
  const password = process.env.E2E_TEST_PASSWORD;
  if (!password) {
    throw new Error(
      "E2E_TEST_PASSWORD non défini. Lance avec : E2E_TEST_PASSWORD='...' npx playwright test --project=\"Mobile Chrome authed\"",
    );
  }

  await page.goto("/login");
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/mot de passe|password/i).fill(password);
  await page.getByPlaceholder(/mot de passe|password/i).press("Enter");

  // Connexion réussie = redirection vers le dashboard.
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await page.context().storageState({ path: AUTH_STORAGE });
});
