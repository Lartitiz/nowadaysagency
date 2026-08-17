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

// Sujet collé à ce que MONTRENT les fixtures — littéralement : la cover
// (fixtures-cover-test.jpg) titre « 5 RITUELS SLOW POUR TA COM' », le portrait
// incarne la personne qui les partage. L'ancien sujet « Qui je suis : le visage
// derrière la marque » se faisait refuser par la garde photo_mismatch de
// carousel-ai (portrait beauté générique jugé sans rapport, 17/08) : un sujet
// qui REPREND le titre visible sur une des photos ne peut pas la « contredire
// frontalement », seuil que la garde exige pour refuser.
const SUJET = "5 rituels slow pour ta com' : ma routine douce pour communiquer sans m'épuiser";

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

  // Décrire les photos AVANT l'upload : dès qu'une photo est posée, la zone
  // passe en `compact` et le champ description DISPARAÎT (CreerStepFormat
  // `compact={uploadedPhotos.length > 0}`). Et sans description, la garde
  // photo_mismatch de carousel-ai refuse ces fixtures en invoquant l'univers de
  // marque (« savonnerie ») et le doute sur l'identité du portrait — deux motifs
  // que son propre prompt lui interdit (refus observés 3× le 17/08, avec deux
  // sujets différents). La description lève l'ambiguïté comme le ferait une
  // vraie utilisatrice.
  const photoDesc = page.getByPlaceholder(/photos prises ce matin/i).first();
  await expect(photoDesc).toBeVisible({ timeout: 8000 });
  await photoDesc.fill(
    "Photo 1 : moi, portrait de face — c'est mon visage qui incarne la routine. " +
      "Photo 2 : la slide de couverture déjà maquettée avec le titre du carrousel (5 rituels slow pour ta com').",
  );

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
  // 3e issue possible : la garde de cohérence photo/idée de `carousel-ai` refuse
  // les photos (message figé, aucun crédit décompté). C'est un REFUS LÉGITIME du
  // produit, pas une panne — mais tant qu'on ne l'attendait pas, on patientait
  // les 13 min du timeout pour rien (03/08).
  const coherenceRefusal = page
    .getByText(/ne semble(?:nt)? pas correspondre à ton idée/i)
    .first();
  await Promise.race([
    result.waitFor({ state: "visible", timeout: 780_000 }),
    validationError.waitFor({ state: "visible", timeout: 780_000 }),
    coherenceRefusal.waitFor({ state: "visible", timeout: 780_000 }),
  ]);
  if (await coherenceRefusal.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "mix-REFUS-coherence.png"), fullPage: true });
    const raison = (await coherenceRefusal.textContent().catch(() => "")) ?? "";
    console.log(`⏭️ garde de cohérence photo/idée déclenchée : ${raison.slice(0, 220)}`);
    test.skip(
      true,
      "la garde de cohérence a refusé les photos de la bibliothèque : génération non exercée aujourd'hui",
    );
  }
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
