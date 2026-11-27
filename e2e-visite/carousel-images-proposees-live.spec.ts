/**
 * Carrousel « Tes photos en fond » écrit SANS photo : une image est proposée
 * d'office sur chaque slide (26/11/2026, src/lib/carousel-photo-proposals.ts).
 *
 * Le texte s'affiche d'abord ; l'écran demande ensuite carousel-photo-proposals
 * (bibliothèque, sinon photo libre de droit vérifiée) et pose les images. On
 * vérifie que la fonction répond, qu'au moins une image est posée et marquée
 * « Proposée », et que rien ne reste affiché en anglais sous le texte.
 *
 * Coût réel ~1 crédit → lundi uniquement, ou VISITE_PAYANTE=1. Desktop.
 */

import { test, expect } from "./test-propre";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { autoOpenReadyCarousel } from "./carousel-ready";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/carousel-images-proposees");
fs.mkdirSync(SHOTS, { recursive: true });

const SUJET = "Pourquoi je fabrique mes savons à froid : ce que ça change pour la peau, le temps que ça demande et ce que j'ai dû apprendre";

test("carrousel sans photo : des images sont proposées d'office", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût réel)");
  test.setTimeout(900_000);

  let proposals: { status: number; body: any } | null = null;
  let appels = 0;
  page.on("response", async (res) => {
    if (!res.url().includes("/functions/v1/")) return;
    const name = res.url().split("/functions/v1/")[1].split("?")[0];
    console.log(`⏱️ ${name} → ${res.status()}`);
    if (name === "carousel-photo-proposals" && res.request().method() === "POST") {
      appels++;
      const reponse = { status: res.status(), body: await res.json().catch(() => null) };
      // La première réponse est celle du carrousel ; les suivantes viennent de « Une autre ».
      if (!proposals) proposals = reponse;
      else console.log(`🧾 reçu « Une autre » : ${JSON.stringify(reponse.body?.receipt || {}).slice(0, 500)}`);
    }
  });

  // Essai de la sonde contre l'ancien comportement : SONDE_SANS_PROPOSITIONS=1 coupe
  // la fonction (comme avant le 26/11/2026) ; la ligne 🖼️ doit alors passer au 🟠.
  if (process.env.SONDE_SANS_PROPOSITIONS) await page.route("**/functions/v1/carousel-photo-proposals", (r) => r.abort());

  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  const textarea = page.locator("#creation-idea").or(page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager|nouveauté|coulisses/i)).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(SUJET);
  await page.getByRole("button", { name: /^(suivant|continuer)$/i }).click();

  await page.getByRole("button", { name: /instagram/i }).first().click();
  const carrouselCard = page.getByText(/^Carrousel$/, { exact: true }).first();
  await expect(carrouselCard).toBeVisible({ timeout: 15000 });
  await carrouselCard.click();
  const fond = page.getByText(/Tes photos en fond/i).first();
  await expect(fond).toBeVisible({ timeout: 10000 });
  await fond.click();
  await page.screenshot({ path: path.join(SHOTS, "1-format.png") });

  // Aucune photo importée : on avance jusqu'à la génération.
  for (let i = 0; i < 4; i++) {
    const suivant = page.getByRole("button", { name: /^(suivant|continuer)$/i }).first();
    await expect(suivant).toBeEnabled({ timeout: 8000 });
    await suivant.click();
    const onStep3 = await page.getByText(/Étape 3 sur 4/i).first()
      .waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    if (onStep3) break;
  }
  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });
  await Promise.race([
    expect(genDir).toBeVisible({ timeout: 120000 }),
    expect(genBtn).toBeVisible({ timeout: 120000 }),
  ]).catch(() => {});
  if (await genDir.isVisible().catch(() => false)) await genDir.click();
  else await genBtn.click();
  console.log("🚀 Générer cliqué");

  autoOpenReadyCarousel(page);
  const result = page.getByTestId("publish-or-schedule").first();
  await expect(result, "le carrousel ne s'est pas affiché").toBeVisible({ timeout: 780_000 });
  await page.screenshot({ path: path.join(SHOTS, "2-texte-affiche.png"), fullPage: true, timeout: 30000 });
  const aChoisirAvant = await page.getByText(/^Image à choisir$/).count();
  const recherche = await page.getByText(/On te cherche une image/i).count();
  console.log(`📝 texte affiché : ${recherche} slide(s) en recherche, ${aChoisirAvant} « Image à choisir »`);

  // La recherche se fait en arrière-plan : on attend la réponse puis la fin de l'attente.
  // Sans lever d'erreur ici : la ligne 🖼️ doit s'écrire même si la fonction est en panne.
  await expect.poll(() => proposals?.status ?? 0, { timeout: 150_000 }).toBeGreaterThan(0).catch(() => {});
  await expect(page.getByText(/On te cherche une image/i)).toHaveCount(0, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const receipt = (proposals as any)?.body?.receipt || {};
  console.log(`🧾 reçu : ${JSON.stringify(receipt).slice(0, 1200)}`);
  const posees = await page.locator('img[alt^="Photo "]').count();
  const aChoisir = await page.getByText(/^Image à choisir$/).count();
  const proposees = await page.getByText(/^Proposée/).count();
  const autres = await page.getByRole("button", { name: /^Une autre$/ }).count();
  // 🖼️ Images proposées : ✅ si au moins une image posée, 🟠 si toutes les slides restent à choisir.
  const cibles = await page.getByText(/^🎯/).count();
  console.log(`🎯 Ligne « image visée » sous une photo proposée : ${cibles}`);
  const notesPhoto = await page.getByText(/^💡.*\b(photos?|images?|visuels?)\b/i).count();
  console.log(`💡 Note qui parle de la photo, sous une photo proposée : ${notesPhoto}`);
  if (aChoisir === 0) expect(notesPhoto, "la note 💡 parle de la photo visée, pas de la photo posée").toBe(0);
  if (aChoisir === 0) expect(cibles, "la ligne 🎯 décrit l'image visée, pas la photo posée").toBe(0);
  const reponse = (proposals as any)?.status ?? "aucune réponse";
  console.log(`🖼️ Images proposées : ${posees > 0 ? "✅" : "🟠"} fonction ${reponse}, ${posees} posée(s) dont ${proposees} marquée(s) « Proposée », ${aChoisir} à choisir, ${autres} bouton(s) « Une autre »`);
  // 🚫 Une requête écartée d'office (mot refusé) = un essai perdu, souvent une image neutre à la place.
  const refusees = Object.keys(receipt.refused_queries || {}).length;
  console.log(`🚫 Recherches refusées d'office : ${refusees === 0 ? "✅" : "🟠"} ${refusees} sur ${(receipt.requested || []).length} slide(s)`);
  // 🔁 Chaque photo libre de droit posée garde son bouton « Une autre », réserve vide ou non.
  const libres = (receipt.stock || []).length;
  console.log(`🔁 Bouton « Une autre » : ${autres >= libres ? "✅" : "🟠"} ${autres} pour ${libres} photo(s) libre(s) de droit`);
  await page.screenshot({ path: path.join(SHOTS, "3-images-proposees.png"), fullPage: true, timeout: 30000 });

  expect(reponse, "carousel-photo-proposals n'a pas répondu 200").toBe(200);
  expect(posees, "aucune image posée d'office").toBeGreaterThan(0);
  expect(autres, "une photo libre de droit proposée n'a pas son bouton « Une autre »").toBeGreaterThanOrEqual(libres);
  expect(proposees, "les images posées ne sont pas marquées « Proposée »").toBe(posees);
  // Plus de texte de slide recopié en « image idéale », ni de position en anglais.
  await expect(page.getByText(/Une image qui accompagne ce passage/i)).toHaveCount(0);
  await expect(page.getByText(/^(top|bottom|center|middle)([ _-](left|right|center))?$/i)).toHaveCount(0);

  // Images proposées par l'app : les visuels attendent le clic (26/11/2026), le temps de changer une image.
  await page.waitForTimeout(8000);
  await expect(page.getByRole("heading", { name: /Personnaliser mon carrousel/i }), "les visuels se sont créés tout seuls").toHaveCount(0);
  await expect(page.getByText(/Analyse de la charte graphique/i), "les visuels se créent tout seuls").toHaveCount(0);

  // « Une autre » : la photo de la slide change, sans erreur.
  const autre = page.getByRole("button", { name: /^Une autre$/ }).first();
  if (await autre.isVisible().catch(() => false)) {
    const srcs = () => page.locator('img[alt^="Photo "]').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src.slice(-60)).join("|"));
    const avant = await srcs();
    await autre.click();
    await expect.poll(srcs, { timeout: 30_000, message: "« Une autre » n'a pas changé la photo" }).not.toBe(avant);
    await expect(page.getByText(/n'a pas pu être chargée/i)).toHaveCount(0);
    console.log("🔁 « Une autre » : photo changée");
    await page.screenshot({ path: path.join(SHOTS, "4-une-autre.png"), fullPage: true, timeout: 30000 });
    // Réserve vidée (3 clics au plus) : le bouton reste, et le clic suivant redemande des photos au serveur.
    for (let i = 0; i < 3 && appels < 2; i++) {
      await expect(autre, "le bouton « Une autre » a disparu").toBeVisible();
      await expect(autre).toBeEnabled({ timeout: 90_000 });
      await autre.click();
      await expect(autre).toBeEnabled({ timeout: 90_000 });
    }
    await expect(autre, "le bouton « Une autre » a disparu une fois la réserve vide").toBeVisible();
    console.log(`🔁 « Une autre », réserve vide : ${appels >= 2 ? "✅ nouvelles photos demandées au serveur" : "🟠 aucune nouvelle demande"}, photo ${(await srcs()) !== avant ? "changée" : "inchangée"}`);
  }
  await page.close();
});
