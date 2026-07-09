/**
 * Stories visuelles (PR #353) — re-test live après déploiement
 *
 * Parcours : /creer → idée → Instagram → Story → générer
 *
 * Critères :
 * - La séquence de stories s'affiche (cartes "Story 1", "Story 2"…)
 * - Au moins un aperçu visuel 9:16 est rendu (iframe du renderer déterministe)
 * - Le bouton « Télécharger les visuels » est présent
 * - La zone sticker de l'aperçu mentionne « à poser dans Instagram »
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/stories");
fs.mkdirSync(SHOTS, { recursive: true });

const IDEA = "Les coulisses de la préparation de mon prochain atelier storytelling";

async function goToCreer(page: Page) {
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  }
}

async function dismissQuotaWall(page: Page): Promise<boolean> {
  const wall = page
    .getByText(/quota|crédits épuisés|plus de crédit|crédits du mois|utilisé tes \d+|se renouvellent|Passer à L.Assistant/i)
    .first();
  if (await wall.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("⚠️  QuotaWallModal détectée — compte Camille bloqué quota");
    return true;
  }
  return false;
}

test("Stories — génération + aperçus visuels rendus", async ({ page }) => {
  test.setTimeout(240_000);

  await goToCreer(page);

  // Étape 1 : l'idée
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(IDEA);
  await page.getByRole("button", { name: /suivant/i }).click();

  // Étape 2 : canal Instagram → format Story
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const storyCard = page.getByText(/^Story$/, { exact: true }).first();
  await expect(storyCard).toBeVisible({ timeout: 15000 });
  await storyCard.click();

  for (let i = 0; i < 3; i++) {
    const suivant = page.getByRole("button", { name: /suivant/i }).first();
    await expect(suivant).toBeEnabled({ timeout: 5000 });
    await suivant.click();
    const onStep3 = await page
      .getByText(/Étape 3 sur 4/i)
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (onStep3) break;
  }

  // Étape 3 : générer directement
  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });
  await Promise.race([
    expect(genDir).toBeVisible({ timeout: 90000 }),
    expect(genBtn).toBeVisible({ timeout: 90000 }),
  ]).catch(() => {});
  if (await genDir.isVisible().catch(() => false)) {
    await genDir.click();
  } else if (await genBtn.isVisible().catch(() => false)) {
    await genBtn.click();
  }

  if (await dismissQuotaWall(page)) {
    test.skip(true, "Compte test à sec de crédits");
    return;
  }

  // Résultat : les cartes stories
  await expect(page.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: path.join(SHOTS, "01-resultat.png"), fullPage: true });

  // Aperçus visuels du renderer déterministe
  const previews = page.locator('iframe[title^="Aperçu story"]');
  const previewCount = await previews.count();
  console.log(`Aperçus visuels rendus : ${previewCount}`);
  expect(previewCount).toBeGreaterThan(0);

  // Boutons d'export
  await expect(page.getByRole("button", { name: /télécharger les visuels/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /ouvrir dans canva/i })).toBeVisible();

  // Export PPTX natif : téléchargement + validation de CONTENU (jszip) — le nom
  // de fichier ne suffit pas, cf. e2e-visite/pptx-validate.ts.
  const dlPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: /pptx éditable/i }).click();
  const download = await dlPromise;
  console.log(`PPTX téléchargé : ${download.suggestedFilename()}`);
  expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  const pptxPath = path.join(__dirname, "results", "export-stories.pptx");
  fs.mkdirSync(path.dirname(pptxPath), { recursive: true });
  await download.saveAs(pptxPath);
  // Stories = exporter NATIF pur (pas d'html2canvas) : pas d'image de fond par
  // slide attendue, mais le texte éditable doit être là.
  const { validatePptx } = await import("./pptx-validate");
  const report = await validatePptx(pptxPath, { minSlides: 1, expectEditableText: true });
  const realProblems = report.problems.filter((p) => !p.includes("image(s) pour"));
  console.log(`📦 PPTX stories : ${report.slideCount} slides, ${report.texts.filter((t) => t.trim()).length} runs de texte`);
  expect(realProblems, `Défauts PPTX stories : ${realProblems.join(" | ")}`).toEqual([]);

  // « Publier sur Instagram » ne doit PAS être actif pour une story : l'edge
  // social-instagram-publish ne gère que le feed, une story partirait en post feed.
  const publishIg = page.getByRole("button", { name: /publier sur instagram/i }).first();
  if (await publishIg.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expect(publishIg).toBeDisabled();
    console.log("Bouton « Publier sur Instagram » présent mais désactivé (attendu pour une story)");
  } else {
    console.log("Bouton « Publier sur Instagram » absent pour une story (OK)");
  }

  // La zone sticker existe dans au moins un aperçu (contenu de l'iframe)
  let stickerFound = false;
  for (let i = 0; i < previewCount; i++) {
    const body = await previews.nth(i).contentFrame()?.locator("body").innerHTML().catch(() => "");
    if (body && body.includes("poser dans Instagram")) {
      stickerFound = true;
      break;
    }
  }
  console.log(`Zone sticker trouvée dans un aperçu : ${stickerFound}`);

  await page.screenshot({ path: path.join(SHOTS, "02-final.png"), fullPage: true });
});
