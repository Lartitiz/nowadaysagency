import { defineConfig, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// "Visite guidée" : pilote le SITE LIVE déployé, capture chaque écran en
// desktop ET mobile, puis les PNG sont relus pour juger design/responsive/états.
// Distinct de playwright.config.ts (tests E2E CI sur localhost). Lancer : `npm run visite`.

// Charge .env.visite.local (JAMAIS commité — couvert par .env.*.local) sans dépendance dotenv.
const envPath = path.join(__dirname, ".env.visite.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const AUTH_FILE = path.join(__dirname, "e2e-visite/.auth/camille.json");

// Specs qui PAIENT une génération réelle (API Anthropic, images) sur le compte Camille.
// Écartées :
//  - VISITE_SANS_CREDIT=1 (verdict SANS_CREDIT de e2e-visite/machine-check.mjs : Mac sur
//    batterie faible ou capot fermé) : sur une machine qui va s'endormir, elles finissent
//    en faux rouges payés pour rien ;
//  - tous les jours sauf le LUNDI (décision du 20/10/2026, audit de coût API) : ~1,5 à
//    2 $ par jour de générations, soit environ la moitié de la facture API mensuelle.
//    VISITE_PAYANTE=1 les force un autre jour (après un correctif de génération).
// `plan-carrousel-sonde` ne débite aucun crédit mais paie un appel Sonnet : même règle.
// Leur nombre et leur coût réels se lisent chaque matin dans cron-health (`compte_test_24h`).
const SPECS_PAYANTES =
  /(fonctionnel-t1|perf-carousel|stories-visuelles|carousel-mix-live|carousel-photo-live|carousel-photo-fond-live|packshot-live|plan-carrousel-sonde)\.spec\.ts/;
const estLundi = new Date().getDay() === 1;
const sansSpecsPayantes = !!process.env.VISITE_SANS_CREDIT || (!estLundi && !process.env.VISITE_PAYANTE);
const IGNORES = [/cold-smoke\.spec\.ts/, ...(sansSpecsPayantes ? [SPECS_PAYANTES] : [])];

export default defineConfig({
  testDir: "./e2e-visite",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: "list",
  outputDir: "./e2e-visite/results",

  // Sonde : purge les artefacts du run précédent (setup) puis synthétise les
  // signaux collectés en sonde-report.json/.md trié en deux bacs (teardown).
  globalSetup: "./e2e-visite/sonde-setup.ts",
  globalTeardown: "./e2e-visite/aggregate.ts",

  use: {
    baseURL: process.env.VISITE_BASE_URL || "https://nowadays-assistant.fr",
    screenshot: "on",
    trace: "off",
  },

  projects: [
    // 1) Login → enregistre la session dans e2e-visite/.auth/camille.json
    { name: "setup", testMatch: /auth\.setup\.ts/ },

    // 2) Visite réutilisant la session, en desktop…
    {
      name: "desktop",
      dependencies: ["setup"],
      // cold-smoke a son propre config (contexte non authentifié) — ne PAS le
      // rejouer ici avec la session Camille.
      testIgnore: IGNORES,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: AUTH_FILE,
      },
    },

    // 3) …et en mobile (Chromium + viewport iPhone : WebKit n'est pas téléchargé).
    {
      name: "mobile",
      dependencies: ["setup"],
      testIgnore: IGNORES,
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        storageState: AUTH_FILE,
      },
    },
  ],
});
