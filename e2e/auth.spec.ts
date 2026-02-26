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

  test("navigation vers /auth fonctionne", async ({ page }) => {
    await page.goto("/auth");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("le formulaire de connexion s'affiche", async ({ page }) => {
    await page.goto("/auth");
    const emailInput = page.getByPlaceholder(/email/i);
    const passwordInput = page.getByPlaceholder(/mot de passe|password/i);
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });
});
