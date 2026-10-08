/**
 * CONTENUS FIGÉS — carrousel texte (08/10/2026)
 *
 * Chaque jour, zéro crédit IA : le robot refait le parcours /creer d'un carrousel
 * texte sur le site EN LIGNE, mais les fonctions serveur répondent avec les
 * réponses enregistrées une fois (cf. fige-replay.ts). Le texte est donc toujours
 * le même : si une slide change d'aspect, perd du texte ou si l'export PowerPoint
 * se dégrade, c'est NOTRE code qui a bougé — c'est exactement ce qu'on veut voir.
 *
 * Trois contrôles :
 *  1. texte affiché slide par slide = texte de référence (rien de perdu/coupé) ;
 *  2. image de chaque slide = image de référence (design, mise en page) ;
 *  3. export PowerPoint valide (slides, fonds, texte éditable).
 *
 * Ré-enregistrer (coût réel ≈ 0,6 $, seulement quand la réponse de l'IA doit
 * changer, ex. nouveau format de réponse) :
 *   FIGE_RECORD=1 npx playwright test -c playwright.visite.config.ts e2e-visite/contenus-figes.spec.ts --project=desktop --update-snapshots
 * Accepter un changement de design VOULU (sans régénérer) :
 *   npx playwright test -c playwright.visite.config.ts e2e-visite/contenus-figes.spec.ts --project=desktop --update-snapshots
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { installFigeReplay, FIGES_DIR } from "./fige-replay";
import { exportAndCheckPptx } from "./pptx-export-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDEA = "Pourquoi poster moins mais mieux change tout pour les solopreneurs";
const TEXTS_FILE = path.join(FIGES_DIR, "carrousel-texte.textes.json");

test("contenus figés — carrousel texte : texte, design et export identiques à la référence", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop uniquement (images de référence prises en desktop)");
  test.setTimeout(600_000);

  const fige = await installFigeReplay(page, "carrousel-texte");
  test.skip(!fige.available, "aucun enregistrement : lancer une fois avec FIGE_RECORD=1");
  console.log(fige.recording ? "🔴 ENREGISTREMENT (génération réelle)" : "▶️ REJEU (zéro crédit IA)");

  // ── Parcours /creer (mêmes étapes que perf-carousel) ──
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  const nextFormat = page.getByTestId("creer-format-next")
    .or(page.getByRole("button", { name: /^(suivant|continuer)$/i })).first();
  const textarea = page.getByTestId("creer-idea-input")
    .or(page.locator("#creation-idea"))
    .or(page.getByPlaceholder(/nouveauté|coulisses|raconte|idée|mot-clé|envie|partager/i)).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(IDEA);
  await page.getByTestId("creer-idea-next")
    .or(page.getByRole("button", { name: /^(suivant|continuer)$/i })).first().click();

  const instagram = page.getByTestId("creer-channel-instagram")
    .or(page.getByRole("button", { name: /^instagram/i })).first();
  await expect(instagram).toBeVisible({ timeout: 15000 });
  await instagram.click();
  const carrouselCard = page.getByTestId("creer-format-carousel")
    .or(page.getByRole("button", { name: /^Carrousel\b/ })).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();
  const texteDesign = page.getByTestId("carousel-mode-text")
    .or(page.getByRole("button", { name: /^Texte design/i })).first();
  await expect(texteDesign).toBeVisible({ timeout: 10000 });
  await texteDesign.click();
  await expect(nextFormat).toBeEnabled({ timeout: 5000 });
  await nextFormat.click();

  const genDir = page.getByTestId("creer-generate-direct")
    .or(page.getByRole("button", { name: /générer directement/i })).first();
  const genBtn = page.getByTestId("creer-questions-next")
    .or(page.getByRole("button", { name: /^générer\b/i })).first();
  await expect(genDir.or(genBtn).first()).toBeVisible({ timeout: 120000 });
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();

  await expect(page.getByTestId("publish-or-schedule").first()).toBeVisible({ timeout: 300000 });
  const vignettes = page.locator('[aria-label="Slides du carrousel"] > button');
  await expect.poll(() => vignettes.count(), { timeout: 120000 }).toBeGreaterThanOrEqual(3);
  const n = await vignettes.count();
  console.log(`📑 ${n} slides affichées`);

  // ── 1 & 2 : slide par slide, texte puis image ──
  // La grande slide de l'éditeur (les vignettes et mises en page sont aussi des iframes).
  const preview = page.locator('iframe[title^="Éditeur de la slide"]');
  const texts: string[] = [];
  for (let i = 0; i < n; i++) {
    await vignettes.nth(i).click();
    await expect(preview).toHaveAttribute("title", `Éditeur de la slide ${i + 1}`, { timeout: 15000 });
    await page.waitForFunction(() => {
      const f = document.querySelector('iframe[title^="Éditeur de la slide"]') as HTMLIFrameElement | null;
      return (f?.contentDocument?.body?.innerText || "").trim().length > 0;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(800); // fondu de la slide
    const text = await preview.evaluate((f: HTMLIFrameElement) =>
      (f.contentDocument?.body?.innerText || "").replace(/\s+/g, " ").trim());
    texts.push(text);
    await preview.scrollIntoViewIfNeeded();
    await expect(preview, `slide ${i + 1} : aspect différent de la référence`).toHaveScreenshot(`carrousel-texte-slide-${String(i + 1).padStart(2, "0")}.png`, {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  }

  // Références à (re)poser : à l'enregistrement, ou quand on accepte un changement
  // voulu avec --update-snapshots (le texte de référence suit alors les images).
  const updating = fige.recording || ["all", "changed"].includes(test.info().config.updateSnapshots);
  if (updating) {
    fs.mkdirSync(FIGES_DIR, { recursive: true });
    fs.writeFileSync(TEXTS_FILE, JSON.stringify(texts, null, 2));
    await fige.save();
  }
  if (!fige.recording) {
    const expected = JSON.parse(fs.readFileSync(TEXTS_FILE, "utf8"));
    if (updating) console.log("📝 textes de référence mis à jour");
    expect(texts, "texte des slides différent de la référence (texte perdu, coupé ou déplacé ?)").toEqual(expected);
    const { replayed, missing } = fige.stats();
    console.log(`▶️ ${replayed} réponse(s) rejouée(s)${missing.length ? ` ; parties en vrai : ${missing.join(", ")}` : ""}`);
  }

  // ── 3 : export PowerPoint ──
  const report = await exportAndCheckPptx(page, __dirname, {
    format: "carrousel_texte_design",
    outName: "fige-carrousel-texte.pptx",
    shotName: "fige-pptx-fond.png",
    history: false, // même carrousel chaque jour : ne fausse pas le bilan PPTX du lundi
    validate: { minSlides: 3, expectEditableText: true, backgroundIsDecorative: true },
  });
  expect(report.slideCount, "le PowerPoint n'a pas autant de slides que l'éditeur").toBe(n);
  console.log(`✅ Contenus figés — carrousel texte : ${n} slides identiques à la référence, export PowerPoint valide.`);
});
