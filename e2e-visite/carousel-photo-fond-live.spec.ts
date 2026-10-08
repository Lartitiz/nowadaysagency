/**
 * Carrousel PHOTO « Tes photos en fond » (carouselSubMode `photo`) — génération
 * réelle de bout en bout + attente vivante (08/10/2026).
 *
 * Jumeau de carousel-photo-live (qui couvre « Photos brutes », sans plan ni
 * brouillon). Ici le texte est posé SUR les photos : on vérifie que le plan
 * envisagé s'affiche vite, que les brouillons montrent les photos en fond
 * quand elles sont déjà décidées, et que le résultat porte bien du texte.
 *
 * En mode photo, l'app demande d'abord un plan (structure_proposal, avec les
 * photos) puis le valide seule : le plan affiché vient donc du plan validé,
 * pas de l'appel Haiku `plan_envisage` (secours si la structure échoue).
 *
 * Coût réel ~1 crédit → lundi uniquement, ou FORCE_CAROUSEL_PHOTO=1. Desktop.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { tapCarouselSse, watchWaitingScreen } from "./carousel-wait-probe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/carousel-photo-fond");
fs.mkdirSync(SHOTS, { recursive: true });

const FIXTURES = [
  path.join(__dirname, "fixtures-portrait-test.jpg"),
  path.join(__dirname, "fixtures-cover-test.jpg"),
];

// Sujet volontairement collé à ce que MONTRENT les fixtures (un portrait, une
// image d'ambiance) : un sujet hors-photos déclenche le refus photo_mismatch.
const SUJET = "Qui je suis : le visage derrière la marque, mon univers et ce que je veux transmettre";

test("carrousel « Tes photos en fond » : plan, brouillons sur photo, texte sur le résultat", async ({ page, viewport }) => {
  const isMonday = new Date().getDay() === 1;
  test.skip(!isMonday && !process.env.FORCE_CAROUSEL_PHOTO, "lundi uniquement (coût ~1 crédit/semaine)");
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût réel)");
  test.setTimeout(900_000);

  // Le bug du 21/07 sortait en texte plein écran : on le guette explicitement.
  page.on("response", (res) => {
    if (res.url().includes("/functions/v1/")) {
      console.log(`⏱️ ${res.url().split("/functions/v1/")[1].split("?")[0]} → ${res.status()}`);
    }
  });

  // Attente vivante (08/10/2026) : étapes serveur horodatées + écran d'attente capturé.
  await tapCarouselSse(page);
  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  // Étape 1 : sujet
  const textarea = page.locator("#creation-idea").or(page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager|nouveauté|coulisses/i)).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(SUJET);
  await page.getByRole("button", { name: /^(suivant|continuer)$/i }).click();

  // Étape 2 : Instagram → Carrousel → « Tes photos en fond »
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const carrouselCard = page.getByText(/^Carrousel$/, { exact: true }).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();
  const fond = page.getByText(/Tes photos en fond/i).first();
  await expect(fond).toBeVisible({ timeout: 10000 });
  await fond.click();

  // Décrire les photos AVANT l'upload (la zone passe en compact ensuite) : sans
  // description, le choix final des photos refuse ces fixtures sans rapport
  // visible avec la savonnerie du compte test (vu le 08/10 : 6/6 « image à choisir »).
  const photoDesc = page.getByPlaceholder(/photos prises ce matin/i).first();
  if (await photoDesc.isVisible({ timeout: 5000 }).catch(() => false)) {
    await photoDesc.fill(
      "Photo 1 : moi, portrait de face — c'est le visage derrière la marque. " +
        "Photo 2 : un visuel d'ambiance de ma marque.",
    );
  }

  // Upload des 2 fixtures → 2 vignettes
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURES);
  await expect(page.locator('img[src^="blob:"], img[src^="data:"]').nth(1)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: path.join(SHOTS, "fond-1-upload.png") });

  // Dump OFF : on veut le parcours structure carousel-ai, pas photo-dump-plan
  const dumpToggle = page.getByRole("switch", { name: /Compléter en photo dump/i });
  if (await dumpToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    if ((await dumpToggle.getAttribute("aria-checked")) === "true") await dumpToggle.click();
    await expect(dumpToggle).toHaveAttribute("aria-checked", "false");
  }

  // Avancer jusqu'à la génération (mêmes garde-fous que photo-dump-live)
  for (let i = 0; i < 4; i++) {
    const suivant = page.getByRole("button", { name: /^(suivant|continuer)$/i }).first();
    await expect(suivant).toBeEnabled({ timeout: 8000 });
    await suivant.click();
    const onStep3 = await page
      .getByText(/Étape 3 sur 4/i)
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (onStep3) break;
  }

  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });
  await Promise.race([
    expect(genDir).toBeVisible({ timeout: 120000 }),
    expect(genBtn).toBeVisible({ timeout: 120000 }),
  ]).catch(() => {});
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();
  console.log("🚀 Générer cliqué");
  watchWaitingScreen(page, path.join(SHOTS, "fond-attente"));

  // Résultat OU erreur de validation : on course les deux, l'erreur = rouge net.
  // L'écran résultat #608 : le signal « génération finie » = le bouton « Publier
  // ou programmer » (data-testid, plus robuste que le texte), « ajouter au
  // calendrier » a disparu (même correctif que perf-carousel #612 côté main).
  const result = page.getByTestId("publish-or-schedule").first();
  const validationError = page.getByText(/Données invalides/i).first();
  // 3e issue : refus LÉGITIME de la garde de cohérence photo/idée (`carousel-ai`,
  // message figé, aucun crédit décompté). Sans ce concurrent, on patiente les
  // 13 min du timeout pour rien — vu sur le jumeau `carousel-mix-live` le 03/08.
  const coherenceRefusal = page
    .getByText(/ne semble(?:nt)? pas correspondre à ton idée/i)
    .first();
  // 4e issue : `empty_carousel` (carousel-ai, 200 structuré) — l'IA a rendu 0
  // slide sans motif photo. Le produit l'affiche proprement avec « Réessayer »
  // (aucun crédit) ; sans ce concurrent, 13 min de timeout pour rien (14/09).
  // UN seul réessai, comme une utilisatrice : deux vides d'affilée = rouge net.
  const emptyCarousel = page.getByText(/renvoyé un carrousel vide/i).first();
  for (let attempt = 1; ; attempt++) {
    await Promise.race([
      result.waitFor({ state: "visible", timeout: 780_000 }),
      validationError.waitFor({ state: "visible", timeout: 780_000 }),
      coherenceRefusal.waitFor({ state: "visible", timeout: 780_000 }),
      emptyCarousel.waitFor({ state: "visible", timeout: 780_000 }),
    ]);
    if (!(await emptyCarousel.isVisible().catch(() => false))) break;
    if (attempt >= 2) throw new Error("carousel-ai a renvoyé un carrousel VIDE deux fois de suite (empty_carousel)");
    console.log("🔁 carrousel vide (empty_carousel) — 1 réessai, comme une utilisatrice");
    await page.getByRole("button", { name: /réessayer/i }).first().click();
  }
  if (await coherenceRefusal.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "fond-REFUS-coherence.png"), fullPage: true });
    const raison = (await coherenceRefusal.textContent().catch(() => "")) ?? "";
    console.log(`⏭️ garde de cohérence photo/idée déclenchée : ${raison.slice(0, 220)}`);
    test.skip(
      true,
      "la garde de cohérence a refusé les photos de la bibliothèque : génération non exercée aujourd'hui",
    );
  }
  if (await validationError.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "fond-ERREUR-validation.png"), fullPage: true });
    throw new Error("Régression classe #594 : « Données invalides » à la génération du carrousel photo");
  }
  await expect(result).toBeVisible();

  // Le texte des slides est bien écrit, et on compte les photos posées.
  const textes = await page.locator("textarea").evaluateAll((els) =>
    els.map((e) => (e as HTMLTextAreaElement).value.trim()).filter(Boolean));
  const aChoisir = await page.getByText(/^Image à choisir$/).count();
  const posees = await page.locator('img[alt^="Photo "]').count();
  console.log(`📝 ${textes.length} champ(s) de texte rempli(s) ; 🖼️ ${posees} photo(s) posée(s), ${aChoisir} image(s) à choisir`);
  const alerte = page.getByText(/Ce carrousel est à compléter/i).first();
  if (await alerte.isVisible().catch(() => false)) {
    console.log(`⚠️ alerte affichée : ${((await alerte.locator("..").innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 900)}`);
  }
  await page.screenshot({ path: path.join(SHOTS, "fond-2-resultat.png"), timeout: 30000 });
  expect(textes.length, "aucun texte écrit pour les slides").toBeGreaterThanOrEqual(2);
  // Alerte « photo brute » sur des photos PRÉVUES avec texte (corrigé le 08/10).
  await expect(page.getByText(/photos? brutes? gard/i)).toHaveCount(0);

  // Toutes les photos posées → on fabrique les visuels et on REGARDE le texte sur photo.
  const creer = page.getByRole("button", { name: /Créer les visuels/i }).first();
  if (aChoisir === 0 && (await creer.isEnabled().catch(() => false))) {
    await creer.click();
    await page
      .waitForFunction(() => document.querySelectorAll("iframe, img[src^='data:'], img[src*='supabase']").length >= 2, { timeout: 180000 })
      .catch(() => console.log("⚠️ moins de 2 slides visuelles détectées"));
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SHOTS, "fond-3-visuels.png"), timeout: 30000 });
    console.log("🖼️ visuels créés : capture fond-3-visuels.png");
  } else {
    console.log("⏭️ visuels non créés : il reste des images à choisir");
  }
});
