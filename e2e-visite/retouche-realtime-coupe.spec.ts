/**
 * « Changer le décor » AVEC LE TEMPS RÉEL COUPÉ (garde directe du bug #618).
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

/** Posé dès que la fixture est uploadée : le nettoyage n'a de sens qu'après. */
let fixtureUploaded = false;

/**
 * Nettoyage GARANTI de la photo jetable, même si une assertion a échoué.
 *
 * Le 03/08 le test s'est arrêté sur l'étape 3 : le nettoyage, qui vivait à la
 * fin du corps du test, n'a jamais tourné. La fixture (une slide graphique
 * orange « 5 rituels slow pour ta com' ») est restée dans la bibliothèque du
 * compte de démo — et le lendemain `carousel-mix-live` l'a piochée, s'est fait
 * refuser par la garde de cohérence photo/idée (à raison : ce n'est pas une
 * vraie photo) et a attendu 13 min avant de tomber. Un test qui échoue ne doit
 * pas empoisonner le compte partagé des autres specs.
 *
 * La boucle ramasse aussi d'éventuels restes d'un run précédent.
 */
test.afterEach(async ({ page }) => {
  if (!fixtureUploaded) return;
  fixtureUploaded = false;
  await page.goto("/photos", { waitUntil: "domcontentloaded" }).catch(() => {});
  const fixtures = page.locator('img[alt*="cover-test" i]');
  // Les `alt` sont posés APRÈS le rendu de la grille : sans ce répit, le filtre
  // ne matche rien et on repart en annonçant « rien à nettoyer » (faux vert).
  await fixtures.first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});

  for (let i = 0; i < 5; i++) {
    const restant = await fixtures.count().catch(() => 0);
    if (restant === 0) break;
    const card = page.locator(".grid .group.relative").filter({ has: fixtures }).first();
    await card.hover().catch(() => {});
    await card
      .getByRole("button", { name: "Supprimer" })
      .click()
      .catch(() => {});
    await page
      .getByRole("button", { name: "Supprimer" })
      .last()
      .click()
      .catch(() => {});
    // On attend que le COMPTE baisse, pas le toast : « Photo supprimée » reste
    // affiché d'une itération à l'autre et ferait tourner la boucle à vide.
    await expect(fixtures)
      .toHaveCount(restant - 1, { timeout: 20_000 })
      .catch(() => {});
  }
  console.log(`nettoyage fixture : ${await fixtures.count().catch(() => "?")} restante(s)`);
});

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
  fixtureUploaded = true;
  const thumb = page.locator('img[alt*="cover-test" i]').first();
  await expect(thumb).toBeVisible({ timeout: 45_000 });

  // Détail → « Retoucher » → « Changer le décor »
  await page
    .locator(".grid .group.relative")
    .filter({ has: page.locator('img[alt*="cover-test" i]') })
    .first()
    .click();
  await page.getByRole("button", { name: /^Retoucher$/ }).click();
  await page.getByRole("button", { name: /Changer le décor/i }).click();
  await expect(page.getByRole("heading", { name: /Changer le décor/i })).toBeVisible({
    timeout: 10_000,
  });

  // Décrire un décor + lancer
  await page.locator("#retouche-prompt").fill("fond studio beige lumineux, lumière douce");

  // 1. SANS reload : la carte doit passer « Retouche en cours… ». C'est CE point
  //    qui échouait avant #618 (pending jamais reflété faute d'invalidation).
  //
  //    ⚠️ L'observateur est armé AVANT le clic, pas après le toast. Le toast
  //    « Retouche lancée » est émis en aval de `await mutate(...)`, donc APRÈS
  //    la réponse de l'edge `photo-background-replace` — c'est-à-dire quand la
  //    ligne est déjà repassée `ready`. S'ancrer dessus revenait à regarder la
  //    fenêtre pending une fois refermée. Ça n'a pas cassé tant que Photoroom
  //    traînait (14 min le 11/08) ; le 17/08 l'edge a répondu en ~5 s et le
  //    test est tombé alors que le filet #618 fonctionnait (le refetch
  //    d'invalidation renvoyait bien `status: "pending"`).
  const pendingVu = page
    .getByText("Retouche en cours…")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });

  await page.getByRole("button", { name: /Générer le nouveau fond/i }).click();
  await pendingVu;
  await page.screenshot({ path: path.join(SHOTS, "rt-1-en-cours.png") });
  await expect(page.getByText(/la photo se met à jour dans la galerie/i)).toBeVisible({
    timeout: 60_000,
  });

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

  // Le nettoyage de la photo jetable vit dans le afterEach ci-dessus : il doit
  // tourner AUSSI quand une assertion casse.
  console.log("Temps réel coupé : retouche reflétée en place via polling, badge OK");
});
