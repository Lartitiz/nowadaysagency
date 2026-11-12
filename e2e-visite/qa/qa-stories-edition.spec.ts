/**
 * QA édition des stories (12/11/2026) — audit, pas une garde.
 * Génère une séquence (compte Camille), puis inventorie ce qu'on peut
 * retoucher, vérifie que l'aperçu suit le texte et que la retouche survit
 * au rechargement. Tout est journalisé ; peu d'assertions dures.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/qa-stories");
fs.mkdirSync(SHOTS, { recursive: true });
const IDEA = "Les coulisses de la fabrication de mon prochain savon";
const MARK = "QA-RETOUCHE-1211";

test("QA édition des stories", async ({ page }, info) => {
  test.setTimeout(300_000);
  const tag = info.project.name;
  const log = (k: string, v: unknown) => console.log(`[${tag}] ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const textarea = page.locator("#creation-idea").or(page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager|nouveauté|coulisses/i)).first();
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill(IDEA);
  await page.getByRole("button", { name: /^(suivant|continuer)$/i }).click();
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const storyCard = page.getByText(/^Story$/, { exact: true }).first();
  await expect(storyCard).toBeVisible({ timeout: 15000 });
  await storyCard.click();
  for (let i = 0; i < 3; i++) {
    const s = page.getByRole("button", { name: /^(suivant|continuer)$/i }).first();
    if (!(await s.isVisible().catch(() => false))) break;
    await s.click().catch(() => {});
    if (await page.getByText(/Étape 3 sur 4/i).first().isVisible({ timeout: 4000 }).catch(() => false)) break;
  }
  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });
  await Promise.race([genDir.waitFor({ timeout: 90000 }), genBtn.waitFor({ timeout: 90000 })]).catch(() => {});
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();

  const t0 = Date.now();
  await expect(page.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 180_000 });
  log("durée génération (s)", Math.round((Date.now() - t0) / 1000));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(SHOTS, `${tag}-01-resultat.png`), fullPage: true });

  // Inventaire des gestes de retouche visibles
  const count = async (re: RegExp) => page.getByRole("button", { name: re }).count();
  const inventory = {
    stories: await page.getByText(/^Story \d+$/).count(),
    apercus: await page.locator('iframe[title^="Aperçu story"]').count(),
    champsTexte: await page.locator("textarea").count(),
    fondPhotoCouleur: await page.locator("[data-story-background]").count(),
    deplacerTexte: await count(/Déplacer le texte/i),
    recadrerPhoto: await count(/Recadrer la photo/i),
    supprimer: await count(/Supprimer/i),
    refaire: await count(/Refaire|Régénérer|Réécrire/i),
    ajouterStory: await count(/Ajouter une story|Nouvelle story/i),
    reordonner: await count(/Monter|Descendre|Déplacer la story|Réordonner/i),
    annuler: await count(/^Annuler$|Annuler la dernière/i),
    police: await count(/Police|Typo/i),
    couleurTexte: await count(/Couleur du texte|Couleur/i),
    taille: await count(/Taille|Ajuster/i),
    editeurVisuel: await count(/Ouvrir l.éditeur|Modifier dans l.éditeur|Modifier les stories/i),
    calendrier: await count(/calendrier/i),
  };
  log("inventaire", inventory);

  // Retouche du texte de la story affichée → l'aperçu suit-il ?
  const field = page.getByLabel(/Texte complet de la story/i).first();
  if (await field.isVisible().catch(() => false)) {
    const before = await field.inputValue();
    await field.fill(`${MARK} ${before}`);
    await page.waitForTimeout(1500);
    const srcdocs = await page.locator('iframe[title^="Aperçu story"]').evaluateAll(els => els.map(e => (e as HTMLIFrameElement).srcdoc || ""));
    log("aperçu suit le texte", srcdocs.some(s => s.includes(MARK)));
    // Cmd/Ctrl+Z hors du champ : annulation au niveau de l'app ?
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
    await page.waitForTimeout(800);
    log("annuler hors champ défait la retouche", !(await field.inputValue()).includes(MARK));
    await page.screenshot({ path: path.join(SHOTS, `${tag}-02-retouche.png`), fullPage: true });

    // Remettre la retouche (l'annulation l'a défaite), puis recharger.
    const cur = await field.inputValue();
    if (!cur.includes(MARK)) await field.fill(`${MARK} ${cur}`);
    await page.waitForTimeout(2500);
    // Rechargement : la retouche tient-elle ?
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    const after = page.getByLabel(/Texte complet de la story/i).first();
    const kept = (await after.isVisible().catch(() => false)) && (await after.inputValue()).includes(MARK);
    log("retouche gardée après rechargement", kept);
    await page.screenshot({ path: path.join(SHOTS, `${tag}-03-apres-rechargement.png`), fullPage: true });
  } else {
    log("champ texte story 1", "introuvable");
  }

  // Mesures de mise en page
  const preview = page.locator('iframe[title^="Aperçu story"]').first();
  const box = await preview.boundingBox().catch(() => null);
  log("taille aperçu", box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "aucun");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log("débordement horizontal (px)", overflow);
});
