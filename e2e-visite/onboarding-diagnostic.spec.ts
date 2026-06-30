/**
 * T5 — DiagnosticLoading (step 11)
 *
 * Vérifie que le loader "J'analyse ta communication..." apparaît dans < 500 ms
 * après le clic sur "voir mon diagnostic" (fin étape 10).
 *
 * Régression PR #267 : DiagnosticLoading était rendu DANS l'AnimatePresence
 * mode="wait" → l'animation de sortie de l'étape 10 suspendait son montage
 * → écran blanc jusqu'à ~25 s.
 *
 * Stratégie :
 * - Supabase profiles / user_plan_config → intercept GET pour renvoyer
 *   onboarding_completed: false (empêche la redirection vers /dashboard).
 * - localStorage pré-rempli au step 10 avec des réponses minimales valides.
 * - deep-diagnostic edge fn → mock rapide (évite d'attendre 60 s en live).
 * - On mesure le délai entre le clic et l'apparition du texte du loader.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots");

const MINIMAL_ANSWERS = {
  prenom: "Camille",
  activite: "Céramiste",
  activity_type: "art_design",
  activity_detail: "",
  canaux: ["instagram"],
  desired_channels: [],
  blocage: "manque_temps",
  objectif: "visibility",
  temps: "1h",
  instagram: "",
  website: "",
  linkedin: "",
  linkedin_summary: "",
  change_priority: "",
  product_or_service: "products",
  uniqueness: "",
};

const MOCK_DIAGNOSTIC = {
  insights: "Diagnostic de test.",
  strengths: ["Ton activité est claire."],
  priorities: ["Travailler ta présence Instagram."],
  branding_seeds: { positioning: "Test", tone: "Direct" },
  sources_used: [],
  sources_failed: [],
};

test("T5 — DiagnosticLoading s'affiche en < 500 ms après l'étape 10", async ({ page }) => {
  // ── Intercepts ──────────────────────────────────────────────────────────
  // Profiles GET : renvoie onboarding_completed: false pour bloquer la
  // redirection vers /dashboard.
  await page.route(/\/rest\/v1\/profiles\?/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.pgrst.object+json",
        body: JSON.stringify({ onboarding_completed: false }),
      });
    } else {
      await route.continue();
    }
  });

  // user_plan_config GET : même traitement.
  await page.route(/\/rest\/v1\/user_plan_config\?/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.pgrst.object+json",
        body: JSON.stringify({ onboarding_completed: false }),
      });
    } else {
      await route.continue();
    }
  });

  // deep-diagnostic : mock rapide pour ne pas attendre 60 s.
  await page.route(/\/functions\/v1\/deep-diagnostic/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DIAGNOSTIC),
    });
  });

  // ── Pré-remplissage localStorage → step 10 ───────────────────────────
  await page.goto("/onboarding", { waitUntil: "commit" });

  await page.evaluate(({ answers, ts }) => {
    localStorage.setItem("lac_onboarding_step", "10");
    localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers));
    localStorage.setItem("lac_onboarding_ts", ts);
  }, { answers: MINIMAL_ANSWERS, ts: new Date().toISOString() });

  // Reload pour que le hook restaure depuis localStorage.
  await page.reload({ waitUntil: "networkidle" });

  // ── Vérification que l'on est bien à l'étape 10 ──────────────────────
  const step10Title = page.getByText(/truc qui te rend diff/i);
  await expect(step10Title).toBeVisible({ timeout: 8000 });

  // ── Clic + mesure ────────────────────────────────────────────────────
  const btn = page.getByRole("button", { name: /voir mon diagnostic|passer et voir/i });
  await expect(btn).toBeVisible({ timeout: 3000 });

  const t0 = Date.now();
  await btn.click();

  // DiagnosticLoading doit être monté et visible en < 500 ms.
  // Avant le fix PR #267, cette attente prenait ~25 000 ms (blancs + animation).
  const loader = page.getByText(/J.analyse ta communication/i);
  await expect(loader).toBeVisible({ timeout: 500 });
  const elapsed = Date.now() - t0;

  console.log(`✅ DiagnosticLoading visible en ${elapsed} ms (< 500 ms attendu)`);

  await page.screenshot({
    path: path.join(SHOTS, "onboarding-t5-diagnostic-loading.png"),
  });

  // Assertion explicite sur le timing.
  expect(elapsed, `DiagnosticLoading doit apparaître en < 500 ms, a pris ${elapsed} ms`).toBeLessThan(500);
});
