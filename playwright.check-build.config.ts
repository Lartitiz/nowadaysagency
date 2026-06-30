import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e-visite",
  testMatch: "check-build.spec.ts",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4174",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "smoke",
      use: { browserName: "chromium" },
    },
  ],
});
