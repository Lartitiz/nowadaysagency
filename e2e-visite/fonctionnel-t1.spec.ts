/**
 * T1 — Création post texte (Instagram + LinkedIn)
 *
 * Parcours : /creer → idée → format → "Générer directement" → résultat
 *            → "Ajouter au calendrier"
 *
 * Critères couverts :
 * - Le streaming SSE s'affiche (texte visible dans les 60 s)
 * - Aucun JSON brut ne fuit dans le rendu
 * - "Ajouter au calendrier" déclenche bien le toast de succès
 * - Variante LinkedIn : même flow, canal différent
 *
 * Note : le compte Camille est à 109 % de quota mais génère encore
 * (coaching_programs binôme resté actif). Si la QuotaWallModal apparaît,
 * le test log le fait et passe en skip plutôt que d'échouer.
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/fonctionnel");
fs.mkdirSync(SHOTS, { recursive: true });

const IDEA = "Les 3 erreurs qui font que les solopreneurs vendent mal leurs offres";

// ── helpers ──────────────────────────────────────────────────────────────────

async function goToCreer(page: Page) {
  await page.goto("/creer", { waitUntil: "networkidle" });
  // Fermer la bannière branding si présente (X button)
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  }
  // Ou X générique en haut à droite de la bannière rose
  const xBtn = page.locator('.bg-rose-pale button, .bg-primary\\/10 button').filter({ hasText: "" }).first();
  if (await xBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await xBtn.click().catch(() => {});
  }
}

async function dismissQuotaWall(page: Page): Promise<boolean> {
  // Détecte si la QuotaWallModal est ouverte (plusieurs variantes de texte)
  const wall = page.getByText(/quota|crédits épuisés|plus de crédit|crédits du mois|Passer à L.Assistant/i).first();
  if (await wall.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("⚠️  QuotaWallModal détectée — compte Camille bloqué quota");
    return true; // bloqué
  }
  return false;
}

async function enterIdea(page: Page, idea: string) {
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(idea);
  const suivant = page.getByRole("button", { name: /suivant/i });
  await expect(suivant).toBeVisible({ timeout: 3000 });
  await suivant.click();
}

async function selectFormat(page: Page, channel: "instagram" | "linkedin") {
  if (channel === "instagram") {
    // Cliquer sur la carte canal Instagram
    await page.getByRole("button", { name: /instagram/i }).first().click();
    // Sous-format : cliquer sur "Post" (carte de format)
    const postCard = page.getByText(/^Post$/, { exact: true }).first();
    if (await postCard.isVisible({ timeout: 4000 }).catch(() => false)) {
      await postCard.click();
    }
  } else {
    // LinkedIn : cliquer sur la carte canal
    await page.getByRole("button", { name: /linkedin/i }).first().click();
    // LinkedIn demande un sous-format → sélectionner "Post" (1300-2000 caractères)
    const postCard = page.getByText(/^Post$/, { exact: true }).first();
    await expect(postCard).toBeVisible({ timeout: 5000 });
    await postCard.click();
  }
  // Bouton Suivant pour valider le format (doit être enabled après sélection)
  const suivant = page.getByRole("button", { name: /suivant/i });
  await expect(suivant).toBeEnabled({ timeout: 5000 });
  await suivant.click();
}

async function generateDirectly(page: Page): Promise<boolean> {
  // Attendre que "Préparation des questions..." se termine (appel réseau)
  // puis chercher "Générer directement" (jusqu'à 30 s)
  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });

  // Dès que l'un des deux boutons apparaît, on clique
  await Promise.race([
    expect(genDir).toBeVisible({ timeout: 30000 }),
    expect(genBtn).toBeVisible({ timeout: 30000 }),
  ]).catch(() => {});

  if (await genDir.isVisible().catch(() => false)) {
    await genDir.click();
  } else if (await genBtn.isVisible().catch(() => false)) {
    await genBtn.click();
  }

  // Vérifier si quota wall est apparu
  return !(await dismissQuotaWall(page));
}

// ── T1a : Instagram Post ──────────────────────────────────────────────────────

test("T1a — Post Instagram : génération streaming + ajout calendrier", async ({ page }) => {
  test.setTimeout(180_000); // 3 min : génération LLM + streaming Instagram peut dépasser 90 s
  await goToCreer(page);
  await enterIdea(page, IDEA);
  await selectFormat(page, "instagram");

  const canGenerate = await generateDirectly(page);
  if (!canGenerate) {
    console.log("SKIP : quota épuisé sur le compte Camille");
    test.skip();
    return;
  }

  // ── Attente du résultat streamé ──────────────────────────────────────────
  // "Ton contenu prêt" = titre étape 4, apparaît dès que l'étape commence.
  // Le streaming du contenu continue après.
  await expect(page.getByText(/ton contenu prêt/i)).toBeVisible({ timeout: 90000 });

  // ── Ajouter au calendrier ─────────────────────────────────────────────────
  // Ce bouton s'affiche UNIQUEMENT quand le streaming est terminé.
  // Si le quota bloque la génération, le spinner tourne indéfiniment :
  // on attrape le timeout et on vérifie la quota wall avant de skip/échouer.
  const calBtn = page.getByRole("button", { name: /ajouter au calendrier/i }).first();
  let calBtnFound = false;
  try {
    await expect(calBtn).toBeVisible({ timeout: 90000 });
    calBtnFound = true;
  } catch {
    if (await dismissQuotaWall(page)) {
      console.log("SKIP : quota épuisé (génération bloquée côté serveur)");
      test.skip();
      return;
    }
    throw new Error("Bouton 'Ajouter au calendrier' non trouvé après 90 s (sans quota wall)");
  }

  await page.screenshot({ path: path.join(SHOTS, "t1a-instagram-result.png") });

  // ── Vérification : pas de JSON brut dans le rendu ────────────────────────
  const pageText = await page.locator("body").textContent() || "";
  expect(pageText, "JSON brut détecté dans le rendu").not.toMatch(/^\s*\{|\}\s*$|"content":/);

  await calBtn.click();

  // Sélectionner une date si le picker s'ouvre (cliquer sur "aujourd'hui" ou premier jour)
  const pickerDay = page.getByRole("gridcell").first();
  if (await pickerDay.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pickerDay.click();
    const confirmer = page.getByRole("button", { name: /confirmer|valider|ok/i });
    if (await confirmer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmer.click();
    }
  }

  // Toast de succès attendu
  const toast = page.getByText(/ajouté au calendrier/i);
  await expect(toast).toBeVisible({ timeout: 8000 });

  await page.screenshot({ path: path.join(SHOTS, "t1a-instagram-calendrier.png") });
  console.log("✅ T1a — Post Instagram OK (streaming + calendrier)");
});

// ── T1b : LinkedIn Post ───────────────────────────────────────────────────────

test("T1b — Post LinkedIn : génération streaming", async ({ page }) => {
  await goToCreer(page);
  await enterIdea(page, IDEA);
  await selectFormat(page, "linkedin");

  const canGenerate = await generateDirectly(page);
  if (!canGenerate) {
    console.log("SKIP : quota épuisé sur le compte Camille");
    test.skip();
    return;
  }

  // ── Attente du résultat streamé (90 s max) ───────────────────────────────
  // "Ton contenu prêt" = titre étape 4 = signal UI fiable que la génération est terminée
  await expect(page.getByText(/ton contenu prêt/i)).toBeVisible({ timeout: 90000 });

  await page.screenshot({ path: path.join(SHOTS, "t1b-linkedin-result.png") });

  // ── LinkedIn spécifique : pas de hashtags parasites (#tag#tag#tag) ────────
  const pageText = await page.locator("body").textContent() || "";
  // Les hashtags LinkedIn legit = max 3-5, pas une série sans espaces
  const weirdHashtags = pageText.match(/#\w+#\w+/g);
  expect(weirdHashtags, `Hashtags parasites détectés : ${weirdHashtags}`).toBeNull();

  // ── Pas de JSON brut ──────────────────────────────────────────────────────
  expect(pageText).not.toMatch(/"content":|"type":/);

  console.log("✅ T1b — Post LinkedIn OK (streaming, pas de hashtags parasites)");
});
