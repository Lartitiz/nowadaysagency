/**
 * Sonde export PPTX partagée (Brique 3 qualité) — factorise le bloc
 * « télécharge le PowerPoint éditable → valide → extrait le fond → historise →
 * assert » utilisé par plusieurs specs de génération (texte, photo, mixte).
 *
 * À appeler quand un carrousel VIENT d'être généré et que l'écran RÉSULTAT est
 * affiché (le bouton « Télécharger » est disponible). Réutilise le carrousel déjà
 * généré → ZÉRO crédit en plus. Écrit 1 ligne dans `pptx-history.jsonl` (lue par
 * `qualite-pptx.mjs` pour la section « export PPTX » du bilan hebdo), en taguant
 * le FORMAT — c'est ce qui permet au bilan de couvrir photo/mixte et pas seulement
 * le carrousel texte (angle mort des bugs « carré noir » / white-out de juillet).
 *
 * Le dossier d'historique est STABLE hors worktree (la visite du matin tourne dans
 * un worktree jetable) — même chemin que le lecteur. Surchargeable par NOWADAYS_VISITE_DATA.
 */
import { expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { validatePptx, extractLargestMedia, type PptxReport } from "./pptx-validate";

const HISTORY_DIR = process.env.NOWADAYS_VISITE_DATA || path.join(os.homedir(), ".nowadays-visite");

export interface PptxExportCheckOpts {
  /** Libellé de format écrit dans l'historique, ex. "carrousel_photo", "carrousel_mix". */
  format: string;
  /** Options passées à validatePptx (défauts adaptés au carrousel texte hybride). */
  validate?: { minSlides?: number; expectEditableText?: boolean; backgroundIsDecorative?: boolean };
  /** Nom du .pptx sauvé dans results/ (défaut : d'après le format). */
  outName?: string;
  /** Nom de la capture du fond le plus lourd dans shots/ (omis = pas de capture). */
  shotName?: string;
  /** false = ne PAS échouer sur défaut (juste historiser). Défaut : true (rouge sur défaut). */
  assert?: boolean;
}

/**
 * Télécharge le « PowerPoint — éditable » du carrousel affiché, le valide, extrait
 * le fond le plus lourd pour le regard, ajoute 1 ligne à l'historique PPTX, et —
 * sauf assert:false — échoue sur tout défaut. Renvoie le rapport de validation.
 */
export async function exportAndCheckPptx(
  page: Page,
  dirname: string,
  opts: PptxExportCheckOpts,
): Promise<PptxReport> {
  const outName = opts.outName || `export-${opts.format}.pptx`;
  const vopts = { minSlides: 3, expectEditableText: true, backgroundIsDecorative: true, ...(opts.validate || {}) };

  // Depuis l'écran résultat #608, le téléchargement n'est plus un bouton de
  // premier niveau (ceux-ci = Canva / Publier ou programmer / Autres actions) :
  // « PowerPoint — éditable » vit dans « Autres actions » → sous-menu « Télécharger ».
  // html2canvas × N slides peut être long → 240 s pour l'événement download.
  await page.getByTestId("more-actions").click();
  const dlSub = page.getByRole("menuitem", { name: "Télécharger", exact: true }).first();
  await expect(dlSub).toBeVisible({ timeout: 8000 });
  await dlSub.hover(); // Radix : le survol du sous-déclencheur ouvre le sous-menu
  const pptxItem = page.getByText(/PowerPoint — éditable/i).first();
  await expect(pptxItem).toBeVisible({ timeout: 8000 });
  const dlPromise = page.waitForEvent("download", { timeout: 240_000 });
  await pptxItem.click();
  const download = await dlPromise;

  const outDir = path.join(dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const pptxPath = path.join(outDir, outName);
  await download.saveAs(pptxPath);
  console.log(`📦 PPTX téléchargé : ${download.suggestedFilename()} (${fs.statSync(pptxPath).size} o)`);

  const report = await validatePptx(pptxPath, vopts);
  console.log(
    `📦 [${opts.format}] ${report.slideCount} slides, ${report.mediaCount} images, ` +
      `plus petite image ${report.mediaMinBytes} o, encre mini ` +
      `${report.mediaMinInk < 0 ? "n/a" : (report.mediaMinInk * 100).toFixed(2) + " %"}, ` +
      `${report.texts.filter((t) => t.trim()).length} runs de texte, ` +
      `${report.problems.length} défaut(s)`,
  );

  // Le fond le plus lourd est extrait pour « le regard » du cron (contraste, wraps,
  // photo occultée à l'œil — ce que seule une capture ou une humaine attrape).
  if (opts.shotName) {
    const shot = await extractLargestMedia(pptxPath, path.join(dirname, "shots", opts.shotName));
    if (shot) console.log(`👀 Fond extrait pour le regard : ${shot}`);
  }

  // Historique hebdo (1 ligne/export, append-only). Écrit AVANT l'assertion pour
  // tracer AUSSI les exports défaillants. Non bloquant : jamais un échec de test.
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(HISTORY_DIR, "pptx-history.jsonl"),
      JSON.stringify({
        date: new Date().toISOString(),
        format: opts.format,
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

  if (opts.assert !== false) {
    expect(report.problems, `Défauts PPTX [${opts.format}] : ${report.problems.join(" | ")}`).toEqual([]);
  }
  return report;
}
