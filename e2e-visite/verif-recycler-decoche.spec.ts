import { test, expect } from "@playwright/test";

// Vérif post-publish #582 (0 crédit — on ne génère rien) :
// 1) Recycler par défaut → AUCUNE case cochée.
// 2) ?format=stories → sous-mode Recycler ouvert direct, Stories seule cochée.
const boxState = (label: import("@playwright/test").Locator) =>
  label.locator('button[role="checkbox"]').getAttribute("data-state");

test("recycler : tout décoché par défaut", async ({ page }) => {
  await page.goto("/creer?mode=transform");
  await page.getByRole("button", { name: /Recycler/ }).first().click();
  const labels = ["Carrousel Instagram", "Script Reel", "Séquence Stories", "Post LinkedIn", "Email / Newsletter"];
  for (const l of labels) {
    const lab = page.locator("label", { hasText: l });
    await expect(lab).toBeVisible();
    expect(await boxState(lab), l).toBe("unchecked");
  }
  await expect(page.getByRole("button", { name: /^Recycler$/ })).toBeDisabled();
});

test("recycler : ?format=stories pré-coche Stories et ouvre le sous-mode", async ({ page }) => {
  await page.goto("/creer?mode=transform&format=stories");
  const stories = page.locator("label", { hasText: "Séquence Stories" });
  await expect(stories).toBeVisible({ timeout: 15_000 }); // sous-mode ouvert sans clic
  expect(await boxState(stories)).toBe("checked");
  expect(await boxState(page.locator("label", { hasText: "Carrousel Instagram" }))).toBe("unchecked");
  expect(await boxState(page.locator("label", { hasText: "Script Reel" }))).toBe("unchecked");
  await page.screenshot({ path: "e2e-visite/results/verif-recycler-format-stories.png" });
});
