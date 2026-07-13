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

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { fileURLToPath } from "url";
import { validatePptx, extractLargestMedia } from "./pptx-validate";

// Historique PPTX : dossier STABLE hors worktree (la visite du matin tourne dans
// un worktree jetable supprimé chaque jour → results/ y serait effacé). Même
// chemin côté lecteur (qualite-pptx.mjs). Surchargable par NOWADAYS_VISITE_DATA.
const HISTORY_DIR = process.env.NOWADAYS_VISITE_DATA || path.join(os.homedir(), ".nowadays-visite");

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

  // ── EXPORT PPTX hybride : validation de CONTENU (desktop uniquement) ──────
  // Réutilise le carrousel qui vient d'être généré (zéro crédit en plus).
  if (test.info().project.name !== "desktop") {
    console.log("Export PPTX : validé en desktop uniquement — étape sautée sur ce projet.");
    return;
  }
  const uiSlides = await page.locator("iframe").count(); // aperçus srcdoc rendus

  await page.getByRole("button", { name: /télécharger/i }).first().click();
  const pptxItem = page.getByText(/PowerPoint — éditable/i).first();
  await expect(pptxItem).toBeVisible({ timeout: 8000 });
  const dlPromise = page.waitForEvent("download", { timeout: 240_000 }); // html2canvas × N slides
  await pptxItem.click();
  const download = await dlPromise;

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const pptxPath = path.join(outDir, "export-carousel-hybride.pptx");
  await download.saveAs(pptxPath);
  console.log(`📦 PPTX téléchargé : ${download.suggestedFilename()} (${fs.statSync(pptxPath).size} o)`);

  const report = await validatePptx(pptxPath, { minSlides: 3, expectEditableText: true });
  console.log(
    `📦 Contenu : ${report.slideCount} slides (UI : ${uiSlides} aperçus), ${report.mediaCount} images, plus petite image ${report.mediaMinBytes} o, encre mini ${report.mediaMinInk < 0 ? "n/a" : (report.mediaMinInk * 100).toFixed(2) + " %"}, ${report.texts.filter((t) => t.trim()).length} runs de texte`,
  );
  if (report.slideCount !== uiSlides) {
    // Informational : d'autres iframes peuvent exister sur la page — ne casse pas seul.
    console.log(`ℹ️ slides PPTX (${report.slideCount}) ≠ iframes UI (${uiSlides}) — à regarder si ça diverge fort.`);
  }

  // Le fond le plus lourd est extrait pour « le regard » du cron (juger à l'œil
  // wraps/contraste — les défauts que seule une humaine ou une capture attrape).
  const shot = await extractLargestMedia(pptxPath, path.join(__dirname, "shots", "export-pptx-fond.png"));
  if (shot) console.log(`👀 Fond extrait pour le regard : ${shot}`);

  // ── Historique hebdo de l'export PPTX (Brique 3 qualité) ──────────────────
  // 1 ligne/jour, append-only, lue par qualite-pptx.mjs pour la section « export
  // PPTX » du bilan du lundi (accumulation des exports RÉELS de la semaine, sans
  // génération supplémentaire). Écrit AVANT l'assertion pour tracer aussi les
  // exports défaillants. Non bloquant : jamais d'échec de test à cause de ça.
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(HISTORY_DIR, "pptx-history.jsonl"),
      JSON.stringify({
        date: new Date().toISOString(),
        format: "carrousel_texte_design",
        slideCount: report.slideCount,
        mediaCount: report.mediaCount,
        mediaMinInk: report.mediaMinInk,
        textRuns: report.texts.filter((t) => t.trim()).length,
        ok: report.problems.length === 0,
        problems: report.problems,
      }) + "\n",
    );
  } catch (e) {
    console.log(`(historique PPTX non écrit : ${(e as Error).message})`);
  }

  expect(report.problems, `Défauts PPTX détectés : ${report.problems.join(" | ")}`).toEqual([]);
  console.log("✅ Export PPTX hybride : contenu validé (zip, slides, fonds, texte éditable, pas de label technique).");
});
