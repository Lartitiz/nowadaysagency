import { test, expect } from "@playwright/test";

test.describe("Pages principales", () => {
  test("la page d'accueil se charge", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
  });

  test("le bouton de connexion est visible", async ({ page }) => {
    await page.goto("/");
    const loginLink = page.getByRole("link", { name: /connexion|se connecter|login/i });
    await expect(loginLink).toBeVisible();
  });

  test("navigation vers /login fonctionne", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
  });

  test("le formulaire de connexion s'affiche", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.getByPlaceholder(/email/i);
    const passwordInput = page.getByPlaceholder(/mot de passe|password/i);
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });
});
