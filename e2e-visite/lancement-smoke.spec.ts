import { test, expect } from "@playwright/test";

// Smoke post-déploiement PR #316 — module « Préparer un lancement ».
// Vérifie : wizard OK, « 🚀 Lancer » persiste et route vers reco/plan (plus
// jamais de lancement invisible), page reco avec « Passer cette étape ».

test("Lancement — wizard → Lancer → recommandation/plan", async ({ page }) => {
  await page.goto("/instagram/lancement", { waitUntil: "networkidle" });

  // Wizard chargé (pas l'écran d'erreur)
  await expect(page.getByRole("heading", { name: /Préparer un lancement/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel(/Nom de l'offre/i)).toBeVisible();

  // Renseigne un nom si vide (lancement de test)
  const nameInput = page.getByLabel(/Nom de l'offre/i);
  if (!(await nameInput.inputValue())) {
    await nameInput.fill("Smoke test lancement PR316");
  }

  // Étape 5 (Récap) via le stepper puis « 🚀 Lancer »
  await page.getByRole("button", { name: /Récap/i }).click();
  const lancerBtn = page.getByRole("button", { name: /🚀 Lancer/i });
  await expect(lancerBtn).toBeVisible();
  await lancerBtn.click();

  // Doit atterrir sur la reco (aucun modèle choisi) ou le plan (modèle déjà en base)
  await page.waitForURL(/\/instagram\/lancement\/(recommandation|plan)/, { timeout: 15000 });

  if (page.url().includes("recommandation")) {
    await expect(page.getByText(/On choisit ton modèle de lancement/i)).toBeVisible();
    await expect(page.getByText(/Passer cette étape/i)).toBeVisible();
    // « Passer » mène bien au plan
    await page.getByText(/Passer cette étape/i).click();
    await page.waitForURL(/\/instagram\/lancement\/plan/, { timeout: 15000 });
  }
  await expect(page.getByRole("heading", { name: /Planifier mon lancement/i })).toBeVisible({ timeout: 15000 });
});
