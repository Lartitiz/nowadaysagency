/**
 * T5 — DiagnosticLoading (step 11)
 *
 * Vérifie que le loader "J'analyse ta communication..." apparaît dans < 500 ms
 * après le clic sur "voir mon diagnostic" (fin de la dernière étape).
 *
 * Régression PR #267 : DiagnosticLoading était rendu DANS l'AnimatePresence
 * mode="wait" → l'animation de sortie de l'étape 10 suspendait son montage
 * → écran blanc jusqu'à ~25 s.
 *
 * Stratégie :
 * - Supabase profiles / user_plan_config → intercept GET pour renvoyer
 *   onboarding_completed: false (empêche la redirection vers /dashboard).
 * - localStorage pré-rempli à la dernière étape (rang cherché, pas codé en dur) avec des réponses minimales valides.
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

test("T5 — DiagnosticLoading s'affiche en < 500 ms après la dernière étape", async ({ page }) => {
  // ── Intercepts ──────────────────────────────────────────────────────────
  // Profiles GET : renvoie onboarding_completed: false pour bloquer la
  // redirection vers /dashboard.
  //
  // 🔑 Les ÉCRITURES sont fulfilled à vide, JAMAIS continue()'d. Constaté le
  // 18/08/2026 : la fin d'onboarding écrit `profileData` de façon
  // INCONDITIONNELLE (use-onboarding.ts) — donc chaque run de la visite
  // reversait MINIMAL_ANSWERS dans le VRAI profil de Camille (activite,
  // type_activite, canaux, main_blocker, main_goal, weekly_time…). La fiche
  // affichait « Céramiste » alors que tout son contenu parle de savons, et la
  // correction manuelle faite en base le 17/08 n'a pas survécu au run suivant.
  // Cette spec ne mesure qu'un DÉLAI D'AFFICHAGE : elle n'a aucune raison de
  // toucher la base.
  await page.route(/\/rest\/v1\/profiles\?/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.pgrst.object+json",
        body: JSON.stringify({ onboarding_completed: false }),
      });
    } else {
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
    }
  });

  // user_plan_config : même traitement, écritures comprises (la fin
  // d'onboarding y reverse aussi main_goal / weekly_time / channels).
  await page.route(/\/rest\/v1\/user_plan_config\?/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.pgrst.object+json",
        body: JSON.stringify({ onboarding_completed: false }),
      });
    } else {
      await route.fulfill({ status: 204, contentType: "application/json", body: "" });
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

  // ── Pré-remplissage localStorage → dernière étape avant le loader ────
  //
  // 🔑 Le NUMÉRO de cette étape bouge (l'écran « uniqueness » était le step 10,
  // il est passé au 9 le 07/08 quand une question a sauté). Un numéro en dur
  // faisait atterrir la spec DIRECTEMENT sur le loader puis sur le diagnostic
  // fini de Camille — un rouge qui accusait le produit à tort. On cherche donc
  // l'étape par son ÉCRAN, pas par son rang : le premier candidat qui affiche
  // « le truc qui te rend différente » gagne, et on l'écrit dans le log.
  await page.goto("/onboarding", { waitUntil: "commit" });

  const derniereEtape = page.getByText(/truc qui te rend diff/i);
  let etapeTrouvee = -1;
  for (const candidat of [9, 10, 8, 11]) {
    await page.evaluate(({ answers, ts, step }) => {
      localStorage.setItem("lac_onboarding_step", String(step));
      localStorage.setItem("lac_onboarding_answers", JSON.stringify(answers));
      localStorage.setItem("lac_onboarding_ts", ts);
    }, { answers: MINIMAL_ANSWERS, ts: new Date().toISOString(), step: candidat });

    // Reload pour que le hook restaure depuis localStorage.
    await page.reload({ waitUntil: "networkidle" });
    if (await derniereEtape.isVisible({ timeout: 6000 }).catch(() => false)) {
      etapeTrouvee = candidat;
      break;
    }
  }
  expect(
    etapeTrouvee,
    "l'écran « uniqueness » (dernière étape avant le diagnostic) est introuvable aux steps 8-11",
  ).toBeGreaterThan(0);
  console.log(`ℹ️  écran « uniqueness » trouvé au step ${etapeTrouvee}`);
  await expect(derniereEtape).toBeVisible({ timeout: 8000 });

  // ── Clic + mesure ────────────────────────────────────────────────────
  const btn = page.getByRole("button", { name: /voir mon diagnostic|passer et voir/i });
  await expect(btn).toBeVisible({ timeout: 3000 });

  let t0 = Date.now();
  await btn.click();

  // Depuis #657, un espace qui a DÉJÀ une marque enregistrée demande confirmation
  // avant de la remplacer — c'est le cas de Camille, notre compte mûr. On choisit
  // « Garder ma marque actuelle » (non destructif : la marque de référence n'est
  // pas écrasée par le diagnostic mocké) et on repart le chrono à CE clic, seul
  // moment où le loader est réellement demandé.
  const keepBrand = page.getByRole("button", { name: /garder ma marque actuelle/i });
  if (await keepBrand.isVisible({ timeout: 3000 }).catch(() => false)) {
    t0 = Date.now();
    await keepBrand.click();
  }

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
