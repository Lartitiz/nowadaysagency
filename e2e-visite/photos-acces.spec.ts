/**
 * Accès direct à la bibliothèque photos (PR #396 + #39x) — re-test live après déploiement
 *
 * Deux emplacements :
 * 1. Dashboard (AdaptiveHome, la vue par défaut de /dashboard) : depuis la
 *    simplification de l'accueil (#1019, 15/09), la « porte 3 » du dashboard
 *    3 portes est devenue la section « Donne vie à tes photos » — une
 *    `<section aria-labelledby="home-photos-title">` avec un bouton
 *    « Choisir une photo » qui mène à /photos (plus de vignettes cliquables ni
 *    de libellé « Mettre mes photos aux couleurs de ma marque »).
 * 2. Menu : #1019 a remplacé le panneau de gauche permanent par un TIROIR
 *    « Mon espace » (Sheet), ouvert depuis l'en-tête en desktop et depuis la
 *    barre du bas en mobile. L'entrée « Mes photos » vit dans le 1er groupe
 *    « Mon travail » du menu — toujours une seule fois, toujours /photos.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/photos-acces");
fs.mkdirSync(SHOTS, { recursive: true });

test("dashboard : porte « Mes photos » présente et mène à /photos", async ({ page }) => {
  // Neutralise l'overlay de visite guidée (1re visite) qui, en contexte de test
  // (storageState neuf à chaque run), recouvre la page et intercepte les clics.
  await page.addInitScript(() => {
    localStorage.setItem("lac_dashboard_tour_seen", "1");
  });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // Voisinage attendu : le raccourci « Mes idées » cohabite avec la porte photos
  // (depuis #1019 c'est un lien souligné « Accéder à mes idées », plus une pill).
  await expect(page.getByRole("button", { name: /Accéder à mes idées/i })).toBeVisible({
    timeout: 20_000,
  });

  // La porte est une <section> nommée par son titre : on l'accroche par
  // `aria-labelledby`, le seul repère stable quand la copy bouge.
  const porte = page.locator('section[aria-labelledby="home-photos-title"]');
  await expect(porte).toBeVisible({ timeout: 10_000 });
  await expect(porte.getByRole("heading", { name: /Donne vie à tes photos/i })).toBeVisible();

  await page.screenshot({ path: path.join(SHOTS, "dashboard-porte.png"), fullPage: true });

  await porte.scrollIntoViewIfNeeded();

  // On vise l'endroit où une utilisatrice tape VRAIMENT : le bouton d'action.
  const pill = porte.getByRole("button", { name: /Choisir une photo/i });

  // 🔑 Barre d'onglets fixe en bas (mobile, 22/09) : `scrollIntoViewIfNeeded`
  // ne fait RIEN si le bouton est déjà dans l'écran… même caché SOUS la barre.
  // Depuis #1039 le bouton tombe pile dessous au chargement → faux « recouvert ».
  // Une utilisatrice fait défiler : on centre le bouton, comme son pouce.
  await pill.evaluate((el) => el.scrollIntoView({ block: "center" }));

  // Ce qu'on veut VRAIMENT prouver : la porte est atteignable au doigt,
  // c'est-à-dire que rien ne la recouvre à l'endroit où on taperait.
  // On le mesure avec le hit-test de la PAGE (elementFromPoint), pas avec les
  // coordonnées de Playwright.
  //
  // 🔑 Piège d'émulation mobile (04/08) : sur un écran mobile scrollé À FOND,
  // Chromium pose `visualViewport.offsetTop = 33` (layout viewport 877 px vs
  // visual viewport 844 px). `boundingBox()` rend alors un `y` de 33 px INFÉRIEUR
  // au `getBoundingClientRect()` de la page, donc `.click()` tape 33 px trop haut.
  // Aucun rapport avec un recouvrement réel : au doigt, la porte répond.
  const occlusion = await pill.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { couverte: !el.contains(top) && top !== el, par: top ? top.tagName : "null" };
  });
  expect(occlusion.couverte, `la porte « Mes photos » est recouverte par ${occlusion.par}`).toBe(false);

  // Le clic passe par le DOM : il déclenche le vrai onClick du bouton sans
  // dépendre des coordonnées faussées par l'émulation.
  await pill.evaluate((el) => (el as HTMLElement).click());
  await expect(page).toHaveURL(/\/photos$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /ma bibliothèque|mes photos/i }).first()).toBeVisible();
});

test("menu : « Mes photos » présente une seule fois et pointe /photos", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // #1019 : la navigation complète vit dans le tiroir « Mon espace ». Deux
  // déclencheurs existent dans le DOM (en-tête desktop / barre du bas mobile),
  // un seul est VISIBLE selon la largeur — on prend celui-là.
  await page.locator('button:visible', { hasText: "Mon espace" }).first().click();
  const drawer = page.getByRole("dialog").filter({ hasText: "Mon espace" }).first();
  await expect(drawer).toBeVisible({ timeout: 10_000 });

  // Le câblage testé : une seule entrée vers /photos, libellée « Mes photos ».
  const menuLink = drawer.locator('nav a[href="/photos"]');
  await expect(menuLink).toHaveCount(1);
  await expect(menuLink).toHaveText(/Mes photos/i);
});
