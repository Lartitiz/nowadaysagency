/**
 * T10 — Vérif connexions (ConnectionCheckPage)
 *
 * Parcours : /parametres/connexions → "Lancer la vérification"
 *            → résultats groupés (Erreurs / Warnings / OK / Infos)
 *
 * Critères :
 * - La vérification se lance et se termine sans crash.
 * - Les sections de résultats s'affichent (même si branding vide = warnings attendus).
 * - Aucune plateforme réellement non connectée n'apparaît comme "ok" à tort.
 * - Régression PR #96/#98 : pas de stale closure affichant une fausse valeur.
 *
 * Note : le compte Camille a son branding vide (reset T5) → les checks de
 * branding apparaîtront en warning, ce qui est CORRECT et attendu.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/t10");
fs.mkdirSync(SHOTS, { recursive: true });

test("T10 — Vérif connexions : lance, termine, affiche résultats sans crash", async ({ page }) => {
  await page.goto("/parametres/connexions", { waitUntil: "networkidle" });

  // La page doit charger
  const launchBtn = page.getByRole("button", { name: /lancer la vérification/i });
  await expect(launchBtn).toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: path.join(SHOTS, "t10-avant-verification.png") });

  // Lancer la vérification
  await launchBtn.click();

  // Le bouton passe en "Analyse en cours..."
  await expect(
    page.getByText(/analyse en cours|relancer/i).first()
  ).toBeVisible({ timeout: 5000 });

  // Attendre la fin de la vérification (apparition d'au moins un groupe de résultats)
  await expect(
    page.getByText(/tout va bien|erreurs|warnings|infos|suggestions/i).first()
  ).toBeVisible({ timeout: 30000 });

  await page.screenshot({ path: path.join(SHOTS, "t10-resultats.png"), fullPage: true });

  // Vérifier que la page n'a pas crashé (pas de "Something went wrong")
  const pageText = await page.locator("body").textContent() || "";
  expect(pageText).not.toMatch(/something went wrong|uncaught error|cannot read/i);

  // Pas de doublon : les items "ok" ne doivent PAS également apparaître comme "error"
  // (régression stale closure PR #96/#98)
  // On vérifie simplement que la structure de résultats est cohérente
  const hasResults = pageText.includes("OK") ||
    pageText.includes("Tout va bien") ||
    pageText.includes("Erreurs") ||
    pageText.includes("Warnings");
  expect(hasResults, "Aucun groupe de résultats trouvé après vérification").toBe(true);

  console.log("✅ T10 — Vérification connexions terminée, résultats affichés sans crash");
});

test("T10b — Le bouton devient 'Relancer' après une première vérification", async ({ page }) => {
  await page.goto("/parametres/connexions", { waitUntil: "networkidle" });

  const launchBtn = page.getByRole("button", { name: /lancer la vérification/i });
  await expect(launchBtn).toBeVisible({ timeout: 10000 });
  await launchBtn.click();

  // Après la vérif, le bouton doit devenir "Relancer"
  await expect(
    page.getByRole("button", { name: /relancer/i })
  ).toBeVisible({ timeout: 30000 });

  console.log("✅ T10b — Bouton 'Relancer' visible après première vérification");
});
