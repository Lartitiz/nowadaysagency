/**
 * PERF — Chronométrage génération carrousel (mode texte, qualité normale)
 *
 * Mesure sur le site LIVE (compte Camille) le ressenti utilisateur :
 * clic Générer → texte affiché → visuels affichés.
 *
 * ⚠️ Les durées des requêtes /functions/v1/* loggées ici ne sont fiables QUE
 * pour les endpoints non-SSE : carousel-ai et carousel-visual répondent en
 * text/event-stream (les headers arrivent tout de suite, le body streame) —
 * seuls les jalons UI (⏲ ci-dessous) mesurent la vraie attente.
 *
 * Spec de diagnostic ponctuelle (pas un test de régression) : tout est loggé
 * en console, aucune assertion de durée.
 */

import { test, expect, Page } from "@playwright/test";

const IDEA = "Pourquoi poster moins mais mieux change tout pour les solopreneurs";

type Timing = { url: string; start: number; end?: number; status?: number };

test("PERF — carrousel texte : durées par étape", async ({ page }) => {
  test.setTimeout(600_000); // 10 min

  const timings: Timing[] = [];
  const pending = new Map<string, Timing>();

  page.on("request", (req) => {
    if (req.url().includes("/functions/v1/")) {
      const t: Timing = { url: req.url().split("/functions/v1/")[1].split("?")[0], start: Date.now() };
      pending.set(req.url() + req.method(), t);
      timings.push(t);
    }
  });
  page.on("response", (res) => {
    const t = pending.get(res.url() + res.request().method());
    if (t && !t.end) {
      t.end = Date.now();
      t.status = res.status();
      console.log(`⏱️  ${t.url} → ${res.status()} en ${((t.end - t.start) / 1000).toFixed(1)}s (headers — SSE streame après)`);
    }
  });

  // ── Parcours /creer ──
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  // Étape 1 : idée
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(IDEA);
  await page.getByRole("button", { name: /suivant/i }).click();

  // Étape 2 : Instagram → Carrousel → sous-mode « Texte design »
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const carrouselCard = page.getByText(/^Carrousel$/, { exact: true }).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();

  for (let i = 0; i < 4; i++) {
    const texteDesign = page.getByText(/Texte design/i).first();
    if (await texteDesign.isVisible({ timeout: 2000 }).catch(() => false)) {
      await texteDesign.click();
    }
    const suivant = page.getByRole("button", { name: /suivant/i }).first();
    await expect(suivant).toBeEnabled({ timeout: 5000 });
    await suivant.click();
    const onStep3 = await page
      .getByText(/Étape 3 sur 4/i)
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (onStep3) break;
  }

  // Étape 3 : attendre les questions puis générer directement
  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });
  await Promise.race([
    expect(genDir).toBeVisible({ timeout: 120000 }),
    expect(genBtn).toBeVisible({ timeout: 120000 }),
  ]).catch(() => {});

  const tClickGen = Date.now();
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();
  console.log("🚀 Clic Générer");

  // ⏲ Jalon TEXTE : les actions du résultat ("Ajouter au calendrier") ne
  // s'affichent qu'une fois la génération terminée (generating=false + result).
  await expect(page.getByRole("button", { name: /ajouter au calendrier/i }).first()).toBeVisible({ timeout: 300000 });
  const tTextReady = Date.now();
  console.log(`⏲ 📝 TEXTE affiché après ${((tTextReady - tClickGen) / 1000).toFixed(1)}s`);

  // ⏲ Jalon VISUELS : les slides rendues = iframes srcDoc dans la page.
  await page.waitForFunction(() => document.querySelectorAll("iframe").length >= 3, { timeout: 300000 });
  const tVisualsReady = Date.now();
  console.log(`⏲ 🖼️  VISUELS affichés après ${((tVisualsReady - tClickGen) / 1000).toFixed(1)}s depuis le clic (+${((tVisualsReady - tTextReady) / 1000).toFixed(1)}s après le texte)`);

  await page.screenshot({ path: "e2e-visite/shots/perf-carousel-final.png", fullPage: false });

  // ── Récap ──
  console.log("\n═══ RÉCAP DES APPELS EDGE (headers) ═══");
  for (const t of timings) {
    const dur = t.end ? ((t.end - t.start) / 1000).toFixed(1) + "s" : "(sans réponse)";
    console.log(`  ${t.url} [${t.status ?? "?"}] : ${dur}`);
  }
  console.log(`\n⏲ Ressenti utilisateur : texte à ${((tTextReady - tClickGen) / 1000).toFixed(1)}s, visuels à ${((tVisualsReady - tClickGen) / 1000).toFixed(1)}s`);
});
