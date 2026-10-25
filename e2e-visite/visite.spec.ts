import { test, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ECRANS } from "./ecrans";
import { detectDonneesIncompletes } from "./detect-donnees";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parcourt les écrans CONNECTÉS et capture chacun : un cliché "fold" (premier
// écran) + un cliché pleine page. Les projets desktop/mobile rejouent la liste.
// Relire ensuite les PNG (e2e-visite/shots/) pour juger design/responsive/états.
// Édite librement la liste ci-dessous.
const SHOTS = path.join(__dirname, "shots");
// Signaux de la visite lus par `aggregate.ts` (même dossier que la sonde,
// préfixe `_bandeau-` pour ne pas être confondus avec un écran sondé).
const SONDE_DIR = path.join(__dirname, "sonde");

// Scrolle la page de bout en bout pour déclencher les reveals au scroll
// (IntersectionObserver : sections en `opacity-0` tant qu'on n'a pas scrollé).
// Sans ça, une capture `fullPage` montre de fausses bandes vides.
async function revealAllByScrolling(page: Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    const max = document.body.scrollHeight;
    for (let y = 0; y <= max; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400); // laisse les animations de reveal se poser
}

for (const e of ECRANS) {
  test(`écran: ${e.slug}`, async ({ page }, info) => {
    const proj = info.project.name;
    await page.goto(e.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // animations / chargements asynchrones
    // "fold" = première impression, capturée AVANT de scroller.
    await page.screenshot({ path: path.join(SHOTS, `${e.slug}-${proj}-fold.png`) });
    // Message « Impossible de charger … » visible = une donnée a manqué à
    // l'écran que la capture montre (25/10/2026 : bandeau de l'accueil pendant
    // un chargement lent, vu seulement en regardant la capture). Remonté en
    // observation 🟡 `donnees-incompletes` par aggregate.ts, jamais en rouge.
    try {
      const bandeaux = await page.evaluate(detectDonneesIncompletes);
      if (bandeaux.length) {
        fs.mkdirSync(SONDE_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(SONDE_DIR, `_bandeau-${e.slug}-${proj}.json`),
          JSON.stringify({ slug: e.slug, projet: proj, url: e.url, source: "visite", bandeaux }, null, 2),
        );
      }
    } catch {
      /* la capture reste le livrable : un détecteur qui échoue ne casse pas la visite */
    }
    // "full" = pleine page, APRÈS scroll pour révéler tout le contenu.
    await revealAllByScrolling(page);
    await page.screenshot({ path: path.join(SHOTS, `${e.slug}-${proj}-full.png`), fullPage: true });
  });
}
