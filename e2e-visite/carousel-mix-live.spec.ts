/**
 * Carrousel MIXTE réel (slides photo + slides texte design alternées) — génération
 * de bout en bout PUIS validation de l'export PPTX composé.
 *
 * Complète l'angle mort export du 22/07 : la sonde PPTX (Brique 3) ne couvrait que
 * le carrousel TEXTE, et la photo (carousel-photo-live). Le MIXTE mélange fonds
 * photo et slides design — même surface de bug « carré noir » / voile fusionné
 * (#607, #611) que la photo, avec en plus l'alternance des types de slide.
 *
 * Coût réel ~1-2 crédits → tourne le LUNDI (jour heavy) ou à la demande via
 * FORCE_CAROUSEL_MIX=1. Desktop uniquement (coût réel + export desktop).
 *
 * Parcours : /creer → sujet aligné sur les fixtures (gate photo_mismatch !) →
 * Instagram → Carrousel → « Photos + slides design » → fourche « J'ai déjà mes
 * photos » → upload 2 fixtures → générer → résultat → export PPTX validé.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { exportAndCheckPptx } from "./pptx-export-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/carousel-mix");
fs.mkdirSync(SHOTS, { recursive: true });

const FIXTURES = [
  path.join(__dirname, "fixtures-portrait-test.jpg"),
  path.join(__dirname, "fixtures-cover-test.jpg"),
];

// Sujet collé à ce que MONTRENT les fixtures (un portrait, une image d'ambiance) :
// un sujet hors-photos déclenche le refus photo_mismatch côté carousel-ai.
const SUJET = "Qui je suis : le visage derrière la marque, mon univers et ce que je veux transmettre";

test("carrousel mixte réel : upload → génération → export PPTX composé validé", async ({ page, viewport }) => {
  const isMonday = new Date().getDay() === 1;
  test.skip(!isMonday && !process.env.FORCE_CAROUSEL_MIX, "lundi uniquement (coût ~1-2 crédits/semaine)");
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût réel + export desktop)");
  test.setTimeout(900_000);

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

  // Étape 2 : Instagram → Carrousel → « Photos + slides design » (mixte)
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const carrouselCard = page.getByText(/^Carrousel$/, { exact: true }).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();
  const mixCard = page.getByText(/Photos \+ slides design/i).first();
  await expect(mixCard).toBeVisible({ timeout: 10000 });
  await mixCard.click();

  // Fourche du mixte : « J'ai déjà mes photos » (upload classique, pas texte-d'abord)
  const forkPhotos = page.getByText(/J'ai déjà mes photos/i).first();
  await expect(forkPhotos).toBeVisible({ timeout: 10000 });
  await forkPhotos.click();

  // Upload des 2 fixtures → 2 vignettes
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURES);
  await expect(page.locator('img[src^="blob:"], img[src^="data:"]').nth(1)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: path.join(SHOTS, "mix-1-upload.png") });

  // Avancer jusqu'à la génération (mêmes garde-fous que carousel-photo-live)
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
  console.log("🚀 Générer cliqué (mixte)");

  // Résultat OU erreur de validation : on course les deux. Signal « fini » =
  // « Publier ou programmer » (data-testid, écran résultat #608).
  const result = page.getByTestId("publish-or-schedule").first();
  const validationError = page.getByText(/Données invalides/i).first();
  await Promise.race([
    result.waitFor({ state: "visible", timeout: 780_000 }),
    validationError.waitFor({ state: "visible", timeout: 780_000 }),
  ]);
  if (await validationError.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "mix-ERREUR-validation.png"), fullPage: true });
    throw new Error("Régression classe #594 : « Données invalides » à la génération du carrousel mixte");
  }
  await expect(result).toBeVisible();

  await page
    .waitForFunction(
      () => document.querySelectorAll("iframe, img[src^='data:'], img[src*='supabase']").length >= 2,
      { timeout: 120000 },
    )
    .catch(() => console.log("⚠️ moins de 2 slides visuelles détectées"));
  await page.screenshot({ path: path.join(SHOTS, "mix-2-resultat.png"), fullPage: true });
  console.log("Carrousel mixte généré de bout en bout");

  // ── EXPORT PPTX composé (mixte) : Brique 3 ─────────────────────────────────
  // expectEditableText:true — le mixte porte de vraies slides « texte design »
  // (même rendu que le carrousel texte, qui exporte du natif) → le check ne
  // tombe QUE s'il n'y a AUCUN texte éditable, ce qui n'arrive pas ici. « photo
  // occultée » (inconditionnel) couvre le carré-noir des slides photo.
  // minSlides:2 = filet anti-effondrement (le vrai compte mixte se lira au 1er
  // run live du lundi ; à resserrer alors si utile).
  const report = await exportAndCheckPptx(page, __dirname, {
    format: "carrousel_mix",
    outName: "export-carousel-mix.pptx",
    shotName: "carousel-mix/export-pptx-fond-mix.png",
    validate: { minSlides: 2, expectEditableText: true, backgroundIsDecorative: true },
  });
  console.log(
    `✅ Export PPTX mixte validé : ${report.slideCount} slides, ${report.mediaCount} images, ` +
      `${report.problems.length} défaut(s).`,
  );
});
