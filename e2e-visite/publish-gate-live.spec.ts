/**
 * RE-TEST LIVE — fix #580 (17/07) : le bouton « Publier sur Instagram » ne doit
 * s'afficher QUE pour un contenu du canal Instagram.
 *
 * Trois parcours sur le site publié, génération MOCKÉE par interception réseau
 * (zéro crédit consommé) :
 *  1. Post LinkedIn   → bouton LinkedIn visible, bouton Instagram ABSENT.
 *  2. Post Instagram  → bouton Instagram visible (contrôle anti-sur-masquage).
 *  3. Épingle Pinterest visuelle → aucun des deux boutons.
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/publish-gate");
fs.mkdirSync(SHOTS, { recursive: true });

const IDEA = "3 idées reçues sur le savon artisanal (et pourquoi elles sont fausses)";

async function startFlow(page: Page) {
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(IDEA);
  await page.getByRole("button", { name: /suivant/i }).click();
}

async function generateDirect(page: Page) {
  const btn = page.getByRole("button", { name: /générer directement|générer/i }).first();
  await expect(btn).toBeVisible({ timeout: 60_000 });
  await btn.click();
}

/** Attend l'écran résultat : le titre « prêt » ou la zone d'actions. */
async function waitResult(page: Page) {
  await expect(
    page.getByText(/est prêt|sont prêtes|prête[s]? !|Ton contenu/i).first(),
  ).toBeVisible({ timeout: 60_000 });
  // Laisse le rendu se poser (boutons d'action montés après le contenu).
  await page.waitForTimeout(2500);
}

const igButton = (page: Page) => page.getByRole("button", { name: /Publier sur Instagram/i });
const liButton = (page: Page) => page.getByRole("button", { name: /Publier sur LinkedIn/i });

test("post LinkedIn : bouton LinkedIn, PAS de bouton Instagram", async ({ page }) => {
  test.setTimeout(180_000);

  await page.route("**/functions/v1/creative-flow", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content:
          "On croit souvent que le savon artisanal coûte cher.\n\nAprès 5 ans en savonnerie, voici ce que j'ai appris : un savon saponifié à froid dure deux fois plus longtemps.\n\nEt vous, vous en utilisez déjà ?",
      }),
    });
  });

  await startFlow(page);
  const liCard = page.getByRole("button", { name: /LinkedIn Post ou carrousel/i });
  await expect(liCard).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(800);
  await liCard.click({ force: true });
  await page.getByRole("button", { name: /Post 1300/ }).click();
  const suivant = page.getByRole("button", { name: /suivant/i });
  if (await suivant.isVisible({ timeout: 3000 }).catch(() => false)) await suivant.click();
  await generateDirect(page);
  await waitResult(page);

  await page.screenshot({ path: path.join(SHOTS, "linkedin-post.png"), fullPage: true });
  await expect(liButton(page).first()).toBeVisible({ timeout: 15_000 });
  await liButton(page).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "linkedin-post-bouton.png") });
  await expect(igButton(page)).toHaveCount(0);
});

test("post Instagram : bouton Instagram toujours là (contrôle)", async ({ page }) => {
  test.setTimeout(180_000);

  await page.route("**/functions/v1/creative-flow", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: "Le savon artisanal, ce n'est pas un luxe.",
        caption: "Le savon artisanal, ce n'est pas un luxe. #savonartisanal",
      }),
    });
  });

  await startFlow(page);
  await page.getByRole("button", { name: /Instagram Carrousel, Reel, Story, Post/i }).click();
  await page.getByRole("button", { name: /Post/ }).filter({ hasNotText: /carrousel|reel|story/i }).first().click();
  const suivant = page.getByRole("button", { name: /suivant/i });
  if (await suivant.isVisible({ timeout: 3000 }).catch(() => false)) await suivant.click();
  await generateDirect(page);
  await waitResult(page);

  await page.screenshot({ path: path.join(SHOTS, "instagram-post.png"), fullPage: true });
  await expect(igButton(page).first()).toBeVisible({ timeout: 15_000 });
});

test("épingle Pinterest visuelle : aucun bouton Instagram/LinkedIn", async ({ page }) => {
  test.setTimeout(180_000);

  await page.route("**/functions/v1/pinterest-visual", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          title: "Savon artisanal : 3 idées reçues qui ont la peau dure",
          description: "Pourquoi ces 3 idées reçues sont fausses. #savonartisanal",
          pin_html:
            '<div style="width:1000px;height:1500px;background:#FDF6F0;display:flex;align-items:center;justify-content:center;font-size:64px">3 idées reçues sur le savon artisanal</div>',
        },
      }),
    });
  });

  await startFlow(page);
  await page.getByText("Pinterest", { exact: true }).first().click();
  await page.getByText("Visuel", { exact: true }).first().click();
  const suivant = page.getByRole("button", { name: /suivant/i });
  if (await suivant.isVisible({ timeout: 3000 }).catch(() => false)) await suivant.click();
  await generateDirect(page);
  await waitResult(page);

  await page.screenshot({ path: path.join(SHOTS, "pinterest-visuel.png"), fullPage: true });
  await expect(igButton(page)).toHaveCount(0);
  await expect(liButton(page)).toHaveCount(0);
});
