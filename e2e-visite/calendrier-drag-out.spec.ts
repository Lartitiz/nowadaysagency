/**
 * Calendrier — drag & drop aller-retour panneau idées (PR #330)
 *
 * Parcours : /calendrier → créer une idée de test dans le panneau
 *            → la glisser sur un jour (planifier)
 *            → re-glisser le post créé vers le panneau (déprogrammer)
 *
 * Critères couverts :
 * - Le drop d'une idée sur un jour crée le post (toast « planifié ! »)
 * - Le drop d'un post sur le panneau le remet en idée (toast « Remis en idée ! »)
 *   — c'était impossible avant #330 (collision closestCenter inatteignable)
 * - Pas de doublon : une seule idée porte ce titre à la fin (réutilisation
 *   de l'idée liée au lieu d'une insertion)
 *
 * Desktop uniquement : le panneau n'est pas dans le DndContext en mobile.
 * Le test crée sa propre idée (le compte Camille peut avoir un panneau vide) ;
 * elle reste en fin de run, non planifiée — sans impact sur les autres specs.
 */

import { test, expect, Page, Locator } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/calendrier-drag");
fs.mkdirSync(SHOTS, { recursive: true });

const IDEA_TITLE = `QA drag 330 ${Date.now().toString().slice(-6)}`;

/** Drag manuel compatible dnd-kit PointerSensor (activation distance 8px). */
async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("boundingBox introuvable pour le drag");
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Dépasse la contrainte d'activation puis avance par étapes pour que
  // la détection de collision suive le pointeur.
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

test.describe("Drag & drop calendrier ↔ panneau idées", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  test("planifier une idée puis la déprogrammer par glisser-déposer", async ({ page }) => {
    await page.goto("/calendrier", { waitUntil: "networkidle" });

    // Panneau idées ouvert (le déplier s'il est replié)
    const foldedBtn = page.getByRole("button", { name: /ouvrir le panneau/i });
    if (await foldedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await foldedBtn.click();
    }
    const panelHeading = page.getByText("Glisser une idée sur le calendrier").first();
    await expect(panelHeading).toBeVisible({ timeout: 10_000 });
    const panel = page.locator("div.flex.flex-col.h-full", { has: panelHeading }).first();

    // Créer une idée de test dédiée (panneau possiblement vide sur Camille)
    await panel.getByText("+ Ajouter une idée").click();
    await page.getByPlaceholder("Mon idée de contenu...").fill(IDEA_TITLE);
    await page.getByRole("button", { name: "Ajouter l'idée" }).click();
    await expect(page.getByText("Idée ajoutée !").first()).toBeVisible({ timeout: 8_000 });
    const ideaCard = panel.getByText(IDEA_TITLE).first();
    await expect(ideaCard).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(SHOTS, "01-idee-creee.png") });

    // 1) Idée → jour 28 du mois affiché
    const dayCell = page.locator("div").filter({ hasText: /^28$/ }).last();
    await dragTo(page, ideaCard, dayCell);
    await expect(page.getByText(/planifié !/i).first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOTS, "02-planifie.png") });

    // Le post apparaît dans la grille (hors panneau) et l'idée est marquée planifiée
    const pill = page.getByText(IDEA_TITLE).nth(1).or(page.getByText(IDEA_TITLE.slice(0, 15)).nth(1));
    await expect(pill.first()).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText("📅 Planifiée").first()).toBeVisible({ timeout: 8_000 });

    // 2) Post → panneau idées (le geste corrigé par #330)
    const gridPill = page.getByText(IDEA_TITLE).nth(1);
    await dragTo(page, gridPill, panelHeading);
    await expect(page.getByText("Remis en idée !").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOTS, "03-deprogramme.png") });

    // Pas de doublon : une seule occurrence du titre (l'idée, plus de pill),
    // et le badge « Planifiée » a disparu
    await expect(page.getByText(IDEA_TITLE)).toHaveCount(1, { timeout: 10_000 });
    await expect(panel.getByText("📅 Planifiée")).toHaveCount(0);
  });
});
