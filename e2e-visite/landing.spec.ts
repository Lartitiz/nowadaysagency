import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SONDE_DIR = path.join(__dirname, "sonde");

// SONDE LANDING : intégrité meta/SEO de la page publique `/`. En contexte NON
// authentifié (sinon `/` redirige vers /dashboard). Pour un lancement self-service,
// une landing qui perd son <title>/meta/OG = acquisition en berne, et ça casse
// silencieusement au churn Lovable. Écrit sonde/_landing.json → aggregate.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test("sonde landing: meta/SEO", async ({ page }, info) => {
  if (info.project.name !== "desktop") test.skip(); // meta identiques mobile/desktop

  const missing: string[] = [];
  let navError: string | null = null;
  try {
    await page.goto("/", { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(1000);

    const checks = await page.evaluate(() => {
      const meta = (sel: string) =>
        (document.querySelector(sel) as HTMLMetaElement | null)?.content?.trim() || "";
      return {
        title: document.title.trim(),
        description: meta('meta[name="description"]'),
        ogTitle: meta('meta[property="og:title"]'),
        ogDescription: meta('meta[property="og:description"]'),
        ogImage: meta('meta[property="og:image"]'),
        redirectedAway: !location.pathname.match(/^\/?$/), // on ne devrait PAS être redirigé
      };
    });

    if (checks.redirectedAway) missing.push(`redirigé hors de / (vers ${checks.redirectedAway})`);
    if (!checks.title) missing.push("<title> vide");
    if (!checks.description) missing.push('meta[name="description"] absente/vide');
    if (!checks.ogTitle) missing.push("og:title absent");
    if (!checks.ogDescription) missing.push("og:description absent");
    if (!checks.ogImage) missing.push("og:image absent");
  } catch (err) {
    navError = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  }

  fs.mkdirSync(SONDE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SONDE_DIR, "_landing.json"), JSON.stringify({ missing, navError }, null, 2));
});
