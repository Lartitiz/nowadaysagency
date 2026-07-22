/**
 * Grille /photos : mise à jour EN PLACE après une action (garde anti-#618).
 *
 * Ce test attrape la classe de bug « j'agis, mais rien ne bouge tant que je ne
 * sors/reviens pas de la page » : une écriture dans user_photos qui ne rafraîchit
 * pas la grille faute d'invalidation (le fond figé de « Nouveau fond », #618, et
 * les mêmes trous dans Packshot / Mise en scène).
 *
 * On prend le geste le PLUS SIMPLE et SANS CRÉDIT — un upload — parce qu'il
 * exerce exactement le même chemin « action → la grille se met à jour toute
 * seule » : carte optimiste immédiate, puis vraie vignette, le tout SANS aucun
 * page.goto. Tourne donc au quotidien (desktop), et nettoie derrière lui.
 *
 * Règle de fond, valable pour TOUTE spec photo : jamais de rechargement entre
 * l'action et la vérification. Un reload masquerait précisément ce bug.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures-cover-test.jpg");
const SHOTS = path.join(__dirname, "shots/photos-refresh");
fs.mkdirSync(SHOTS, { recursive: true });

test("grille /photos : upload → carte optimiste + vraie vignette SANS reload", async ({
  page,
  viewport,
}) => {
  // Desktop : le nettoyage (suppression) passe par un survol de carte, non
  // reproductible au toucher. La logique d'invalidation testée est identique
  // sur mobile (même code), le desktop suffit comme garde quotidienne.
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (nettoyage au survol)");
  test.setTimeout(120_000);

  await page.goto("/photos", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible({ timeout: 15_000 });

  // 1. Upload d'une photo (aucun crédit : simple stockage)
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Ajouter des photos/i }).click(),
  ]);
  await chooser.setFiles(FIXTURE);

  // 2. ACCUSÉ DE RÉCEPTION immédiat : la carte optimiste « Envoi en cours… »
  //    apparaît sans le moindre rechargement. Si elle n'apparaît pas vite, le
  //    clic est « mort » du point de vue de l'utilisatrice.
  await expect(
    page.getByText("Envoi en cours…").first(),
    "Retour visuel immédiat attendu après l'ajout (carte optimiste)",
  ).toBeVisible({ timeout: 4_000 });
  await page.screenshot({ path: path.join(SHOTS, "refresh-1-optimiste.png") });

  // 3. La VRAIE vignette prend le relais EN PLACE (invalidation de la query).
  //    Sans elle, l'optimiste disparaîtrait et la photo s'évanouirait jusqu'à
  //    un F5 : on vérifie donc que la carte cover-test est bien là APRÈS que
  //    « Envoi en cours… » a disparu — toujours sans page.goto.
  const real = page.locator('img[alt*="cover-test" i]').first();
  await expect(real, "La vraie vignette doit surgir SANS quitter /photos").toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText("Envoi en cours…")).toHaveCount(0, { timeout: 45_000 });
  await page.screenshot({ path: path.join(SHOTS, "refresh-2-vignette.png"), fullPage: true });

  // 4. Nettoyage : suppression de la photo de test (la bibliothèque reste stable)
  const card = page
    .locator(".grid .group.relative")
    .filter({ has: page.locator('img[alt*="cover-test" i]') })
    .first();
  await card.hover();
  await card.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("button", { name: "Supprimer" }).last().click();
  await expect(page.getByText("Photo supprimée")).toBeVisible({ timeout: 15_000 });
  console.log("Grille /photos : upload reflété en place (optimiste + vignette), nettoyé");
});
