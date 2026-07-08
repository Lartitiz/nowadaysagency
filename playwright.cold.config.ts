import { defineConfig, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// « Smoke à froid » : simule un·e INCONNU·E qui s'inscrit le jour du lancement.
// Inscription fraîche → dashboard nouveau·lle → /creer → 1re génération, avec
// captures des états vides et nettoyage du compte jetable (edge delete-account).
// Isolé de la visite (playwright.visite.config.ts) : contexte NON authentifié
// (pas de session Camille), verdict séparé, propre globalSetup/teardown.
// Lancer : `npx playwright test --config playwright.cold.config.ts`.

// Charge .env (config Supabase publique, pour le nettoyage) puis .env.visite.local.
for (const file of [".env", ".env.visite.local"]) {
  const envPath = path.join(__dirname, file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export default defineConfig({
  testDir: "./e2e-visite",
  testMatch: /cold-smoke\.spec\.ts/,
  timeout: 120_000, // inscription + dashboard + entrée diagnostic (pas de génération)
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: "list",
  outputDir: "./e2e-visite/results-cold",

  use: {
    baseURL: process.env.VISITE_BASE_URL || "https://nowadays-assistant.fr",
    screenshot: "on",
    trace: "off",
  },

  // Contexte FRAIS, non authentifié (un·e inconnu·e à froid — surtout PAS la
  // session Camille de la visite).
  projects: [
    {
      name: "cold",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
