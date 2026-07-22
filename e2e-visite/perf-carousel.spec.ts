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
 * Spec de diagnostic pour les DURÉES (aucune assertion de durée), MAIS depuis
 * le 09/07 il porte aussi la validation de contenu de l'EXPORT PPTX hybride
 * (desktop uniquement) : le carrousel généré ici est réutilisé — zéro crédit en
 * plus — pour télécharger le « PowerPoint — éditable » et l'ouvrir au jszip
 * (slides, fonds non vides, texte éditable, pas de label « Slide N » — les bugs
 * réels de #415/#420). LÀ il y a des assertions : un défaut = ROUGE export.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { exportAndCheckPptx } from "./pptx-export-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  // ⏲ Jalon TEXTE : les actions du résultat ("Publier ou programmer") ne
  // s'affichent qu'une fois la génération terminée (generating=false + result).
  await expect(page.getByTestId("publish-or-schedule").first()).toBeVisible({ timeout: 300000 });
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

  // ── EXPORT PPTX hybride : validation de CONTENU (desktop uniquement) ──────
  // Réutilise le carrousel qui vient d'être généré (zéro crédit en plus).
  if (test.info().project.name !== "desktop") {
    console.log("Export PPTX : validé en desktop uniquement — étape sautée sur ce projet.");
    return;
  }
  const uiSlides = await page.locator("iframe").count(); // aperçus srcdoc rendus

  // backgroundIsDecorative : l'export hybride « éditable » pose le texte en NATIF
  // par-dessus le fond → un fond APLAT (blanc/primaire de l'alternance) est légitime
  // tant que la slide porte du texte. Sans ça, un tirage sur fond uni était flaggé à
  // tort « fond raté » (faux positif ~1 jour/3 selon la génération — cf. 21/07).
  const report = await exportAndCheckPptx(page, __dirname, {
    format: "carrousel_texte_design",
    outName: "export-carousel-hybride.pptx",
    shotName: "export-pptx-fond.png",
    validate: { minSlides: 3, expectEditableText: true, backgroundIsDecorative: true },
  });
  if (report.slideCount !== uiSlides) {
    // Informational : d'autres iframes peuvent exister sur la page — ne casse pas seul.
    console.log(`ℹ️ slides PPTX (${report.slideCount}) ≠ iframes UI (${uiSlides}) — à regarder si ça diverge fort.`);
  }
  console.log("✅ Export PPTX hybride (texte) : contenu validé (zip, slides, fonds, texte éditable, pas de label technique).");
});
