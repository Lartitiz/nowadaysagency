/**
 * Packshot e-commerce (PR #401) — re-test live après déploiement
 *
 * Parcours : /photos → détail d'une photo prête → « Packshot e-commerce »
 * → « Générer le packshot » (1 crédit, appel Photoroom réel) → aperçu
 * → « Ajouter à ma bibliothèque » → nouvelle photo taguée packshot.
 *
 * Desktop uniquement (1 seul crédit/jour) et NETTOYAGE : le packshot créé est
 * supprimé en fin de test pour ne pas faire gonfler la bibliothèque de Camille.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/packshot");
fs.mkdirSync(SHOTS, { recursive: true });

test("packshot : génération fond blanc + ajout bibliothèque", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût : 1 crédit + 1 appel Photoroom)");
  test.setTimeout(240_000);

  await page.goto("/photos", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible({ timeout: 15_000 });

  // Une photo prête est requise (la bibliothèque de Camille en a depuis le chantier photos)
  const firstImg = page.locator(".grid img").first();
  await expect(firstImg, "Aucune photo prête dans la bibliothèque du compte test").toBeVisible({
    timeout: 15_000,
  });
  // Le onClick est porté par la carte parente ; l'overlay de survol intercepte
  // les pointer events au-dessus de l'image → on clique la carte elle-même.
  // On prend une carte AVEC image (les photos pending n'en ont pas).
  await page
    .locator(".grid .group.relative")
    .filter({ has: page.locator("img") })
    .first()
    .click();

  // Détail → bouton packshot. Depuis #424 (kind), il est direct pour une photo
  // produit, ou replié sous « Actions produit… » pour les autres types.
  const packshotBtn = page.getByRole("button", { name: /^Packshot e-commerce$/ });
  const foldToggle = page.getByText("Actions produit…");
  await expect(packshotBtn.or(foldToggle).first()).toBeVisible({ timeout: 10_000 });
  if (await packshotBtn.isVisible().catch(() => false)) {
    await packshotBtn.click();
  } else {
    await foldToggle.click();
    await page.getByRole("button", { name: /Packshot quand même/i }).click();
  }

  // Dialog packshot : source chargée puis génération
  await expect(page.getByRole("heading", { name: /Packshot e-commerce/i })).toBeVisible();
  const generate = page.getByRole("button", { name: /Générer le packshot/i });
  await expect(generate).toBeEnabled({ timeout: 20_000 });
  await page.screenshot({ path: path.join(SHOTS, "packshot-1-dialog.png") });

  await generate.click();

  // Photoroom : jusqu'à 60 s + 1 retry côté edge
  const result = page.getByAltText("Aperçu du packshot");
  await expect(result).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: path.join(SHOTS, "packshot-2-resultat.png") });

  // Ajout à la bibliothèque
  await page.getByRole("button", { name: /Ajouter à ma bibliothèque/i }).click();
  await expect(page.getByText("Packshot ajouté à ta bibliothèque")).toBeVisible({
    timeout: 30_000,
  });

  // La nouvelle photo apparaît dans la grille SANS rechargement de page.
  // ⚠️ Ne PAS faire page.goto ici : un reload masquerait le bug de grille figée
  // (même classe que #618 « Nouveau fond »). Le dialog s'est fermé, on est resté
  // sur /photos, et la carte doit surgir via l'invalidation de la sauvegarde.
  const created = page.locator('img[alt*="packshot" i]').first();
  await expect(created, "Le packshot doit apparaître SANS quitter /photos").toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: path.join(SHOTS, "packshot-3-grille.png"), fullPage: true });

  // Nettoyage : suppression du packshot créé (la bibliothèque reste stable
  // d'un run quotidien à l'autre)
  const createdCard = page
    .locator(".grid .group.relative")
    .filter({ has: page.locator('img[alt*="packshot" i]') })
    .first();
  await createdCard.hover();
  await createdCard.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("button", { name: "Supprimer" }).last().click();
  await expect(page.getByText("Photo supprimée")).toBeVisible({ timeout: 15_000 });
  console.log("Packshot généré, ajouté, vérifié puis nettoyé");
});
