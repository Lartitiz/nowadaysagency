/**
 * CONTENUS FIGÉS — autres formats (08/10/2026) : carrousel photo, carrousel
 * mixte, story, reel, post Instagram. Même principe que contenus-figes.spec.ts
 * (carrousel texte) : les réponses des fonctions serveur sont enregistrées une
 * fois puis rejouées chaque jour (zéro crédit IA) ; un rouge = NOTRE code a
 * bougé (affichage, design, mise en page), pas l'IA.
 *
 * Pour chaque format, chaque « zone » du résultat (slide, aperçu de story,
 * script, légende, post) est comparée à sa référence : texte puis image.
 *
 * Ré-enregistrer un format (coût réel, rarement) :
 *   FIGE_RECORD=1 npx playwright test -c playwright.visite.config.ts e2e-visite/contenus-figes-formats.spec.ts --project=desktop -g "<format>" --update-snapshots
 * Accepter un changement de design voulu (sans régénérer) : même commande sans FIGE_RECORD.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { installFigeReplay, FIGES_DIR, LIVE_OK, expectZoneMatches } from "./fige-replay";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS = [path.join(__dirname, "fixtures-portrait-test.jpg"), path.join(__dirname, "fixtures-cover-test.jpg")];

test.describe.configure({ mode: "serial" });

// ── Parcours communs ──────────────────────────────────────────────────────────

async function openCreer(page: Page, subject: string) {
  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();
  const textarea = page.getByTestId("creer-idea-input").or(page.locator("#creation-idea")).first();
  await expect(textarea).toBeVisible({ timeout: 15000 });
  await textarea.fill(subject);
  await page.getByTestId("creer-idea-next").or(page.getByRole("button", { name: /^(suivant|continuer)$/i })).first().click();
  await page.getByRole("button", { name: /instagram/i }).first().click();
}

async function toStep3(page: Page) {
  for (let i = 0; i < 4; i++) {
    const suivant = page.getByRole("button", { name: /^(suivant|continuer)$/i }).first();
    await expect(suivant).toBeEnabled({ timeout: 8000 });
    await suivant.click();
    const onStep3 = await page.getByText(/Étape 3 sur 4/i).first()
      .waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    if (onStep3) return;
  }
}

async function generate(page: Page) {
  const genDir = page.getByTestId("creer-generate-direct").or(page.getByRole("button", { name: /générer directement/i })).first();
  const genBtn = page.getByTestId("creer-questions-next").or(page.getByRole("button", { name: /^générer\b/i })).first();
  await expect(genDir.or(genBtn).first()).toBeVisible({ timeout: 120000 });
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();
}

async function waitResult(page: Page) {
  await expect(page.getByTestId("publish-or-schedule").first()).toBeVisible({ timeout: 780000 });
  await page.waitForTimeout(2500); // fin des fondus d'entrée
}

/** À l'enregistrement : relevé de la structure de l'écran résultat (pour viser les zones). */
async function dumpStructure(page: Page, name: string) {
  const info = await page.evaluate(() => ({
    iframes: [...document.querySelectorAll("iframe")].map((f) => {
      const r = f.getBoundingClientRect();
      return { title: f.getAttribute("title"), w: Math.round(r.width), h: Math.round(r.height) };
    }),
    testids: [...new Set([...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")))],
    tabs: [...document.querySelectorAll('[role="tab"]')].map((e) => (e as HTMLElement).innerText.trim()),
    regions: [...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).slice(0, 80),
  }));
  fs.mkdirSync(FIGES_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIGES_DIR, `${name}.structure.json`), JSON.stringify(info, null, 1));
}

interface Zone { label: string; locator: Locator; before?: () => Promise<void> }

/** Texte + image de chaque zone, comparés à la référence (ou posés si on enregistre / met à jour). */
async function compareZones(page: Page, name: string, fige: Awaited<ReturnType<typeof installFigeReplay>>, zones: Zone[]) {
  const textsFile = path.join(FIGES_DIR, `${name}.textes.json`);
  const texts: Record<string, string> = {};
  for (const z of zones) {
    if (z.before) await z.before();
    await expect(z.locator, `${name} — zone « ${z.label} » absente`).toBeVisible({ timeout: 30000 });
    await z.locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    texts[z.label] = await z.locator.evaluate((el) => {
      const root = (el instanceof HTMLIFrameElement ? el.contentDocument?.body : el) as HTMLElement | null | undefined;
      // Le texte modifiable (zones de saisie) ne figure pas dans innerText : on l'ajoute.
      const fields = [...(root?.querySelectorAll("textarea, input[type=text]") || [])].map((f) => (f as HTMLInputElement).value);
      return [root?.innerText || "", ...fields].join(" ").replace(/\s+/g, " ").trim();
    });
    await expectZoneMatches(page, z.locator, `${name}-${z.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`,
      `${name} — « ${z.label} » : aspect différent de la référence`);
  }
  const updating = fige.recording || ["all", "changed"].includes(test.info().config.updateSnapshots);
  if (updating) {
    fs.mkdirSync(FIGES_DIR, { recursive: true });
    fs.writeFileSync(textsFile, JSON.stringify(texts, null, 2));
  } else {
    expect(texts, `${name} — texte différent de la référence (perdu, coupé ou déplacé ?)`).toEqual(JSON.parse(fs.readFileSync(textsFile, "utf8")));
    const { replayed, missing } = fige.stats();
    const blocked = missing.filter((fn) => !LIVE_OK.has(fn));
    expect(blocked, `${name} — appels non enregistrés, bloqués pendant le rejeu : ré-enregistrer ce format`).toEqual([]);
    console.log(`▶️ ${name} : ${replayed} réponse(s) rejouée(s)${missing.length ? ` ; parties en vrai : ${missing.join(", ")}` : ""}`);
  }
  console.log(`✅ ${name} : ${zones.length} zone(s) identiques à la référence`);
}

// À l'enregistrement, les réponses sont sauvées même si le test échoue ensuite :
// une génération payée n'est jamais perdue (elle sert au diagnostic en rejeu).
let currentFige: Awaited<ReturnType<typeof installFigeReplay>> | null = null;
test.afterEach(async () => {
  if (currentFige?.recording) await currentFige.save();
  currentFige = null;
});

async function start(page: Page, name: string) {
  test.skip(test.info().project.name !== "desktop", "desktop uniquement (images de référence prises en desktop)");
  test.setTimeout(900_000);
  const fige = await installFigeReplay(page, name);
  currentFige = fige;
  test.skip(!fige.available, `aucun enregistrement pour ${name} : lancer une fois avec FIGE_RECORD=1`);
  console.log(fige.recording ? `🔴 ${name} : ENREGISTREMENT (génération réelle)` : `▶️ ${name} : REJEU (zéro crédit IA)`);
  return fige;
}

/** Aperçus larges (slides, stories) : iframes titrées et assez grandes pour ne pas être des vignettes. */
async function bigFrames(page: Page, titlePrefix?: string): Promise<Locator[]> {
  const all = page.locator(titlePrefix ? `iframe[title^="${titlePrefix}"]` : "iframe[title]");
  const out: Locator[] = [];
  for (let i = 0; i < await all.count(); i++) {
    const box = await all.nth(i).boundingBox();
    if (box && box.width >= 150) out.push(all.nth(i));
  }
  return out;
}

/** Éditeur de carrousel complètement prêt (mise en page et contrôle qualité terminés). */
async function editorReady(page: Page) {
  await expect(page.getByText(/Personnaliser mon carrousel/i).first()).toBeVisible({ timeout: 300000 });
  await expect(page.locator('fieldset[aria-busy="true"]')).toHaveCount(0, { timeout: 300000 });
  await expect(page.getByText(/Contrôle de toutes les slides/i)).toHaveCount(0, { timeout: 120000 });
}

/** Carrousel dans l'éditeur (texte, photo, mixte) : la grande slide, vignette par vignette. */
async function editorZones(page: Page): Promise<Zone[]> {
  const vignettes = page.locator('[aria-label="Slides du carrousel"] > button');
  await expect.poll(() => vignettes.count(), { timeout: 180000 }).toBeGreaterThanOrEqual(2);
  const preview = page.locator('iframe[title^="Éditeur de la slide"]');
  const n = await vignettes.count();
  return Array.from({ length: n }, (_, i) => ({
    label: `slide-${i + 1}`,
    locator: preview,
    before: async () => {
      await vignettes.nth(i).click();
      await expect(preview).toHaveAttribute("title", `Éditeur de la slide ${i + 1}`, { timeout: 15000 });
      await page.waitForFunction(() => {
        const f = document.querySelector('iframe[title^="Éditeur de la slide"]') as HTMLIFrameElement | null;
        const body = f?.contentDocument?.body;
        if (!body) return false;
        const imgs = [...body.querySelectorAll("img")];
        // Une slide « Photos brutes » n'a ni texte ni forcément de <img> (photo en fond).
        return body.children.length > 0 && imgs.every((im) => im.complete && im.naturalWidth > 0);
      }, null, { timeout: 30000 });
    },
  }));
}

// ── Formats ───────────────────────────────────────────────────────────────────

test("contenus figés — carrousel photo", async ({ page }) => {
  const name = "carrousel-photo";
  const fige = await start(page, name);
  await openCreer(page, "Qui je suis : le visage derrière la marque, mon univers et ce que je veux transmettre");
  await page.getByText(/^Carrousel$/, { exact: true }).first().click();
  await page.getByText(/Photos brutes/i).first().click();
  await page.locator('input[type="file"]').first().setInputFiles(PHOTOS);
  await expect(page.locator('img[src^="blob:"], img[src^="data:"]').nth(1)).toBeVisible({ timeout: 20000 });
  const dump = page.getByRole("switch", { name: /Compléter en photo dump/i });
  if (await dump.isVisible({ timeout: 3000 }).catch(() => false) && (await dump.getAttribute("aria-checked")) === "true") await dump.click();
  await toStep3(page);
  await generate(page);
  await waitResult(page);
  await editorReady(page);
  if (fige.recording) { await fige.save(); await dumpStructure(page, name); }
  await compareZones(page, name, fige, await editorZones(page));
});

test("contenus figés — carrousel mixte", async ({ page }) => {
  const name = "carrousel-mixte";
  const fige = await start(page, name);
  await openCreer(page, "5 rituels slow pour ta com' : ma routine douce pour communiquer sans m'épuiser");
  await page.getByText(/^Carrousel$/, { exact: true }).first().click();
  await page.getByText(/Photos \+ slides design/i).first().click();
  await page.getByText(/J'ai déjà mes photos/i).first().click();
  await page.getByPlaceholder(/photos prises ce matin/i).first().fill(
    "Photo 1 : moi, portrait de face — c'est mon visage qui incarne la routine. " +
      "Photo 2 : la slide de couverture déjà maquettée avec le titre du carrousel (5 rituels slow pour ta com').",
  );
  await page.locator('input[type="file"]').first().setInputFiles(PHOTOS);
  await expect(page.locator('img[src^="blob:"], img[src^="data:"]').nth(1)).toBeVisible({ timeout: 20000 });
  await toStep3(page);
  await generate(page);
  await waitResult(page);
  await editorReady(page);
  if (fige.recording) { await fige.save(); await dumpStructure(page, name); }
  await compareZones(page, name, fige, await editorZones(page));
});

test("contenus figés — story", async ({ page }) => {
  const name = "story";
  const fige = await start(page, name);
  await openCreer(page, "Les coulisses de la fabrication de mon prochain savon");
  await page.getByText(/^Story$/, { exact: true }).first().click();
  await toStep3(page);
  await generate(page);
  await expect(page.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 300000 });
  await page.waitForTimeout(2500);
  if (fige.recording) { await fige.save(); await dumpStructure(page, name); }
  const frames = await bigFrames(page, "Aperçu story");
  expect(frames.length, "story : aucun aperçu rendu").toBeGreaterThan(0);
  await compareZones(page, name, fige, frames.map((f, i) => ({ label: `story-${i + 1}`, locator: f })));
});

test("contenus figés — reel", async ({ page }) => {
  const name = "reel";
  const fige = await start(page, name);
  await openCreer(page, "Pourquoi je refuse de brader mes savons alors qu'on me le demande tout le temps");
  await page.getByText("Reel", { exact: true }).first().click();
  await page.getByRole("button", { name: /^Suivant$/i }).last().click();
  const passer = page.getByRole("button", { name: /Passer les questions/i }).first();
  const direct = page.getByRole("button", { name: /Générer directement/i }).first();
  await Promise.race([passer.waitFor({ state: "visible", timeout: 120000 }), direct.waitFor({ state: "visible", timeout: 120000 })]);
  if (await passer.isVisible().catch(() => false)) await passer.click(); else await direct.click();
  await page.getByRole("radio").first().waitFor({ state: "visible", timeout: 180000 });
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: /Écrire le script complet/i }).first().click();
  const scriptTab = page.getByRole("tab", { name: /^Script$/ });
  const legendeTab = page.getByRole("tab", { name: /^Légende$/ });
  await expect(scriptTab).toBeVisible({ timeout: 780000 });
  await page.waitForTimeout(2500);
  if (fige.recording) { await fige.save(); await dumpStructure(page, name); }
  const panel = page.getByRole("tabpanel").first();
  await compareZones(page, name, fige, [
    { label: "script", locator: panel, before: () => scriptTab.click() },
    { label: "legende", locator: panel, before: () => legendeTab.click() },
  ]);
});

test("contenus figés — post Instagram", async ({ page }) => {
  const name = "post-instagram";
  const fige = await start(page, name);
  await openCreer(page, "Pourquoi je prends le temps de répondre à chaque message de cliente");
  await page.getByText(/^Post$/, { exact: true }).first().click();
  await toStep3(page);
  await generate(page);
  await waitResult(page);
  if (fige.recording) { await fige.save(); await dumpStructure(page, name); }
  // Le texte du post : le bloc résultat juste au-dessus des actions.
  const result = page.getByTestId("publish-or-schedule").first()
    .locator("xpath=ancestor::div[contains(@class,'space-y-4')][1]");
  await compareZones(page, name, fige, [{
    label: "post",
    locator: result,
    // Aperçu replié (« … plus ») : on le déplie pour comparer TOUT le texte.
    before: async () => {
      const more = result.getByRole("button", { name: /^plus$/i }).first()
        .or(result.getByText(/^plus$/i).first());
      if (await more.isVisible().catch(() => false)) await more.click();
    },
  }]);
});
