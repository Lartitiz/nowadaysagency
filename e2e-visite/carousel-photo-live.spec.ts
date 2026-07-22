/**
 * Carrousel PHOTO réel (gabarits texte-sur-photo) — génération de bout en bout.
 *
 * Bouche l'angle mort du 21/07 : le parcours « photos uploadées → structure
 * carousel-ai (narrative_thread) → écriture → gabarits » n'avait AUCUN test
 * avec vraie génération (perf-carousel = Texte design sans fil narratif,
 * photo-dump-live = dump via photo-dump-plan, fil déjà borné à 160).
 *
 * Coût réel ~1 crédit → tourne le LUNDI uniquement (jour du mode heavy),
 * ou à la demande via FORCE_CAROUSEL_PHOTO=1.
 *
 * Parcours : /creer → sujet aligné sur les fixtures (gate photo_mismatch !) →
 * Instagram → Carrousel → « Photos brutes » → upload 2 fixtures → dump OFF →
 * générer → résultat avec slides visuelles, sans « Données invalides ».
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { exportAndCheckPptx } from "./pptx-export-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/carousel-photo");
fs.mkdirSync(SHOTS, { recursive: true });

const FIXTURES = [
  path.join(__dirname, "fixtures-portrait-test.jpg"),
  path.join(__dirname, "fixtures-cover-test.jpg"),
];

// Sujet volontairement collé à ce que MONTRENT les fixtures (un portrait, une
// image d'ambiance) : un sujet hors-photos déclenche le refus photo_mismatch.
const SUJET = "Qui je suis : le visage derrière la marque, mon univers et ce que je veux transmettre";

test("carrousel photo réel : upload → génération → slides sans erreur de validation", async ({ page, viewport }) => {
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

  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  // Étape 1 : sujet
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(SUJET);
  await page.getByRole("button", { name: /suivant/i }).click();

  // Étape 2 : Instagram → Carrousel → « Photos brutes »
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const carrouselCard = page.getByText(/^Carrousel$/, { exact: true }).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();
  const brutes = page.getByText(/Photos brutes/i).first();
  await expect(brutes).toBeVisible({ timeout: 10000 });
  await brutes.click();

  // Upload des 2 fixtures → 2 vignettes
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURES);
  await expect(page.locator('img[src^="blob:"], img[src^="data:"]').nth(1)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: path.join(SHOTS, "photo-1-upload.png") });

  // Dump OFF : on veut le parcours structure carousel-ai, pas photo-dump-plan
  const dumpToggle = page.getByRole("switch", { name: /Compléter en photo dump/i });
  if (await dumpToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    if ((await dumpToggle.getAttribute("aria-checked")) === "true") await dumpToggle.click();
    await expect(dumpToggle).toHaveAttribute("aria-checked", "false");
  }

  // Avancer jusqu'à la génération (mêmes garde-fous que photo-dump-live)
  for (let i = 0; i < 4; i++) {
    const suivant = page.getByRole("button", { name: /suivant/i }).first();
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

  // Résultat OU erreur de validation : on course les deux, l'erreur = rouge net.
  // L'écran résultat #608 : le signal « génération finie » = le bouton « Publier
  // ou programmer » (data-testid), plus « ajouter au calendrier » (déplacé).
  const result = page.getByTestId("publish-or-schedule").first();
  const validationError = page.getByText(/Données invalides/i).first();
  await Promise.race([
    result.waitFor({ state: "visible", timeout: 780_000 }),
    validationError.waitFor({ state: "visible", timeout: 780_000 }),
  ]);
  if (await validationError.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "photo-ERREUR-validation.png"), fullPage: true });
    throw new Error("Régression classe #594 : « Données invalides » à la génération du carrousel photo");
  }
  await expect(result).toBeVisible();

  // Des slides visuelles existent (gabarits posés sur les photos)
  await page
    .waitForFunction(
      () => document.querySelectorAll("iframe, img[src^='data:'], img[src*='supabase']").length >= 2,
      { timeout: 120000 },
    )
    .catch(() => console.log("⚠️ moins de 2 slides visuelles détectées"));
  await page.screenshot({ path: path.join(SHOTS, "photo-2-resultat.png"), fullPage: true });
  console.log("Carrousel photo généré de bout en bout");

  // ── EXPORT PPTX composé (photo + gabarits texte-sur-photo) : Brique 3 ────────
  // Le vrai angle mort : la sonde export ne couvrait que le carrousel TEXTE, alors
  // que les bugs « carré noir » / voile (#607, #611) vivent sur l'export PHOTO
  // composé. On réutilise le carrousel qui vient d'être généré (zéro crédit) et on
  // valide son PowerPoint éditable — `validatePptx` porte déjà le test « photo
  // occultée » (couche opaque plein écran par-dessus une photo). Historisé en
  // `carrousel_photo` → le bilan hebdo couvre enfin ce format.
  // expectEditableText:false — en mode photo le texte peut être rastérisé sur le
  // gabarit ; on ne veut pas de faux rouge « calque texte perdu » (à resserrer si
  // la vérif live montre du texte natif). backgroundIsDecorative:true — une photo
  // pleine est un fond légitime, jamais un « fond raté ».
  const report = await exportAndCheckPptx(page, __dirname, {
    format: "carrousel_photo",
    outName: "export-carousel-photo.pptx",
    shotName: "carousel-photo/export-pptx-fond-photo.png",
    // 2 fixtures, dump OFF → 2 slides photo (vérifié live 22/07). minSlides:2 = un
    // filet anti-« carrousel effondré à 1 slide » sans faux rouge. expectEditableText
    // false : en photo brute le texte est rastérisé (0 run natif, constat live).
    validate: { minSlides: 2, expectEditableText: false, backgroundIsDecorative: true },
  });
  console.log(
    `✅ Export PPTX photo validé : ${report.slideCount} slides, ${report.mediaCount} images, ` +
      `${report.problems.length} défaut(s).`,
  );
});
