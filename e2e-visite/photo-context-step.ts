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

/**
 * Même fenêtre, mais en la remplissant : une ligne par photo, puis « Créer mon
 * carrousel ». C'est ici que se décrivent les photos depuis que le champ « décris
 * tes photos » a quitté l'écran d'import (trois gros boutons, #1995, 14/11/2026).
 * Si la fenêtre ne s'ouvre pas (photos qui ont déjà leur contexte), on ne fait rien.
 * Rend true quand les lignes ont été remplies.
 */
export async function fillPhotoContextStep(page: Page, texts: string[]): Promise<boolean> {
  const dialog = page.getByTestId("photo-context-step");
  const shown = await dialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  if (!shown) {
    console.log("📝 « Que montre chaque photo ? » : fenêtre absente, photos envoyées sans description");
    return false;
  }
  for (let i = 0; i < texts.length; i++) {
    const line = dialog.locator(`#photo-ctx-${i}`);
    await expect(line, `ligne de la photo ${i + 1} dans « Que montre chaque photo ? »`).toBeVisible({ timeout: 5000 });
    await line.fill(texts[i]);
  }
  await dialog.getByRole("button", { name: /^Créer mon carrousel$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10000 });
  console.log(`📝 « Que montre chaque photo ? » : ${texts.length} ligne(s) remplie(s)`);
  return true;
}

/**
 * SONDE « fenêtre photos » (27/11/2026, accord de Laetitia). Depuis le 26/11, la fenêtre
 * « Que montre chaque photo ? » ne s'ouvre que s'il manque une description (retour de
 * Laetitia : « si c'est déjà écrit, ça ne sert à rien cette étape »). Si elle revient
 * alors que toutes ses lignes sont remplies, la sonde le dit.
 *
 * À appeler juste après « Générer », AVANT fill/skipPhotoContextStep (elle ne clique rien).
 * Lecture : ✅ pas ouverte, ou ouverte avec au moins une ligne vide ; 🟠 ouverte alors que
 * toutes les lignes sont déjà remplies (une seule fois suffit : c'est une régression).
 */
export async function probePhotoContextStep(page: Page): Promise<"absente" | "utile" | "inutile"> {
  const dialog = page.getByTestId("photo-context-step");
  const shown = await dialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  if (!shown) {
    console.log("🪟 Fenêtre photos : pas ouverte ✅");
    return "absente";
  }
  // Les légendes automatiques arrivent en quelques secondes : on leur laisse le temps.
  const lines = dialog.locator("input[id^='photo-ctx-']");
  const empties = async () => (await lines.evaluateAll((els) => els.filter((e) => !(e as HTMLInputElement).value.trim()).length));
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && (await empties()) > 0) await page.waitForTimeout(1000);
  const total = await lines.count(), vides = await empties();
  if (vides === 0) {
    console.log(`🪟 Fenêtre photos : 🟠 ouverte alors que les ${total} photo(s) sont déjà décrites (elle ne sert à rien)`);
    return "inutile";
  }
  console.log(`🪟 Fenêtre photos : ouverte, ${vides} description(s) manquante(s) sur ${total} ✅`);
  return "utile";
}
