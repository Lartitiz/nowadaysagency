/**
 * Sonde de réaction — chaque geste doit produire un RETOUR VISIBLE en < ~2 s.
 *
 * Généralise la garde anti-« écran figé » (#618, #622) au-delà de /photos :
 * attrape les « clics morts » — l'utilisatrice agit, et rien ne bouge (aucun
 * spinner, aucun toast, aucun changement d'état, aucune fenêtre qui s'ouvre).
 *
 * Contraintes tenues pour tourner AU QUOTIDIEN sans dégât :
 * - GRATUIT : aucun geste ne déclenche de génération IA (aucun crédit).
 * - SANS effet durable : chaque geste est réversible (bascule annulée) ou en
 *   lecture seule (ouverture d'une fenêtre, refermée).
 * - Défensif : si le déclencheur est ABSENT (selon les données du compte), on
 *   SKIP en le journalisant ; s'il est PRÉSENT mais SANS réaction, c'est ROUGE.
 * - 🔑 Jamais de reload entre le geste et la vérif (un rechargement masquerait
 *   le bug). Desktop only (évite les courses de bascule entre projets parallèles
 *   sur le même compte ; la classe de bug est indépendante de la plateforme).
 *
 * Extensible : ajouter un geste = ajouter un `test(...)` sur le même modèle
 * (déclencheur → clic → réaction attendue < 2 s, refermer/annuler).
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/reactions");
fs.mkdirSync(SHOTS, { recursive: true });

const ACK_MS = 2_000; // budget « accusé de réception »

test.describe("sonde de réaction (< 2 s)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  // ── Geste 1 : bascule d'un canal (Profil) ────────────────────────────────
  // Couvre la classe « je change un réglage, l'écran doit réagir » (bug canaux
  // #622). Réversible : on bascule le canal SEO puis on le remet — net nul.
  test("canaux : basculer un canal produit un toast immédiat", async ({ page }) => {
    await page.goto("/profil", { waitUntil: "networkidle" });

    const label = page.getByText("Mes canaux de communication");
    if (!(await label.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, "section canaux absente sur ce compte");
    }
    const section = label.locator(".."); // le conteneur <div class="pt-2">
    const seoBtn = section.getByRole("button", { name: /SEO/i }).first();
    if (!(await seoBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "canal SEO absent (jeu de canaux différent)");
    }

    // Clic 1 : réaction attendue = toast « SEO ajouté/retiré » sous 2 s.
    await seoBtn.click();
    await expect(
      page.getByText(/SEO (ajouté|retiré)/i).first(),
      "Basculer un canal doit confirmer visuellement sous 2 s (sinon clic mort)",
    ).toBeVisible({ timeout: ACK_MS });
    await page.screenshot({ path: path.join(SHOTS, "reaction-canal.png") });

    // Clic 2 : on restaure l'état initial (net nul) — toujours une réaction.
    await page.waitForTimeout(600); // laisse le 1er toast se poser
    await seoBtn.click();
    await expect(page.getByText(/SEO (ajouté|retiré)/i).first()).toBeVisible({ timeout: ACK_MS });
    console.log("Réaction canal OK (toast < 2 s, état restauré)");
  });

  // ── Geste 2 : ouverture d'une fenêtre depuis une carte (Photos) ───────────
  // Couvre la classe « je clique, une vue doit s'ouvrir ». Lecture seule, aucun
  // crédit : on ouvre le détail d'une photo puis la fenêtre « Modifier le fond »
  // (sans lancer de génération), et on referme. Deux réactions mesurées.
  test("photos : clic → détail, puis « Modifier le fond » ouvre sa fenêtre", async ({ page }) => {
    await page.goto("/photos", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Mes photos" })).toBeVisible({ timeout: 15_000 });

    const firstImg = page.locator(".grid img").first();
    if (!(await firstImg.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, "aucune photo prête dans la bibliothèque du compte");
    }

    // Réaction A : clic sur la carte → le détail s'ouvre (ancre stable = un
    // bouton du détail) sous 2 s.
    await page
      .locator(".grid .group.relative")
      .filter({ has: page.locator("img") })
      .first()
      .click();
    const editBtn = page.getByRole("button", { name: /Modifier le fond/i });
    await expect(
      editBtn,
      "Cliquer une photo doit ouvrir son détail sous 2 s",
    ).toBeVisible({ timeout: ACK_MS });

    // Réaction B : « Modifier le fond » → sa fenêtre s'ouvre sous 2 s (aucune
    // génération lancée : on se contente d'ouvrir puis fermer).
    await editBtn.click();
    await expect(
      page.getByRole("heading", { name: /Modifier le fond de la photo/i }),
      "« Modifier le fond » doit ouvrir sa fenêtre sous 2 s",
    ).toBeVisible({ timeout: ACK_MS });
    await page.screenshot({ path: path.join(SHOTS, "reaction-photo-dialog.png") });

    await page.keyboard.press("Escape"); // referme la fenêtre de retouche
    await page.keyboard.press("Escape"); // referme le détail
    console.log("Réaction photos OK (détail + fenêtre retouche < 2 s)");
  });
});
