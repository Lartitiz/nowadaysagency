/**
 * « Modifier le fond » AVEC LE TEMPS RÉEL COUPÉ (garde directe du bug #618).
 *
 * Le bug : après « Générer le nouveau fond », la grille restait figée sur
 * l'ancien fond jusqu'à sortir/revenir de /photos. La cause n'apparaît QUE
 * quand le Realtime Supabase ne pousse rien (flaky connu en prod) : c'est alors
 * au filet de secours (invalidation au lancement + polling tant qu'une photo est
 * en cours) de porter la mise à jour. Les tests « chemin heureux » ne le voient
 * pas car le Realtime marche presque toujours en CI.
 *
 * Ici on COUPE volontairement le WebSocket realtime, puis on vérifie, SANS
 * jamais recharger la page :
 *   1. la carte passe en « Retouche en cours… » (l'invalidation au lancement
 *      rend le pending visible → le polling peut démarrer) ;
 *   2. elle revient prête (le polling a porté le résultat, sans Realtime) ;
 *   3. le détail montre le badge « Retouchée » (bascule avant/après câblée).
 *
 * Coût : 1 crédit Photoroom. Hebdo (lundi), comme carousel-photo-live.
 * Travaille sur une photo JETABLE uploadée en début de test (fixture), pour ne
 * jamais dégrader la bibliothèque du compte de démo.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures-cover-test.jpg");
const SHOTS = path.join(__dirname, "shots/retouche-rt-coupe");
fs.mkdirSync(SHOTS, { recursive: true });

test("modifier le fond, temps réel coupé : la grille se met à jour sans reload", async ({
  page,
  viewport,
}) => {
  const isMonday = new Date().getDay() === 1;
  test.skip(!isMonday && !process.env.FORCE_RT_COUPE, "lundi uniquement (coût ~1 crédit/semaine)");
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût Photoroom réel)");
  test.setTimeout(300_000);

  // COUPE le temps réel : on intercepte le WebSocket Supabase realtime et on ne
  // le relie JAMAIS au serveur (connectToServer non appelé) → socket ouverte
  // côté client mais AUCUN message ne descend. Simulation fidèle d'un Realtime
  // muet. À poser AVANT toute navigation.
  await page.routeWebSocket(/\/realtime\/v1\//, () => {
    /* volontairement muet : on n'appelle pas ws.connectToServer() */
  });

  await page.goto("/photos", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible({ timeout: 15_000 });

  // Photo jetable : upload d'une fixture (sans crédit). Sa vignette apparaît en
  // place (le polling de secours couvre déjà l'upload : ligne posée ready).
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Ajouter des photos/i }).click(),
  ]);
  await chooser.setFiles(FIXTURE);
  const thumb = page.locator('img[alt*="cover-test" i]').first();
  await expect(thumb).toBeVisible({ timeout: 45_000 });

  // Détail → « Modifier le fond »
  await page
    .locator(".grid .group.relative")
    .filter({ has: page.locator('img[alt*="cover-test" i]') })
    .first()
    .click();
  await page.getByRole("button", { name: /Modifier le fond/i }).click();
  await expect(page.getByRole("heading", { name: /Modifier le fond de la photo/i })).toBeVisible({
    timeout: 10_000,
  });

  // Décrire un décor + lancer
  await page.locator("#retouche-prompt").fill("fond studio beige lumineux, lumière douce");
  await page.getByRole("button", { name: /Générer le nouveau fond/i }).click();
  await expect(page.getByText(/la photo se met à jour dans la galerie/i)).toBeVisible({
    timeout: 15_000,
  });

  // 1. SANS reload : la carte doit passer « Retouche en cours… ». C'est CE point
  //    qui échouait avant #618 (pending jamais reflété faute d'invalidation).
  await expect(
    page.getByText("Retouche en cours…").first(),
    "Le pending doit devenir visible sans Realtime ni rechargement",
  ).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(SHOTS, "rt-1-en-cours.png") });

  // 2. SANS reload : le polling (4 s) porte le résultat jusqu'à ready, sans que
  //    le Realtime ait rien poussé.
  await expect(page.getByText("Retouche en cours…")).toHaveCount(0, { timeout: 180_000 });
  await expect(page.locator('img[alt*="cover-test" i]').first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: path.join(SHOTS, "rt-2-pret.png"), fullPage: true });

  // 3. Le détail expose bien la retouche (badge « Retouchée » = avant/après câblé)
  await page
    .locator(".grid .group.relative")
    .filter({ has: page.locator('img[alt*="cover-test" i]') })
    .first()
    .click();
  await expect(page.getByText("Retouchée").first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  // Nettoyage : suppression de la photo jetable
  const card = page
    .locator(".grid .group.relative")
    .filter({ has: page.locator('img[alt*="cover-test" i]') })
    .first();
  await card.hover();
  await card.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("button", { name: "Supprimer" }).last().click();
  await expect(page.getByText("Photo supprimée")).toBeVisible({ timeout: 15_000 });
  console.log("Temps réel coupé : retouche reflétée en place via polling, badge OK, nettoyé");
});
