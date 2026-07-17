/**
 * Feedback de génération Pinterest « Visuel » (bug vu au test du 17/07) :
 * quand l'edge pinterest-visual répond SANS pin_html (JSON tronqué côté
 * modèle), l'aperçu restait bloqué sur « Génération en cours... » à l'infini
 * alors que titre/description étaient déjà rendus dessous. Attendu désormais :
 * état honnête (« n'a pas pu être créé ») + bouton Réessayer.
 *
 * Les réponses de l'edge sont MOCKÉES (route interceptée) → zéro crédit
 * consommé, résultat déterministe. Seul l'appel questions (creative-flow)
 * part réellement, comme dans fonctionnel-t1.
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/repro-pinterest");
fs.mkdirSync(SHOTS, { recursive: true });

const IDEA = "3 idées reçues sur le savon artisanal (et pourquoi elles sont fausses)";

async function driveToGeneration(page: Page) {
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(IDEA);
  await page.getByRole("button", { name: /suivant/i }).click();

  const pinterestCard = page.getByText("Pinterest", { exact: true }).first();
  await expect(pinterestCard).toBeVisible({ timeout: 8000 });
  await pinterestCard.click();

  const visuel = page.getByText("Visuel", { exact: true }).first();
  await expect(visuel).toBeVisible({ timeout: 8000 });
  await visuel.click();

  const suivant = page.getByRole("button", { name: /suivant/i });
  await expect(suivant).toBeVisible({ timeout: 5000 });
  await suivant.click();

  const generateDirect = page.getByRole("button", { name: /générer directement|générer/i }).first();
  await expect(generateDirect).toBeVisible({ timeout: 60_000 });
  await generateDirect.click();
}

test("edge répond sans pin_html → que montre la page ?", async ({ page }) => {
  test.setTimeout(180_000);

  await page.route("**/functions/v1/pinterest-visual", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          title: "Savon artisanal : 3 idées reçues qui ont la peau dure",
          description:
            "On croit souvent que le savon artisanal est cher, gras ou peu hygiénique. Voici pourquoi ces 3 idées reçues sont fausses, et comment choisir un vrai savon saponifié à froid. #savonartisanal #cosmetiquenaturelle",
          pin_data: {
            background: { color: "#FDF6F0" },
            elements: [
              { type: "text", content: "3 idées reçues sur le savon artisanal", x: 60, y: 120, w: 880, h: 200, font_size: 64 },
            ],
          },
          // pin_html ABSENT : simulateur de JSON tronqué
        },
      }),
    });
  });

  await driveToGeneration(page);

  // Résultat attendu APRÈS correctif : titre/description affichés, PAS de faux
  // « Génération en cours... », état honnête + bouton Réessayer à la place.
  await expect(page.locator("input[readonly]").first()).toHaveValue(/idées reçues qui ont la peau dure/, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByText("Génération en cours")).toHaveCount(0);
  await expect(page.getByText("Le visuel n'a pas pu être créé cette fois.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Réessayer \(1 crédit\)/ })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "fix-sans-pinhtml.png"), fullPage: true });

  // Le bouton Réessayer relance bien une génération (on vérifie juste le départ
  // d'un nouvel appel : la route mockée le capture).
  let retried = false;
  page.on("request", (r) => {
    if (r.url().includes("/functions/v1/pinterest-visual")) retried = true;
  });
  await page.getByRole("button", { name: /Réessayer \(1 crédit\)/ }).click();
  await page.waitForTimeout(2000);
  expect(retried).toBe(true);
  await page.screenshot({ path: path.join(SHOTS, "fix-retry-relance.png"), fullPage: true });
});

test("edge répond AVEC pin_html → aperçu iframe + célébration intacts", async ({ page }) => {
  test.setTimeout(180_000);

  await page.route("**/functions/v1/pinterest-visual", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          title: "Savon artisanal : 3 idées reçues qui ont la peau dure",
          description: "Pourquoi ces 3 idées reçues sont fausses. #savonartisanal",
          pin_html:
            '<div style="width:1000px;height:1500px;background:#FDF6F0;display:flex;align-items:center;justify-content:center"><h1 style="font-size:64px;color:#7A2E2E">3 idées reçues sur le savon artisanal</h1></div>',
        },
      }),
    });
  });

  await driveToGeneration(page);

  await expect(page.getByText("Ton épingle est prête")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('iframe[title="Épingle visuelle Pinterest"]')).toBeVisible();
  await expect(page.getByText("Génération en cours")).toHaveCount(0);
  await expect(page.getByText("n'a pas pu être créé")).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "fix-avec-pinhtml.png"), fullPage: true });
});
