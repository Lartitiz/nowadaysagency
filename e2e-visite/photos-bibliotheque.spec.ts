/**
 * Bibliothèque de photos (lot A stories visuelles) — re-test live après déploiement
 *
 * Parcours : /photos
 *
 * Critères :
 * - La page « Mes photos » se charge (titre + bouton « Ajouter des photos »)
 * - Soit l'état vide « séance photo » (compte sans photos), soit la grille
 *   accompagnée du panneau « Photos à prendre »
 * - Le bouton « Retouche IA » (flux historique) reste présent
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/photos");
fs.mkdirSync(SHOTS, { recursive: true });

test("bibliothèque photos : page, séance photo ou grille + liste de courses", async ({ page }) => {
  await page.goto("/photos", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Ajouter des photos/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Retouche IA/i })).toBeVisible();

  // Deux états légitimes selon le compte : séance photo (vide) ou grille + wishlist
  const seance = page.getByText(/séance photo de 20 minutes/i).first();
  const wishlist = page.getByText(/Photos à prendre/i).first();

  const isEmpty = await seance.isVisible({ timeout: 10_000 }).catch(() => false);
  if (isEmpty) {
    // L'état vide doit proposer la liste d'idées (IA ou fallback) sans erreur bloquante
    await expect(page.getByRole("button", { name: /Garder cette liste/i })).toBeVisible();
    console.log("État vide « séance photo » affiché");
  } else {
    await expect(wishlist).toBeVisible({ timeout: 10_000 });
    console.log("Grille + panneau « Photos à prendre » affichés");
  }

  await page.screenshot({ path: path.join(SHOTS, "photos-bibliotheque.png"), fullPage: true });
});
