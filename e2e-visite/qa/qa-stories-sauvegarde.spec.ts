/**
 * QA chantier 1 stories (12/11/2026) : enregistrement automatique + reprise.
 * Crée une séquence (1 crédit, compte Camille), la retouche, vérifie
 * l'encadré d'enregistrement, puis, dans un NOUVEL onglet (sans la mémoire de
 * l'onglet), retrouve la séquence dans Mes idées avec la retouche.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/qa-stories");
fs.mkdirSync(SHOTS, { recursive: true });
const STAMP = String(Date.now()).slice(-5);
const IDEA = `Les coulisses de la fabrication de mon prochain savon ${STAMP}`;
const MARK = `QA-SAUVE-${STAMP}`;

test("Stories : la retouche est enregistrée et se retrouve dans Mes idées", async ({ page, context }) => {
  test.setTimeout(360_000);
  const log = (k: string, v: unknown) => console.log(`[qa] ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const textarea = page.locator("#creation-idea").or(page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager|nouveauté|coulisses/i)).first();
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill(IDEA);
  await page.getByRole("button", { name: /^(suivant|continuer)$/i }).click();
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const storyCard = page.getByText(/^Story$/, { exact: true }).first();
  await expect(storyCard).toBeVisible({ timeout: 15000 });
  await storyCard.click();
  for (let i = 0; i < 3; i++) {
    const s = page.getByRole("button", { name: /^(suivant|continuer)$/i }).first();
    if (!(await s.isVisible().catch(() => false))) break;
    await s.click().catch(() => {});
    if (await page.getByText(/Étape 3 sur 4/i).first().isVisible({ timeout: 4000 }).catch(() => false)) break;
  }
  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });
  await Promise.race([genDir.waitFor({ timeout: 90000 }), genBtn.waitFor({ timeout: 90000 })]).catch(() => {});
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();
  await expect(page.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 180_000 });

  // Encadré d'enregistrement + « Enregistré dans Mes idées »
  const status = page.getByLabel("Sauvegarde automatique");
  await expect(status).toBeVisible({ timeout: 20000 });
  await expect(status).toContainText(/Tout est enregistré/, { timeout: 30000 });
  log("lien « Enregistré dans Mes idées »", await page.getByTestId("auto-saved-to-ideas").count());

  const field = page.getByLabel(/Texte complet de la story|Texte de la story/i).first();
  const before = await field.inputValue();
  await field.fill(`${MARK} ${before}`);
  await expect(status).toContainText(/Tout est enregistré/, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, "sauve-01-enregistre.png"), fullPage: false });
  log("statut après retouche", await status.innerText());

  // Nouvel onglet : pas de mémoire d'onglet, seulement la base.
  const other = await context.newPage();
  await other.goto("/idees", { waitUntil: "networkidle" });
  const card = other.getByText(STAMP).first();
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.click();
  const open = other.getByRole("button", { name: /Ouvrir l.éditeur/i }).first();
  await expect(open).toBeVisible({ timeout: 10000 });
  await open.click();
  await expect(other.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 30000 });
  const reopened = other.getByLabel(/Texte complet de la story|Texte de la story/i).first();
  await expect(reopened).toHaveValue(new RegExp(MARK), { timeout: 15000 });
  await other.screenshot({ path: path.join(SHOTS, "sauve-02-rouvert.png"), fullPage: false });
  log("retrouvée dans Mes idées avec la retouche", true);
});
