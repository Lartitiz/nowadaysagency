import { defineConfig, devices } from "@playwright/test";

// Les tests authentifiés (mobile.authed.spec.ts) ne tournent que si un mot de passe
// de compte test est fourni en variable d'env (jamais commité) :
//   E2E_TEST_PASSWORD='...' npx playwright test --project="Mobile Chrome authed"
const AUTH_STORAGE = "e2e/.auth/camille.json";
const hasTestCreds = !!process.env.E2E_TEST_PASSWORD;

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
    // ── Projets PUBLICS (pas d'auth) — ignorent les specs authentifiées ──
    {
      name: "chromium",
      use: { browserName: "chromium" },
      testIgnore: /\.authed\.spec\.ts/,
    },
    {
      // Responsive mobile — viewport Pixel 5 (393×851), moteur chromium
      // (pas d'install navigateur supplémentaire requise).
      // Suivi possible : projet iPhone/webkit (npx playwright install webkit) pour iOS Safari.
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
      testIgnore: /\.authed\.spec\.ts/,
    },
    // ── Projets AUTHENTIFIÉS (seulement si E2E_TEST_PASSWORD est posé) ──
    ...(hasTestCreds
      ? [
          { name: "setup", testMatch: /auth\.setup\.ts/ },
          {
            name: "Mobile Chrome authed",
            use: { ...devices["Pixel 5"], storageState: AUTH_STORAGE },
            dependencies: ["setup"],
            testMatch: /\.authed\.spec\.ts/,
          },
        ]
      : []),
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
