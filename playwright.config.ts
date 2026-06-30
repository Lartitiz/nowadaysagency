import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "html",
  outputDir: "test-results/",

  use: {
    baseURL: "http://localhost:8080",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
    {
      // Responsive mobile (jamais testé jusqu'ici) — viewport Pixel 5 (393×851),
      // moteur chromium (pas d'install navigateur supplémentaire requise).
      // Suivi possible : ajouter un projet iPhone/webkit (npx playwright install webkit)
      // pour couvrir les quirks iOS Safari.
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
