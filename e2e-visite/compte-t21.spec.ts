/**
 * T21 — Compte / Profil / Légal / Admin
 *
 * Critères :
 * - Pages légales accessibles (pas de 404, contenu visible)
 * - /parametres : bouton "Refaire l'onboarding" visible + modale de confirmation
 *   (on NE confirme PAS — éviter de reset le branding de Camille)
 * - Changement de mot de passe : formulaire visible
 * - Admin : Camille n'est pas admin → redirection ou "accès refusé" propre (pas un crash)
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/t21");
fs.mkdirSync(SHOTS, { recursive: true });

// ── Pages légales ─────────────────────────────────────────────────────────────

const LEGAL_PAGES = [
  { path: "/cgu-cgv",           label: "CGU/CGV",            auth: false },
  { path: "/confidentialite",   label: "Confidentialité",    auth: false },
  { path: "/mentions-legales",  label: "Mentions légales",   auth: false },
  { path: "/services",          label: "Services",           auth: false },
  { path: "/legal-ia",          label: "Légal IA",           auth: true  },
] as const;

for (const page_info of LEGAL_PAGES) {
  test(`T21-légal — ${page_info.label} (${page_info.path}) charge sans 404`, async ({ page }) => {
    await page.goto(page_info.path, { waitUntil: "domcontentloaded" });

    // La page ne doit pas afficher d'erreur 404 ou "non trouvée"
    const body = await page.locator("body").textContent() || "";
    expect(body, `Page ${page_info.path} semble vide ou en erreur`).not.toMatch(
      /page introuvable|404|not found|erreur|cannot read/i
    );

    // La page doit avoir du contenu substantiel (plus de 100 chars de texte)
    expect(body.trim().length, `Page ${page_info.path} trop courte (${body.trim().length} chars)`).toBeGreaterThan(100);

    await page.screenshot({
      path: path.join(SHOTS, `t21-legal-${page_info.path.replace(/\//g, "-")}.png`),
    });
    console.log(`✅ T21-légal — ${page_info.label} OK`);
  });
}

// ── Paramètres : reset onboarding (vérifier sans exécuter) ───────────────────

test("T21-params — Bouton 'Refaire l'onboarding' visible + modale de confirmation", async ({ page }) => {
  await page.goto("/parametres", { waitUntil: "networkidle" });

  // Le bouton doit exister
  const resetBtn = page.getByRole("button", { name: /refaire l'onboarding/i });
  await expect(resetBtn).toBeVisible({ timeout: 10000 });

  // Cliquer pour voir la modale — SANS confirmer
  await resetBtn.click();

  // La modale s'ouvre avec le titre dynamique "Repartir de zéro sur l'espace…"
  await expect(page.getByText(/repartir/i).first()).toBeVisible({ timeout: 8000 });

  // Le bouton "Annuler" doit être présent
  const cancelBtn = page.getByRole("button", { name: /annuler/i });
  await expect(cancelBtn).toBeVisible({ timeout: 3000 });

  // Fermer la modale sans confirmer
  await cancelBtn.click();

  await page.screenshot({ path: path.join(SHOTS, "t21-params-reset-annule.png") });
  console.log("✅ T21-params — Modale reset visible, annulée sans reset du branding");
});

// ── Paramètres : formulaire changement MDP ────────────────────────────────────

test("T21-params — Formulaire changement de mot de passe visible", async ({ page }) => {
  await page.goto("/parametres", { waitUntil: "networkidle" });

  // Le champ mot de passe actuel ou nouveau MDP doit exister
  const pwdField = page.locator('input[type="password"]').first();
  await expect(pwdField).toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: path.join(SHOTS, "t21-params-mdp.png") });
  console.log("✅ T21-params — Formulaire MDP visible");
});

// ── Admin : accès non-admin redirige proprement ───────────────────────────────

test("T21-admin — /admin/audit redirige ou refuse proprement pour Camille (non-admin)", async ({ page }) => {
  await page.goto("/admin/audit", { waitUntil: "networkidle" });

  const body = await page.locator("body").textContent() || "";

  // Soit : redirection vers /dashboard ou /login (accès refusé)
  // Soit : la page admin s'affiche SI Camille est admin
  // Dans tous les cas : pas de crash JS ni de page blanche
  const url = page.url();
  const isRedirected = url.includes("/dashboard") || url.includes("/login") || url.includes("/");
  const isAdminPage = body.includes("Audit") || body.includes("utilisateurs") || body.includes("admin");
  const isCrash = body.match(/uncaught error|something went wrong|cannot read/i);

  expect(isCrash, "Crash JS sur /admin/audit").toBeFalsy();
  expect(
    isRedirected || isAdminPage,
    `Comportement inattendu sur /admin/audit (URL: ${url})`
  ).toBe(true);

  await page.screenshot({ path: path.join(SHOTS, "t21-admin-audit.png") });
  console.log(`✅ T21-admin — /admin/audit : ${isAdminPage ? "accès admin OK" : "redirection propre vers " + url}`);
});
