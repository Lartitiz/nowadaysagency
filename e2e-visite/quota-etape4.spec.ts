/**
 * Quota épuisé pendant une génération → l'étape 4 dit la vérité (PR #327 + suite)
 *
 * Bug d'origine (constaté live 04/07) : quota tombé pendant la génération d'un
 * carrousel → le QuotaWallModal s'ouvrait, mais l'écran résultat derrière disait
 * « Session expirée ou contenu indisponible. » avec un Réessayer voué à re-échouer.
 *
 * Stratégie : carousel-ai est intercepté et renvoie le VRAI corps d'erreur quota
 * de l'edge (429 { error: "limit_reached", quota: { reason: "total" } }) — zéro
 * crédit consommé, déterministe quel que soit l'état du compte.
 *
 * Parcours : /creer → idée → Instagram → Carrousel → Texte design → questions
 * (elles échouent aussi : on passe par « Générer directement ») → génération 429.
 *
 * Critères :
 * - le QuotaWallModal s'ouvre ;
 * - une fois le modal fermé, l'écran affiche le message crédits honnête ;
 * - PAS de « Session expirée », PAS de bouton « Réessayer » ;
 * - « Voir les plans → » et « ← Recommencer » sont là.
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/quota");
fs.mkdirSync(SHOTS, { recursive: true });

const IDEA = "Pourquoi je ne réponds plus aux DM le dimanche";

// Même forme que la réponse RÉELLE de plan-limiter/carousel-ai sur quota épuisé.
// ⚠️ Depuis PR #308 les messages serveur n'emploient plus les mots « crédit » /
// « quota » : la détection front DOIT passer par error === "limit_reached"
// (c'est exactement ce que ce test verrouille).
const QUOTA_429_BODY = {
  error: "limit_reached",
  message: "Tu as utilisé tes 23 générations IA ce mois. Elles se renouvellent le 1er du mois.",
  quota: {
    reason: "total",
    plan: "free",
    usage: { total: { used: 23, limit: 23 } },
  },
};

// ── helpers (repris de fonctionnel-t1) ────────────────────────────────────────

async function goToCreer(page: Page) {
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  }
}

async function enterIdea(page: Page, idea: string) {
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(idea);
  const suivant = page.getByRole("button", { name: /suivant/i });
  await expect(suivant).toBeVisible({ timeout: 3000 });
  await suivant.click();
}

async function selectCarouselTexte(page: Page) {
  await page.getByRole("button", { name: /instagram/i }).first().click();
  // Carte de format « Carrousel »
  const carte = page.getByText(/^Carrousel$/, { exact: true }).first();
  await expect(carte).toBeVisible({ timeout: 5000 });
  await carte.click();
  // Sous-type « Texte design » (pas de photos → pas de structure proposal)
  const texte = page.getByText(/texte design/i).first();
  await expect(texte).toBeVisible({ timeout: 5000 });
  await texte.click();
  const suivant = page.getByRole("button", { name: /suivant/i });
  await expect(suivant).toBeEnabled({ timeout: 5000 });
  await suivant.click();
}

// ── Le test ───────────────────────────────────────────────────────────────────

test("Quota pendant la génération carrousel → message honnête, pas « Session expirée »", async ({ page }) => {
  test.setTimeout(120_000);

  // TOUT carousel-ai renvoie le 429 quota : les questions échouent (écran
  // d'erreur questions avec « Générer directement ») puis la génération
  // elle-même tombe sur le quota — le chemin exact du bug d'origine.
  await page.route(/\/functions\/v1\/carousel-ai/, async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify(QUOTA_429_BODY),
    });
  });

  await goToCreer(page);
  await enterIdea(page, IDEA);
  await selectCarouselTexte(page);

  // Étape questions : la préparation échoue (429 intercepté) mais le bouton
  // « Générer directement » reste le chemin de sortie prévu.
  const genDir = page.getByRole("button", { name: /générer directement/i });
  await expect(genDir).toBeVisible({ timeout: 30000 });
  await genDir.click();

  // 1) Le QuotaWallModal s'ouvre (titre du modal).
  const wallTitle = page.getByRole("dialog").getByText(/tes crédits du mois sont utilisés/i);
  await expect(wallTitle).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: path.join(SHOTS, "quota-wall.png") });

  // 2) Fermer le modal (Radix Dialog → Escape).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });

  // 3) L'écran résultat derrière dit la vérité…
  await expect(page.getByText(/tes crédits du mois sont utilisés/i)).toBeVisible({ timeout: 5000 });
  // …et ne ment plus.
  await expect(page.getByText(/session expirée/i)).toHaveCount(0);

  // 4) Boutons : « Voir les plans » remplace « Réessayer » ; « Recommencer » reste.
  await expect(page.getByRole("button", { name: /voir les plans/i })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: /réessayer/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /recommencer/i })).toBeVisible({ timeout: 5000 });

  await page.screenshot({ path: path.join(SHOTS, "quota-etape4-honnete.png"), fullPage: true });
  console.log("✅ Quota étape 4 — message honnête, pas de Réessayer menteur");
});
