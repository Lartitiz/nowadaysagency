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

// Même forme que la réponse RÉELLE de l'edge analyze-brand : `{ success, analysis }`
// avec des sections OBJETS (cf. AnalysisResult dans BrandingReview.tsx).
// ⚠️ handleStartAnalysis jette si `result.success` est falsy → un mock « à plat »
// envoie la page sur l'écran d'erreur au lieu de la BrandingReview.
const MOCK_ANALYSIS = {
  story: {
    confidence: "high",
    full_story: "Céramiste passionnée, Camille crée des pièces uniques faites à la main.",
  },
  persona: {
    confidence: "high",
    description: "Amatrices d'artisanat, femmes 25-45 ans sensibles au fait-main.",
  },
  value_proposition: {
    confidence: "high",
    key_phrase: "Des céramiques artisanales qui portent la trace de la main.",
  },
  tone_style: {
    confidence: "medium",
    voice_description: "Chaleureux, authentique, ancré dans le geste.",
    tone_keywords: ["chaleureux", "authentique"],
  },
  content_strategy: {
    confidence: "medium",
    editorial_line: "Instagram en priorité, 3x/semaine, photos atelier + coulisses.",
    pillars: ["Coulisses d'atelier", "Fait-main", "Vie de céramiste"],
  },
  offers: {
    confidence: "medium",
    offers: [{ name: "Pièces à l'unité", description: "Céramiques uniques faites main." }],
  },
  charter: {
    confidence: "low",
    visual_style_description: "Couleurs terre, fond neutre, lumière naturelle.",
  },
  sources_used: ["https://camille-ceramique.fr"],
  sources_failed: [],
  overall_confidence: "medium",
};

const MOCK_EDGE_RESPONSE = { success: true, analysis: MOCK_ANALYSIS };

// ── T6c : état initial ────────────────────────────────────────────────────────

test("T6c — /branding charge et affiche la section d'import", async ({ page }) => {
  await page.goto("/branding", { waitUntil: "networkidle" });

  // La page doit charger sans erreur
  await expect(page.getByText(/dis-moi où te trouver|identité de marque|branding/i).first())
    .toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: path.join(SHOTS, "t6c-branding-initial.png"), fullPage: true });
  console.log("✅ T6c — /branding chargé");
});

// ── Helpers : environnement déterministe ──────────────────────────────────────

// L'analyse persiste une ligne `branding_autofill` en statut pending_review :
// au prochain chargement, /branding REPREND la review en cours (sans issue tant
// que les 7 sections ne sont pas validées) et n'affiche plus jamais l'import.
// On neutralise cette persistance côté test : les lectures renvoient « rien »
// (pas de reprise) et les écritures n'atteignent pas la base (pas de pollution
// du compte Camille par les données mock).
async function neutralizeAutofillPersistence(page: Page) {
  await page.route(/\/rest\/v1\/branding_autofill/, async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
  });
}

// Un compte avec ≥ 2 sections branding remplies n'affiche PLUS la section
// d'import à l'arrivée sur /branding (il montre la fiche d'identité) : dans ce
// cas on passe par le bouton « Réanalyser » de la fiche. Rend le test
// déterministe quel que soit l'état du compte.
async function openImportForm(page: Page) {
  await neutralizeAutofillPersistence(page);
  await page.goto("/branding", { waitUntil: "networkidle" });
  const urlInput = page.getByPlaceholder(/https:\/\/monsite\.com/i);
  try {
    await expect(urlInput).toBeVisible({ timeout: 5000 });
  } catch {
    const reanalyzeBtn = page.getByRole("button", { name: /réanalyser/i });
    await expect(reanalyzeBtn).toBeVisible({ timeout: 10000 });
    await reanalyzeBtn.click();
    await expect(urlInput).toBeVisible({ timeout: 10000 });
  }
  return urlInput;
}

// ── T6a : happy path (analyze-brand intercepté) ────────────────────────────────

test("T6a — Import URL → BrandingReview s'affiche", async ({ page }) => {
  // Intercepter l'appel analyze-brand pour renvoyer un résultat mock immédiat
  await page.route(/\/functions\/v1\/analyze-brand/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_EDGE_RESPONSE),
    });
  });

  const urlInput = await openImportForm(page);

  // Saisir une URL
  await urlInput.fill("https://camille-ceramique.fr");

  // Cliquer "Analyse mon projet ✨"
  const analyseBtn = page.getByRole("button", { name: /analyse mon projet|analyser/i });
  await expect(analyseBtn).toBeVisible({ timeout: 3000 });
  await analyseBtn.click();

  // La BrandingReview (flux section par section) s'affiche après l'animation
  // du loader. En-tête stable : « Voici ce que j'ai compris de ton projet ».
  await expect(
    page.getByText(/Voici ce que j'ai compris|sections validées/i).first()
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

  const urlInput = await openImportForm(page);
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
