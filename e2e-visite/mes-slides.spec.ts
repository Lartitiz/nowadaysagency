import { test, expect } from "@playwright/test";

// Smoke visuel du mode carrousel « Mes slides » (texte fourni, design seul).
// Parcours : /creer → idée → format carrousel → tuile « Mes slides » → Suivant
// → collage → découpage → écran liste. NE CLIQUE PAS « Créer le design »
// (passe gabarits + rendu = appels facturés — ce smoke reste gratuit).
test("mes-slides: parcours jusqu'à l'écran de saisie", async ({ page }, testInfo) => {
  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  // Étape 1 : idée
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill("Mes 5 slides déjà écrites sur la savonnerie");
  await page.getByRole("button", { name: /suivant/i }).click();

  // Étape 2 : Instagram → Carrousel → tuile « Mes slides »
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const carrouselCard = page.getByText(/^Carrousel$/, { exact: true }).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();

  const tuile = page.getByRole("button", { name: /Mes slides/ }).first();
  await expect(tuile).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: testInfo.outputPath("01-picker-sous-modes.png"), fullPage: true });
  await tuile.click();
  // Chip repliée + pas de sélecteur d'angle dans ce mode
  await expect(page.getByText("Ton texte slide par slide", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/angle éditorial/i)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("02-tuile-choisie.png"), fullPage: true });
  await page.getByRole("button", { name: /^suivant/i }).first().click();

  // Écran de saisie
  await expect(page.getByText("Tes slides, ton texte")).toBeVisible({ timeout: 10000 });
  const paste = page.getByPlaceholder(/Colle tout ton texte/);
  await paste.fill(
    "Slide 1 : J'ai ouvert ma savonnerie avec 200 €.\n\nTout le monde m'a dit que c'était impossible.\n\n3. Résultat : -40 % de coûts en 3 mois.\n\nEt toi, tu attends quoi ?",
  );
  await page.screenshot({ path: testInfo.outputPath("03-collage.png"), fullPage: true });
  await page.getByRole("button", { name: /Découper en slides/ }).click();

  // 4 slides découpées, marqueurs retirés, compteur visible
  await expect(page.getByText("4 slides")).toBeVisible();
  const bodies = page.locator("textarea[placeholder*='texte de cette slide']");
  await expect(bodies).toHaveCount(4);
  await expect(bodies.nth(0)).toHaveValue("J'ai ouvert ma savonnerie avec 200 €.");
  await expect(bodies.nth(2)).toHaveValue("Résultat : -40 % de coûts en 3 mois.");
  // Légende + bouton + mention
  await expect(page.getByPlaceholder(/Ta légende/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Créer le design/ })).toBeEnabled();
  await expect(page.getByText("elle ne touche pas à ton texte")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("04-slides-decoupees.png"), fullPage: true });
});
