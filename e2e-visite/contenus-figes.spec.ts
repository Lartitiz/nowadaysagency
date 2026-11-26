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
 * ⚠️ Après un ré-enregistrement, reposer le piège de la sonde 🏷️ : dans la réponse
 * `carousel-visual` de figes/carrousel-texte.json, sur une slide SANS titre, passer
 * `data-slide-text` et `data-pptx-editable` de "body" à "title", et remettre la clé
 * "piege" en tête du fichier (sinon la ligne 🏷️ le signale).
 * Accepter un changement de design VOULU (sans régénérer) :
 *   npx playwright test -c playwright.visite.config.ts e2e-visite/contenus-figes.spec.ts --project=desktop --update-snapshots
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { installFigeReplay, FIGES_DIR, expectZoneMatches } from "./fige-replay";
import { sondeResultatActions } from "./resultat-actions-sonde";
import { sondeHauteurEditeur } from "./hauteur-editeur-sonde";
import { sondeModifierTexte, sondeCalendrierSuit } from "./retouches-sonde";
import { sondeIconeExport } from "./icone-export-sonde";
import { sondeMisesEnPage } from "./mises-en-page-sonde";
import { exportAndCheckPptx } from "./pptx-export-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDEA = "Pourquoi poster moins mais mieux change tout pour les solopreneurs";
const TEXTS_FILE = path.join(FIGES_DIR, "carrousel-texte.textes.json");

test("contenus figés — carrousel texte : texte, design et export identiques à la référence", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop uniquement (images de référence prises en desktop)");
  test.setTimeout(600_000);

  const boucles: string[] = [];
  page.on("pageerror", (e) => { if (/Maximum update depth/.test(e.message)) boucles.push(e.message.slice(0, 200)); });
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
  const vides: number[] = [];
  for (let i = 0; i < n; i++) {
    // Changer de slide recharge le cadre : sans repère, l'attente ci-dessous lisait encore
    // l'ANCIENNE slide comme « prête » (vu sur le carrousel mixte le 26/11/2026, voir
    // `editorZones` dans contenus-figes-formats.spec.ts). On marque donc l'ancien document
    // et on attend qu'il ait été remplacé.
    const change = (await preview.getAttribute("title")) !== `Éditeur de la slide ${i + 1}`;
    if (change) await preview.evaluate((f: HTMLIFrameElement) => { if (f.contentDocument) (f.contentDocument as unknown as { __ancien?: boolean }).__ancien = true; });
    await vignettes.nth(i).click();
    await expect(preview).toHaveAttribute("title", `Éditeur de la slide ${i + 1}`, { timeout: 15000 });
    // Une slide restée sans texte ne bloque pas la boucle : elle est comptée plus bas
    // (ligne 🏷️), puis la comparaison aux textes de référence met le test au rouge.
    await page.waitForFunction(() => {
      const f = document.querySelector('iframe[title^="Éditeur de la slide"]') as HTMLIFrameElement | null;
      const doc = f?.contentDocument as (Document & { __ancien?: boolean }) | null | undefined;
      if (!doc || doc.__ancien || doc.readyState !== "complete") return false;
      return (doc.body?.innerText || "").trim().length > 0;
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800); // fondu de la slide
    const text = await preview.evaluate((f: HTMLIFrameElement) =>
      (f.contentDocument?.body?.innerText || "").replace(/\s+/g, " ").trim());
    texts.push(text);
    // 🏷️ Un titre ou un corps resté VIDE dans le dessin = texte effacé. On lit les
    // éléments étiquetés, pas tout le texte : sur l'ancien défaut, la slide 4 gardait
    // sa source « — Buffer » et ne paraissait donc pas vide (essai du 24/11).
    // La ligne 🟠 sort ici, avant la comparaison d'image qui arrête le test.
    const vide = await preview.evaluate((f: HTMLIFrameElement) => {
      const champs = Array.from(f.contentDocument?.querySelectorAll('[data-slide-text="title"],[data-slide-text="body"],[data-slide-text="overlay"]') || []);
      return !champs.length || champs.some((el) => !(el.textContent || "").trim());
    });
    if (vide) {
      vides.push(i + 1);
      console.log(`🏷️ Slides sans texte : slide ${i + 1} a perdu son texte 🟠 (effacé à l'ouverture du carrousel ?)`);
    }
    await preview.scrollIntoViewIfNeeded();
    await expectZoneMatches(page, preview, `carrousel-texte-slide-${String(i + 1).padStart(2, "0")}.png`,
      `slide ${i + 1} : aspect différent de la référence`);
  }

  // 🏷️ Slides sans texte (24/11/2026). Dans l'enregistrement, le texte de la slide 4
  // (sans titre) porte exprès l'étiquette « title » au lieu de « body » : c'est
  // l'erreur du dessin qui a livré une slide VIDE à une nouvelle inscrite (l'éditeur
  // y remettait le titre, vide). Le texte doit rester ; lecture attendue : 0.
  // Le piège vit dans l'enregistrement (clé « piege ») : un ré-enregistrement l'efface.
  const piege = !fige.recording && !!JSON.parse(fs.readFileSync(path.join(FIGES_DIR, "carrousel-texte.json"), "utf8")).piege;
  if (!vides.length) console.log(piege
    ? "🏷️ Slides sans texte : 0 ✅ (étiquette mal posée en slide 4 : texte gardé)"
    : "🏷️ Slides sans texte : 0, mais l'étiquette piège n'est plus dans l'enregistrement 🟠 (à reposer en slide 4)");

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

  // ── 4 : choisir un texte ne fait pas planter l'éditeur (15/10/2026, #1582) ──
  // La barre flottante mesurait une largeur qui dépendait de sa place : boucle de
  // rendu et page blanche en choisissant le titre, vue sur un écran étroit.
  await page.setViewportSize({ width: 800, height: 600 });
  // L'aperçu se remesure (et se recharge) après le changement de taille : un clic
  // trop tôt tombe sur l'ancien document et ne choisit rien (sonde rouge à tort).
  await page.waitForTimeout(1500);
  await vignettes.first().click();
  await page.waitForTimeout(800);
  const titre = page.frameLocator('iframe[title^="Éditeur de la slide"]').locator("[data-slide-text]").first();
  // Slide au milieu de l'écran : sinon son centre peut être sous la barre « Publier »
  // collée en bas (écran bas de 600 px), et le clic ouvre la publication (17/10/2026).
  await preview.evaluate((f) => f.scrollIntoView({ block: "center" }));
  await titre.scrollIntoViewIfNeeded();
  await titre.click();
  await page.waitForTimeout(1500);
  // Un clic parfois perdu juste après le changement de taille : un second essai.
  // La page blanche, elle, reste détectée (erreur « Maximum update depth »).
  const barre = page.getByRole("toolbar", { name: /Barre d.outils de l.élément/ });
  if (!(await barre.isVisible().catch(() => false))) {
    await titre.click();
    await page.waitForTimeout(1500);
  }
  expect(boucles, "page blanche en choisissant un texte dans l'éditeur (boucle de rendu)").toEqual([]);
  await expect(page.getByRole("toolbar", { name: /Barre d.outils de l.élément/ }), "la barre de l'élément ne s'affiche pas").toBeVisible();
  console.log("🖼️ Éditeur : choisir un texte ✅ (pas de page blanche)");
  // Écran du résultat : 3 actions au plus, bouton principal visible (chantier C, ligne 🎛️).
  // En dernier (chantier D, 15/10/2026) : ses changements de taille d'écran ne
  // doivent pas précéder le clic de l'étape 4.
  await sondeResultatActions(page, "carrousel");
  // Hauteur de la page et commandes visibles (chantier D, ligne 📏) : en tout dernier.
  await sondeHauteurEditeur(page, "carrousel");
  // Icône à l'export (18/10/2026, ligne 🔣) : posée puis retirée par « Annuler ».
  await sondeIconeExport(page);
  // Mises en page (20/11/2026, ligne 📐) : chacune appliquée puis retirée par « Annuler ».
  await sondeMisesEnPage(page);
  // Retouches (18/10/2026, lignes 📝 et 🗓️) : après les mesures, car elles changent le
  // carrousel ; le calendrier quitte l'écran et efface son contenu de test à la fin.
  await sondeModifierTexte(page);
  await sondeCalendrierSuit(page);
});
