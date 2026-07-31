import { test, expect } from "@playwright/test";

// Un mois sans contenu affichait une GRILLE NUE : ni « c'est vide », ni le moindre
// indice qu'il y a du contenu ailleurs — alors que le dashboard, lui, sait nommer
// le prochain contenu (friction relevée au regard UX du 31/07/2026).
//
// 🔑 Deux mois volontairement LOINTAINS via ?date= : le test ne dépend donc pas de
// l'état du mois courant de Camille (qui se remplit et se vide au fil des runs).
// Passé lointain → le contenu voisin est dans le FUTUR ; futur lointain → il est
// dans le PASSÉ. Les deux branches du message sont ainsi couvertes.

test("mois vide (passé lointain) : état vide + indice vers le prochain contenu", async ({ page }) => {
  await page.goto("/calendrier?date=2019-03-01");

  const vide = page.getByText(/Rien de prévu ce mois-ci/i);
  await expect(vide).toBeVisible({ timeout: 20000 });

  // L'indice doit nommer une DATE, pas juste dire « c'est vide ».
  const indice = page.getByText(/Ton prochain contenu est le\s+\S+/i);
  await expect(indice).toBeVisible();

  // Et le raccourci doit vraiment déplacer le calendrier hors de mars 2019.
  await expect(page.getByText(/mars 2019/i)).toBeVisible();
  await page.getByRole("button", { name: "Y aller" }).click();
  await expect(page.getByText(/mars 2019/i)).toHaveCount(0, { timeout: 10000 });
  // On a atterri sur un mois qui contient réellement du contenu.
  await expect(page.getByText(/Rien de prévu ce mois-ci/i)).toHaveCount(0);
});

test("mois vide (futur lointain) : l'indice pointe vers le dernier contenu", async ({ page }) => {
  await page.goto("/calendrier?date=2029-03-01");

  await expect(page.getByText(/Rien de prévu ce mois-ci/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Ton dernier contenu était le\s+\S+/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Le revoir" })).toBeVisible();
});
