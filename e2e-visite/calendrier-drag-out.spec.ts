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

/** Drag manuel compatible dnd-kit PointerSensor (activation distance 8px).
 * `offset` décale le point de drop par rapport au centre de la cible. */
async function dragTo(page: Page, source: Locator, target: Locator, offset?: { dx?: number; dy?: number }) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("boundingBox introuvable pour le drag");
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2 + (offset?.dx ?? 0), y: to.y + to.height / 2 + (offset?.dy ?? 0) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Dépasse la contrainte d'activation puis avance par étapes pour que
  // la détection de collision suive le pointeur.
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

/** Occurrence du titre située DANS LA GRILLE calendrier (à gauche du panneau).
 * `getByText(TITLE).nth(1)` devenait ambigu : l'ordre DOM grille/panneau n'est
 * pas garanti, et un mauvais tirage fait glisser la CARTE DU PANNEAU sur
 * elle-même (aucun toast, échec 10 s plus loin). Frontière géométrique = bord
 * gauche de l'EN-TÊTE du panneau (le div `flex flex-col h-full` scope bien les
 * locators mais sa boundingBox ne reflète pas le panneau visuel). */
async function gridOccurrence(page: Page, panelHeading: Locator, title: string): Promise<Locator> {
  const headBox = await panelHeading.boundingBox();
  if (!headBox) throw new Error("boundingBox de l'en-tête panneau introuvable");
  const all = page.getByText(title);
  const n = await all.count();
  for (let i = 0; i < n; i++) {
    const box = await all.nth(i).boundingBox();
    if (box && box.x + box.width / 2 < headBox.x) return all.nth(i);
  }
  throw new Error(`« ${title} » introuvable dans la grille calendrier (${n} occurrence(s), toutes dans le panneau)`);
}

/** Une cellule jour où l'on peut déposer SANS déclencher l'auto-scroll de dnd-kit.
 * Piège vécu le 01/08/2026 : le jour était codé en dur (28). Sur un mois affiché
 * sur 6 semaines (août 2026 commence un samedi), le 28 tombait à 14 px du bord bas
 * du viewport 900 px — dnd-kit auto-scrolle quand le pointeur approche du bord, la
 * grille glissait sous le curseur et le post atterrissait UNE LIGNE plus bas
 * (2026-09-04 au lieu du 28/08), invisible là où le test le cherchait. On choisit
 * donc le premier jour dont le repère reste à distance des deux bords. */
async function safeDayCell(page: Page): Promise<Locator> {
  const vh = page.viewportSize()?.height ?? 900;
  for (const day of ["12", "13", "11", "19", "20", "18", "5", "6", "7"]) {
    const cell = page.locator("div").filter({ hasText: new RegExp(`^${day}$`) }).last();
    const box = await cell.boundingBox().catch(() => null);
    if (box && box.y > 140 && box.y + box.height < vh - 180) return cell;
  }
  throw new Error("aucune cellule jour hors des bords (zone d'auto-scroll) dans la grille");
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

    // 1) Idée → un jour du mois affiché, choisi hors des bords (cf. safeDayCell)
    const dayCell = await safeDayCell(page);
    await dragTo(page, ideaCard, dayCell);
    await expect(page.getByText(/planifié !/i).first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOTS, "02-planifie.png") });

    // Le post apparaît dans la grille (hors panneau) et l'idée est marquée planifiée
    await expect(async () => {
      await gridOccurrence(page, panelHeading, IDEA_TITLE);
    }).toPass({ timeout: 10_000 });
    // Scopé à LA carte de ce run : des idées résiduelles d'anciens runs peuvent
    // porter leur propre badge « Planifiée » dans le panneau.
    const myCard = panel.locator("div.rounded-lg", { hasText: IDEA_TITLE }).first();
    await expect(myCard.getByText("📅 Planifiée")).toBeVisible({ timeout: 8_000 });

    // 2) Post → panneau idées (le geste corrigé par #330). Point de drop =
    // 220px SOUS l'en-tête (zone des cartes) : le drop sur l'en-tête lui-même
    // retombe parfois sur une cellule jour (post DÉPLACÉ au lieu d'être
    // déprogrammé — observé : atterrissage sur « aujourd'hui »), le drop au
    // cœur du panneau est fiable (indicateur « Remettre en idée » vérifié).
    const gridPill = await gridOccurrence(page, panelHeading, IDEA_TITLE);
    await dragTo(page, gridPill, panelHeading, { dy: 220 });
    await expect(page.getByText("Remis en idée !").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOTS, "03-deprogramme.png") });

    // Pas de doublon : une seule occurrence du titre (l'idée, plus de pill),
    // et le badge « Planifiée » a disparu — sur LA carte de ce run uniquement.
    await expect(page.getByText(IDEA_TITLE)).toHaveCount(1, { timeout: 10_000 });
    await expect(myCard.getByText("📅 Planifiée")).toHaveCount(0);

    // Nettoyage : supprimer l'idée de test via « Ma boîte à idées » (le ✗ des
    // cartes — la sheet du panneau calendrier n'a PAS de bouton Supprimer).
    // Sans ça, chaque run laisse une « QA drag 330 … » sur le compte Camille
    // (11 accumulées le 05/07) et un run raté peut même laisser un post errant
    // sur la grille — le drop raté atterrit sur le jour le plus proche du panneau.
    try {
      await page.getByText("Mes idées", { exact: true }).first().click();
      const title = page.getByText(IDEA_TITLE).first();
      await title.waitFor({ timeout: 8_000 });
      const tb = await title.boundingBox();
      if (!tb) throw new Error("carte introuvable");
      // le ✗ de la carte : petit bouton en haut à droite, au-dessus du titre
      const buttons = page.locator("button");
      const nb = await buttons.count();
      let xBtn: Locator | null = null;
      for (let i = 0; i < nb; i++) {
        const b = await buttons.nth(i).boundingBox().catch(() => null);
        if (b && b.width < 40 && b.height < 40 && b.x > tb.x + 500 && b.y > tb.y - 70 && b.y < tb.y + 5) {
          xBtn = buttons.nth(i);
          break;
        }
      }
      if (!xBtn) throw new Error("✗ de la carte introuvable");
      await xBtn.click();
      const confirmBtn = page.getByRole("button", { name: /supprimer/i }).last();
      if (await confirmBtn.isVisible({ timeout: 1_500 }).catch(() => false)) await confirmBtn.click();
      await expect(page.getByText(IDEA_TITLE)).toHaveCount(0, { timeout: 8_000 });
      console.log("🧹 idée de test supprimée");
    } catch {
      console.log(`⚠️  nettoyage incomplet : l'idée « ${IDEA_TITLE} » reste dans la boîte à idées`);
    }
  });
});
