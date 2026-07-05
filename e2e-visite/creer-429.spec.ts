/**
 * /creer — 429 « Trop de requêtes » pendant la génération : échec honnête sur place
 *
 * Reproduit le finding QA du 05/07 : creative-flow renvoie 429 (rate limit) sur
 * « Générer directement » → avant le fix, le front revenait MUETTEMENT à l'étape 2
 * (le toast de 4 s était le seul indice) et l'état d'erreur inline de l'étape
 * résultat (message + 🔄 Réessayer, posé par #327) n'était jamais visible.
 *
 * Méthode : interception réseau de creative-flow UNIQUEMENT pour step="generate"
 * (les questions passent en vrai) → 429 déterministe, zéro crédit consommé,
 * indépendant du vrai rate limit.
 *
 * Critères :
 * - on RESTE à l'étape 4 (résultat) — pas de retour étape 2
 * - le message « Trop de requêtes » est visible en dur (pas seulement un toast)
 * - le bouton « 🔄 Réessayer » est présent
 */

import { test, expect } from "@playwright/test";

test.describe("429 pendant la génération", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  test("Générer directement sur 429 = erreur visible + Réessayer, sans retour étape 2", async ({ page }) => {
    test.setTimeout(180_000);

    // 429 uniquement sur la génération ; les autres steps (questions…) passent.
    await page.route("**/functions/v1/creative-flow", async (route) => {
      const body = route.request().postDataJSON() as { step?: string } | null;
      if (body?.step === "generate") {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "Trop de requêtes. Réessaie dans un moment." }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/creer?new=1", { waitUntil: "networkidle" });
    const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill("Pourquoi je montre les coulisses de mon atelier");
    await page.getByRole("button", { name: /suivant/i }).click();

    // Étape 2 : Instagram → sous-format Post → Suivant
    await page.getByRole("button", { name: /instagram/i }).first().click();
    await page.getByRole("button", { name: /Post/ }).filter({ hasText: "Post" }).first().click();
    const suivant = page.getByRole("button", { name: /suivant/i });
    await expect(suivant).toBeEnabled({ timeout: 5_000 });
    await suivant.click();

    // Étape 3 : générer directement (les questions réelles peuvent mettre ~10-60 s)
    const genDir = page.getByRole("button", { name: /générer directement/i }).first();
    await expect(genDir).toBeVisible({ timeout: 90_000 });
    await genDir.click();

    // ── Critères post-fix ────────────────────────────────────────────────────
    // Message d'erreur inline visible (état vide de l'étape résultat)
    await expect(page.getByText(/trop de requêtes/i).first()).toBeVisible({ timeout: 15_000 });
    // Bouton Réessayer inline
    await expect(page.getByRole("button", { name: /réessayer/i }).first()).toBeVisible({ timeout: 5_000 });
    // On est bien restés à l'étape 4, pas revenus à l'étape 2
    await expect(page.getByText("Étape 4 sur 4").first()).toBeVisible();
    await expect(page.getByText("Étape 2 sur 4")).toHaveCount(0);
  });
});
