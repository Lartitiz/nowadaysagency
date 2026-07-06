import { test, type Page } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { ECRANS } from "./ecrans";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parcourt les écrans CONNECTÉS et capture chacun : un cliché "fold" (premier
// écran) + un cliché pleine page. Les projets desktop/mobile rejouent la liste.
// Relire ensuite les PNG (e2e-visite/shots/) pour juger design/responsive/états.
// Édite librement la liste ci-dessous.
const SHOTS = path.join(__dirname, "shots");

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
    // "full" = pleine page, APRÈS scroll pour révéler tout le contenu.
    await revealAllByScrolling(page);
    await page.screenshot({ path: path.join(SHOTS, `${e.slug}-${proj}-full.png`), fullPage: true });
  });
}
