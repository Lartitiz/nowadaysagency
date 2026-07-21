/**
 * GATE CANAL DE PUBLICATION (né avec le fix #580, adapté au panneau « ultra-minimal ») :
 * la publication directe ne doit être proposée QUE pour le bon canal.
 *
 * Depuis la refonte « Publier ou programmer », le gate vit DANS la fenêtre de
 * publication : les options « Maintenant » / « Programmer » n'apparaissent que
 * pour un canal publiable (Instagram, ou LinkedIn texte), avec le bon réseau.
 *
 * Trois parcours sur le site publié, génération MOCKÉE par interception réseau
 * (zéro crédit consommé) :
 *  1. Post LinkedIn   → option « Maintenant » = LinkedIn, PAS Instagram.
 *  2. Post Instagram  → option « Maintenant » = Instagram (contrôle anti-sur-masquage).
 *  3. Épingle Pinterest visuelle → NI Maintenant NI Programmer (brouillon seulement).
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

const publishEntry = (page: Page) => page.getByTestId("publish-or-schedule").first();
const nowOption = (page: Page) => page.getByTestId("publish-now-option");
const scheduleOption = (page: Page) => page.getByTestId("publish-schedule-option");
const draftOption = (page: Page) => page.getByTestId("publish-draft-option");

/** Ouvre la fenêtre « Publier ou programmer » depuis l'écran résultat. */
async function openPublishDialog(page: Page) {
  await expect(publishEntry(page)).toBeVisible({ timeout: 15_000 });
  await publishEntry(page).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await publishEntry(page).click();
  // L'option brouillon est TOUJOURS présente : c'est le témoin d'ouverture.
  await expect(draftOption(page)).toBeVisible({ timeout: 5000 });
}

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
  await openPublishDialog(page);
  await page.screenshot({ path: path.join(SHOTS, "linkedin-post-dialog.png") });
  // Canal LinkedIn : « Maintenant » parle de LinkedIn, jamais d'Instagram.
  await expect(nowOption(page)).toBeVisible();
  await expect(nowOption(page)).toContainText(/LinkedIn/i);
  await expect(nowOption(page)).not.toContainText(/Instagram/i);
});

test("post Instagram : option Instagram toujours là (contrôle)", async ({ page }) => {
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
  await openPublishDialog(page);
  await page.screenshot({ path: path.join(SHOTS, "instagram-post-dialog.png") });
  await expect(nowOption(page)).toBeVisible();
  await expect(nowOption(page)).toContainText(/Instagram/i);
});

test("épingle Pinterest visuelle : ni Maintenant ni Programmer", async ({ page }) => {
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
  await openPublishDialog(page);
  await page.screenshot({ path: path.join(SHOTS, "pinterest-visuel-dialog.png") });
  // Pas de canal publiable → seule l'option brouillon calendrier est proposée.
  await expect(nowOption(page)).toHaveCount(0);
  await expect(scheduleOption(page)).toHaveCount(0);
});
