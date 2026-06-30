import { test } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots");

// Capture des ÉTATS non-nominaux (loading / error) en manipulant le réseau.
// On cible les appels de DONNÉES (Supabase REST + edge functions) SANS toucher
// /auth/ (sinon on casse la session). Relire les PNG pour juger ces états.
const DATA_CALLS = /\/rest\/v1\/|\/functions\/v1\//;

// ── LOADING : on retarde les réponses de données pour figer les loaders/skeletons.
test("état loading — calendrier", async ({ page }, info) => {
  await page.route(DATA_CALLS, async (route) => {
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
  });
  await page.goto("/calendrier", { waitUntil: "commit" });
  await page.waitForTimeout(1200); // pendant le délai → on voit l'état de chargement
  await page.screenshot({ path: path.join(SHOTS, `etat-loading-calendrier-${info.project.name}.png`) });
});

// ── ERREUR RÉSEAU : on fait échouer les appels de données → fallback erreur/vide.
test("état erreur réseau — branding", async ({ page }, info) => {
  await page.route(DATA_CALLS, (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.goto("/branding", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS, `etat-erreur-branding-${info.project.name}.png`), fullPage: true });
});

// ── ERREUR RÉSEAU — HUB : la carte « Affiner mon identité de marque » ne doit
//    PAS afficher une barre à 0 % à un utilisateur déjà complet (faux « vide »).
test("état erreur réseau — dashboard", async ({ page }, info) => {
  await page.route(DATA_CALLS, (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS, `etat-erreur-dashboard-${info.project.name}.png`), fullPage: true });
});

// ── ERREUR RÉSEAU — CRÉER : la bannière branding ne doit PAS dire « commence par
//    remplir ton identité de marque » à un utilisateur déjà complet.
test("état erreur réseau — creer", async ({ page }, info) => {
  await page.route(DATA_CALLS, (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.goto("/creer", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SHOTS, `etat-erreur-creer-${info.project.name}.png`), fullPage: true });
});

// ── ERREUR FORMULAIRE : mauvais identifiants → message d'erreur (déconnecté).
test.describe(() => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("état erreur — login", async ({ page }, info) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByPlaceholder(/email/i).first().fill("faux@example.com");
    await page.getByPlaceholder(/mot de passe|password/i).first().fill("mauvaismotdepasse");
    await page.getByRole("button", { name: /se connecter|connexion|login/i }).first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, `etat-erreur-login-${info.project.name}.png`) });
  });
});
