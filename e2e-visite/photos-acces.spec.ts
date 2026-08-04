/**
 * Accès direct à la bibliothèque photos (PR #396 + #39x) — re-test live après déploiement
 *
 * Deux emplacements :
 * 1. Dashboard (AdaptiveHome, la vue par défaut de /dashboard) : pill « Mes photos »
 *    dans la section « Piloter », avec compteur, qui mène à /photos.
 * 2. Menu gauche : entrée « Ma bibliothèque photos » remontée dans le 1er groupe
 *    « CRÉER ET PLANIFIER » (et retirée de RESSOURCES → une seule entrée, pas de doublon).
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/photos-acces");
fs.mkdirSync(SHOTS, { recursive: true });

test("dashboard : pill « Mes photos » présente et mène à /photos", async ({ page }) => {
  // Neutralise l'overlay de visite guidée (1re visite) qui, en contexte de test
  // (storageState neuf à chaque run), recouvre la page et intercepte les clics.
  await page.addInitScript(() => {
    localStorage.setItem("lac_dashboard_tour_seen", "1");
  });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // Voisinage attendu dans « Piloter » : la pill « Mes idées » cohabite.
  await expect(page.getByRole("button", { name: /Mes idées/i })).toBeVisible({ timeout: 20_000 });

  const pill = page.getByRole("button", { name: /Mes photos/i });
  await expect(pill).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: path.join(SHOTS, "dashboard-pill.png"), fullPage: true });

  await pill.scrollIntoViewIfNeeded();

  // Ce qu'on veut VRAIMENT prouver : la pastille est atteignable au doigt,
  // c'est-à-dire que rien ne la recouvre à l'endroit où on taperait.
  // On le mesure avec le hit-test de la PAGE (elementFromPoint), pas avec les
  // coordonnées de Playwright.
  //
  // 🔑 Piège d'émulation mobile (04/08) : sur un écran mobile scrollé À FOND,
  // Chromium pose `visualViewport.offsetTop = 33` (layout viewport 877 px vs
  // visual viewport 844 px). `boundingBox()` rend alors un `y` de 33 px INFÉRIEUR
  // au `getBoundingClientRect()` de la page, donc `.click()` tape 33 px trop haut —
  // ici pile sur le libellé « PILOTER » (`SectionLabel`, un <p>), qui « intercepte
  // les événements ». Le dashboard mobile mesure 1137 px pour 877 px de viewport :
  // la pastille vit dans les derniers pixels, donc l'aller-voir force le scroll
  // maximal et déclenche l'offset à tous les coups. Aucun rapport avec un
  // recouvrement réel : au doigt, la pastille répond.
  const occlusion = await pill.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { couverte: !el.contains(top) && top !== el, par: top ? top.tagName : "null" };
  });
  expect(occlusion.couverte, `la pastille est recouverte par ${occlusion.par}`).toBe(false);

  // Le clic passe par le DOM : il déclenche le vrai onClick du bouton sans
  // dépendre des coordonnées faussées par l'émulation.
  await pill.evaluate((el) => (el as HTMLElement).click());
  await expect(page).toHaveURL(/\/photos$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible();
});

test("menu : « Ma bibliothèque photos » présente une seule fois et pointe /photos", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // Le panneau de gauche est monté dans le DOM (desktop) ou ouvrable (mobile) ;
  // on vérifie le câblage sans dépendre du survol : une seule entrée vers /photos.
  const menuLink = page.locator('nav a[href="/photos"]');
  await expect(menuLink).toHaveCount(1);
  await expect(menuLink).toHaveText(/Ma bibliothèque photos/i);
});
