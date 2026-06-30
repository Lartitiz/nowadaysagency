import { test } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parcourt les écrans CONNECTÉS et capture chacun : un cliché "fold" (premier
// écran) + un cliché pleine page. Les projets desktop/mobile rejouent la liste.
// Relire ensuite les PNG (e2e-visite/shots/) pour juger design/responsive/états.
// Édite librement la liste ci-dessous.
const SHOTS = path.join(__dirname, "shots");

const ECRANS: Array<{ slug: string; url: string }> = [
  { slug: "dashboard", url: "/dashboard" },
  { slug: "dashboard-complet", url: "/dashboard/complet" },
  { slug: "creer", url: "/creer" },
  { slug: "calendrier", url: "/calendrier" },
  { slug: "branding", url: "/branding" },
];

for (const e of ECRANS) {
  test(`écran: ${e.slug}`, async ({ page }, info) => {
    const proj = info.project.name;
    await page.goto(e.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500); // animations / chargements asynchrones
    await page.screenshot({ path: path.join(SHOTS, `${e.slug}-${proj}-fold.png`) });
    await page.screenshot({ path: path.join(SHOTS, `${e.slug}-${proj}-full.png`), fullPage: true });
  });
}
