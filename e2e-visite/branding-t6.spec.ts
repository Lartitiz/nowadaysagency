/**
 * T6 — Import de marque + Review
 *
 * Parcours : /branding → saisir une URL → "Analyse mon projet ✨"
 *            → analyze-brand (intercepté) → BrandingReview
 *
 * Stratégie :
 * - analyze-brand est intercepté pour rester rapide et déterministe.
 * - T6a : happy path — la BrandingReview s'affiche avec les sections.
 * - T6b : erreur réseau — le message "Oups" apparaît, sans crash.
 * - T6c : vérification initiale — la page /branding charge et montre
 *         la section d'import pour un compte sans branding.
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/t6");
fs.mkdirSync(SHOTS, { recursive: true });

const MOCK_ANALYSIS = {
  story: "Céramiste passionnée, Camille crée des pièces uniques faites à la main.",
  persona: "Amatrices d'artisanat, femmes 25-45 ans sensibles au fait-main.",
  value_proposition: "Des céramiques artisanales qui portent la trace de la main.",
  tone_style: "Chaleureux, authentique, ancré dans le geste.",
  content_strategy: "Instagram en priorité, 3x/semaine, photos atelier + coulisses.",
  offers: "Pièces à l'unité + ateliers de poterie.",
  charter: "Couleurs terre, fond neutre, lumière naturelle.",
  sources_used: ["https://camille-ceramique.fr"],
  sources_failed: [],
};

// ── T6c : état initial ────────────────────────────────────────────────────────

test("T6c — /branding charge et affiche la section d'import", async ({ page }) => {
  await page.goto("/branding", { waitUntil: "networkidle" });

  // La page doit charger sans erreur
  await expect(page.getByText(/dis-moi où te trouver|identité de marque|branding/i).first())
    .toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: path.join(SHOTS, "t6c-branding-initial.png"), fullPage: true });
  console.log("✅ T6c — /branding chargé");
});

// ── T6a : happy path (analyze-brand intercepté) ────────────────────────────────

test("T6a — Import URL → BrandingReview s'affiche", async ({ page }) => {
  // Intercepter l'appel analyze-brand pour renvoyer un résultat mock immédiat
  await page.route(/\/functions\/v1\/analyze-brand/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ANALYSIS),
    });
  });

  await page.goto("/branding", { waitUntil: "networkidle" });

  // Attendre la section d'import
  const urlInput = page.getByPlaceholder(/https:\/\/monsite\.com/i);
  await expect(urlInput).toBeVisible({ timeout: 10000 });

  // Saisir une URL
  await urlInput.fill("https://camille-ceramique.fr");

  // Cliquer "Analyse mon projet ✨"
  const analyseBtn = page.getByRole("button", { name: /analyse mon projet|analyser/i });
  await expect(analyseBtn).toBeVisible({ timeout: 3000 });
  await analyseBtn.click();

  // BrandingAnalysisLoader joue une animation (~15-45s) même si le mock
  // répond immédiatement — attendre d'abord le loader, puis la BrandingReview.
  await expect(page.getByText(/comprends|analyse|voix|café/i).first())
    .toBeVisible({ timeout: 10000 });

  // La BrandingReview s'affiche après l'animation (texte du mock OU sections)
  await expect(
    page.getByText(/Céramiste passionnée|résultat|enregistrer|sauvegarder|ajuster|ton branding/i).first()
  ).toBeVisible({ timeout: 60000 });

  await page.screenshot({ path: path.join(SHOTS, "t6a-branding-review.png"), fullPage: true });
  console.log("✅ T6a — BrandingReview affichée après import mock");
});

// ── T6b : erreur réseau → dégradation propre ─────────────────────────────────

test("T6b — Erreur analyze-brand → message Oups sans crash", async ({ page }) => {
  // Simuler une erreur côté serveur
  await page.route(/\/functions\/v1\/analyze-brand/, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Internal server error" }),
    });
  });

  await page.goto("/branding", { waitUntil: "networkidle" });

  const urlInput = page.getByPlaceholder(/https:\/\/monsite\.com/i);
  await expect(urlInput).toBeVisible({ timeout: 10000 });
  await urlInput.fill("https://site-inexistant.fr");

  const analyseBtn = page.getByRole("button", { name: /analyse mon projet|analyser/i });
  await expect(analyseBtn).toBeVisible({ timeout: 3000 });
  await analyseBtn.click();

  // Le message d'erreur doit apparaître — pas un crash JS
  await expect(
    page.getByText(/oups|du mal à analyser|réessayer|erreur/i).first()
  ).toBeVisible({ timeout: 15000 });

  // Vérifier que la page n'est pas cassée (le bouton Réessayer doit exister)
  const retryBtn = page.getByRole("button", { name: /réessayer|retour/i });
  await expect(retryBtn).toBeVisible({ timeout: 3000 });

  await page.screenshot({ path: path.join(SHOTS, "t6b-branding-erreur.png"), fullPage: true });
  console.log("✅ T6b — Dégradation propre (message Oups + bouton Réessayer)");
});
