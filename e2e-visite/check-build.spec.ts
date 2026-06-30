import { test, expect } from "@playwright/test";

// Smoke test pré-Publish : vérifie que le build de prod charge sans crash JS.
// Motivé par l'incident manualChunks (#258) : React.forwardRef undefined → app blanche.

test("landing charge sans erreur JS", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/", { waitUntil: "networkidle" });

  // L'app ne doit PAS être coincée sur « Chargement… »
  const stuck = page.locator("text=Chargement…").or(page.locator("text=Chargement..."));
  await expect(stuck).toHaveCount(0, { timeout: 10_000 });

  // Au minimum un titre doit être visible (landing non authentiée)
  const heading = page.locator("h1, h2").first();
  await expect(heading).toBeVisible({ timeout: 10_000 });

  // Zéro erreur JS au boot
  expect(
    errors,
    `Erreurs JS au boot :\n${errors.join("\n")}`
  ).toHaveLength(0);
});

test("page /login charge sans erreur JS", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/login", { waitUntil: "networkidle" });

  const stuck = page.locator("text=Chargement…").or(page.locator("text=Chargement..."));
  await expect(stuck).toHaveCount(0, { timeout: 10_000 });

  // Formulaire de login visible
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 10_000 });

  expect(
    errors,
    `Erreurs JS au boot :\n${errors.join("\n")}`
  ).toHaveLength(0);
});
