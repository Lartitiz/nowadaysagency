/**
 * « Que montre chaque photo ? » (#1876, 12/11/2026) : avant un carrousel photo
 * (« Tes photos en fond ») ou mixte dont une photo n'a pas de contexte, une
 * fenêtre s'ouvre après le clic « Générer » et la création attend. « Passer »
 * relance la création telle quelle (même requête qu'avant cette fenêtre). Sans
 * ce clic, le résultat n'arrive jamais (contenus figés mixte : 13 min d'attente).
 * « Photos brutes » ne passe pas par cette fenêtre : la fonction ne fait rien.
 */
import { expect, type Page } from "@playwright/test";

export async function skipPhotoContextStep(page: Page) {
  const dialog = page.getByTestId("photo-context-step");
  const shown = await dialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  if (!shown) return;
  await dialog.getByRole("button", { name: /^Passer$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10000 });
  console.log("📝 « Que montre chaque photo ? » : Passer");
}
