/**
 * QA chantier 1 stories (12/11/2026), suite sans crédit : reprend la séquence
 * de qa-stories-sauvegarde (STAMP en variable d'env), regarde l'état de
 * l'encadré après réouverture, met au calendrier, puis « Modifier les stories ».
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/qa-stories");
const STAMP = process.env.QA_STAMP || "47470";

test("Stories : réouverture, calendrier, Modifier les stories", async ({ page }) => {
  test.setTimeout(300_000);
  const log = (k: string, v: unknown) => console.log(`[qa] ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  await page.goto("/idees", { waitUntil: "networkidle" });
  await page.getByText(STAMP).first().click();
  await page.getByRole("button", { name: /Ouvrir l.éditeur/i }).first().click();
  await expect(page.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 30000 });
  const status = page.getByLabel("Sauvegarde automatique");
  for (const s of [2, 6, 12]) {
    await page.waitForTimeout(s === 2 ? 2000 : 4000);
    log(`encadré à ~${s}s`, (await status.innerText().catch(() => "(absent)")).split("\n")[0]);
  }
  const dialogs = await page.getByRole("dialog").allInnerTexts();
  log("fenêtres ouvertes", dialogs.map((d) => d.slice(0, 120)));
  await page.screenshot({ path: path.join(SHOTS, "cal-01-reouvert.png") });

  // Mettre au calendrier
  await page.getByRole("button", { name: /Mettre au calendrier/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, "cal-02-fenetre.png") });
  const dlg = page.getByRole("dialog").last();
  log("fenêtre calendrier", (await dlg.innerText().catch(() => "")).slice(0, 300));
  const confirm = dlg.getByRole("button", { name: /calendrier|Enregistrer|Planifier|Ajouter/i }).last();
  log("bouton de confirmation", await confirm.innerText().catch(() => "(aucun)"));
  await confirm.click();
  await page.getByRole("button", { name: /Enregistrer le brouillon/i }).click();
  await page.waitForURL(/calendrier/, { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(SHOTS, "cal-03-calendrier.png") });
  log("adresse calendrier", page.url());

  const edit = page.getByRole("button", { name: /Modifier les stories/i }).first();
  await expect(edit).toBeVisible({ timeout: 20000 });
  await edit.click();
  await expect(page.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 30000 });
  const field = page.getByLabel(/Texte complet de la story|Texte de la story/i).first();
  log("texte rouvert depuis le calendrier contient la retouche", (await field.inputValue()).includes(`QA-SAUVE-${STAMP}`));
  await field.fill(`CAL-${STAMP} ${await field.inputValue()}`);
  await page.waitForTimeout(12000);
  log("encadré après retouche depuis le calendrier", await status.innerText().catch(() => "(absent)"));
  await page.screenshot({ path: path.join(SHOTS, "cal-04-retouche.png") });
});
