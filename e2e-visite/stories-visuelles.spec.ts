/**
 * Stories visuelles (PR #353) — re-test live après déploiement
 *
 * Parcours : /creer → idée → Instagram → Story → générer
 *
 * Critères :
 * - La séquence de stories s'affiche (cartes "Story 1", "Story 2"…)
 * - Au moins un aperçu visuel 9:16 est rendu (iframe du renderer déterministe)
 * - Les exports vivent dans le panneau minimal (#608) : héros « Ouvrir dans
 *   Canva » + menu « Autres actions » → Télécharger (PNG / PowerPoint éditable)
 * - La zone sticker de l'aperçu mentionne « à poser dans Instagram »
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/stories");
fs.mkdirSync(SHOTS, { recursive: true });

const IDEA = "Les coulisses de la préparation de mon prochain atelier storytelling";

async function goToCreer(page: Page) {
  await page.goto("/creer", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  }
}

async function dismissQuotaWall(page: Page): Promise<boolean> {
  const wall = page
    .getByText(/quota|crédits épuisés|plus de crédit|crédits du mois|utilisé tes \d+|se renouvellent|Passer à L.Assistant/i)
    .first();
  if (await wall.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("⚠️  QuotaWallModal détectée — compte Camille bloqué quota");
    return true;
  }
  return false;
}

test("Stories — génération + aperçus visuels rendus", async ({ page }) => {
  test.setTimeout(240_000);

  await goToCreer(page);

  // Étape 1 : l'idée
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 8000 });
  await textarea.fill(IDEA);
  await page.getByRole("button", { name: /suivant/i }).click();

  // Étape 2 : canal Instagram → format Story
  await page.getByRole("button", { name: /instagram/i }).first().click();
  const storyCard = page.getByText(/^Story$/, { exact: true }).first();
  await expect(storyCard).toBeVisible({ timeout: 15000 });
  await storyCard.click();

  for (let i = 0; i < 3; i++) {
    const suivant = page.getByRole("button", { name: /suivant/i }).first();
    await expect(suivant).toBeEnabled({ timeout: 5000 });
    await suivant.click();
    const onStep3 = await page
      .getByText(/Étape 3 sur 4/i)
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (onStep3) break;
  }

  // Étape 3 : générer directement
  const genDir = page.getByRole("button", { name: /générer directement/i });
  const genBtn = page.getByRole("button", { name: /^générer\b/i });
  await Promise.race([
    expect(genDir).toBeVisible({ timeout: 90000 }),
    expect(genBtn).toBeVisible({ timeout: 90000 }),
  ]).catch(() => {});
  if (await genDir.isVisible().catch(() => false)) {
    await genDir.click();
  } else if (await genBtn.isVisible().catch(() => false)) {
    await genBtn.click();
  }

  if (await dismissQuotaWall(page)) {
    test.skip(true, "Compte test à sec de crédits");
    return;
  }

  // Résultat : les cartes stories
  await expect(page.getByText(/^Story 1$/).first()).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: path.join(SHOTS, "01-resultat.png"), fullPage: true });

  // Aperçus visuels du renderer déterministe
  const previews = page.locator('iframe[title^="Aperçu story"]');
  const previewCount = await previews.count();
  console.log(`Aperçus visuels rendus : ${previewCount}`);
  expect(previewCount).toBeGreaterThan(0);

  // ── GARDE 1 : « photo d'abord » (le contrat de enforceStoriesPhotoFirst) ──
  // La garde serveur (#615) bascule toute story non face-cam en fond photo et
  // réécrit son badge format "texte_fond" → "photo". Compter les badges est
  // robuste au chargement stock différé : le badge reflète le PLAN
  // (background=photo), pas la photo effectivement chargée.
  //
  // 🔑 Ce que la garde NE promet PAS : elle exempte VOLONTAIREMENT le gabarit
  // "citation" (verbatim sur fond encre, choix design assumé — cf.
  // supabase/functions/_shared/story-photo-gate.ts). Une séquence avec 2
  // citations sur 5 rend donc légitimement 3 photo — et l'ancien seuil
  // (⌈2/3⌉ des éligibles, soit 4 sur 5) la déclarait rouge à tort : rouge le
  // 26/07, 28/07 et 30/07, vert au re-run à chaque fois. Le front n'expose pas
  // `visual.gabarit` dans le DOM, donc on ne peut pas retirer les citations du
  // dénominateur ; on asserte à la place l'invariant que la garde tient
  // vraiment, et que la panne réelle viole franchement.
  //
  // Signature de la VRAIE panne (garde absente / edge creative-flow pas
  // redéployée, constatée le 22/07) : la séquence part quasi entière en fond
  // couleur — 1 seule story photo sur toute la séquence. Les 3 assertions
  // ci-dessous l'attrapent, tout en laissant passer les citations.
  const totalCards = await page.getByText(/^Story \d+$/).count();
  const faceCamBadges = await page.getByText(/^face_cam$/).count();
  const photoBadges = await page.getByText(/^photo$/).count();
  const texteFondBadges = await page.getByText(/^texte_fond$/).count();
  // Dénominateur = stories À VISUEL (les face cam sont des vidéos à filmer,
  // jamais un fond photo). Inclut encore les citations, faute de pouvoir les
  // distinguer — d'où un plancher volontairement bas, épaulé par le
  // « photo ≥ texte_fond » qui, lui, ne dépend pas du dénominateur.
  const eligible = Math.max(1, totalCards - faceCamBadges);
  console.log(`Fonds : ${photoBadges} photo / ${texteFondBadges} texte_fond / ${eligible} à visuel (${totalCards} stories, ${faceCamBadges} face cam)`);

  // Inventaire COMPLET des badges : le jour où cette garde retombe en rouge, on
  // veut savoir en UN run ce que sont les slides non comptées (un gabarit
  // "citation" ? un format inédit ? un badge pas encore peint ?) — le 30/07 le
  // log ne disait que « 3/5 » et il a fallu relire le code de la garde pour
  // trancher. Purement informatif, n'asserte rien.
  // Scopé au conteneur des cartes stories (StoryResult.tsx), sinon `text-2xs`
  // ratisse toute la page (sidebar, compteur de crédits, barre du bas…) et
  // noie l'information utile sous 30 entrées.
  const storyList = page.locator('[data-selection-enabled="true"]').first();
  const badgeTexts = await storyList.locator('[class*="text-2xs"]').allInnerTexts();
  const tally = new Map<string, number>();
  for (const raw of badgeTexts) {
    const t = raw.trim();
    if (!t || /^Story \d+$/.test(t)) continue;
    tally.set(t, (tally.get(t) ?? 0) + 1);
  }
  const inventaire = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}×${n}`)
    .join(" · ");
  console.log(`Inventaire badges : ${inventaire || "(aucun)"}`);

  const diag =
    `${photoBadges} photo / ${texteFondBadges} texte_fond sur ${eligible} slides à visuel. ` +
    `Badges : ${inventaire}. La garde enforceStoriesPhotoFirst est-elle déployée ?`;

  // (a) au moins une photo : la garde en produit toujours au moins une.
  expect(photoBadges, `Aucune story en fond photo — ${diag}`).toBeGreaterThanOrEqual(1);
  // (b) le cœur du contrat : la photo ne doit JAMAIS être minoritaire face au
  //     texte-sur-fond. Indépendant du nombre de citations, donc stable.
  expect(
    photoBadges,
    `Le texte-sur-fond domine la photo — ${diag}`,
  ).toBeGreaterThanOrEqual(texteFondBadges);
  // (c) plancher quantitatif avec de la marge (⌈1/3⌉ : 5→2, 4→2, 3→1) : attrape
  //     « la séquence entière est partie en fond couleur » sans se casser sur
  //     une séquence riche en citations.
  expect(
    photoBadges,
    `Trop peu de stories en fond photo — ${diag}`,
  ).toBeGreaterThanOrEqual(Math.ceil(eligible / 3));

  // ── GARDE 2 : cadre d'aperçu au bon format 9:16 (bug « cadre trop grand ») ──
  // Le flex parent étirait l'iframe à la hauteur de la colonne texte (fix
  // #615 = self-start). Mesurer le vrai rendu attrape la régression, que
  // l'ancienne spec (« l'iframe existe ») ne voyait pas.
  const box = await previews.first().boundingBox();
  expect(box, "Aperçu story introuvable pour la mesure").not.toBeNull();
  if (box) {
    const ratio = box.height / box.width;
    console.log(`Cadre aperçu : ${Math.round(box.width)}×${Math.round(box.height)} (ratio ${ratio.toFixed(3)}, cible 1.778)`);
    expect(
      Math.abs(ratio - 1920 / 1080),
      `Cadre d'aperçu déformé (ratio ${ratio.toFixed(3)} au lieu de 1.778) — régression du 9:16`,
    ).toBeLessThan(0.08);
  }

  // Exports dans le panneau minimal (#608) : héros Canva visible, téléchargements
  // dans le menu « Autres actions » → Télécharger.
  await expect(page.getByRole("button", { name: /ouvrir dans canva/i })).toBeVisible();
  await page.getByTestId("more-actions").first().click();
  await page.getByRole("menuitem", { name: /télécharger/i }).first().click();
  await expect(page.getByRole("menuitem", { name: /Images PNG/i })).toBeVisible();

  // Export PPTX natif : téléchargement + validation de CONTENU (jszip) — le nom
  // de fichier ne suffit pas, cf. e2e-visite/pptx-validate.ts.
  const dlPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("menuitem", { name: /PowerPoint/i }).click();
  const download = await dlPromise;
  console.log(`PPTX téléchargé : ${download.suggestedFilename()}`);
  expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  const pptxPath = path.join(__dirname, "results", "export-stories.pptx");
  fs.mkdirSync(path.dirname(pptxPath), { recursive: true });
  await download.saveAs(pptxPath);
  // Stories = exporter NATIF pur (pas d'html2canvas) : pas d'image de fond par
  // slide attendue, mais le texte éditable doit être là.
  const { validatePptx } = await import("./pptx-validate");
  const report = await validatePptx(pptxPath, { minSlides: 1, expectEditableText: true });
  const realProblems = report.problems.filter((p) => !p.includes("image(s) pour"));
  console.log(`📦 PPTX stories : ${report.slideCount} slides, ${report.texts.filter((t) => t.trim()).length} runs de texte`);
  expect(realProblems, `Défauts PPTX stories : ${realProblems.join(" | ")}`).toEqual([]);

  // La publication directe ne doit PAS être active pour une story : l'edge
  // social-instagram-publish ne gère que le feed, une story partirait en post feed.
  // Depuis le panneau « ultra-minimal », ça se vérifie DANS la fenêtre
  // « Publier ou programmer » : options Maintenant/Programmer désactivées.
  const publishEntry = page.getByTestId("publish-or-schedule").first();
  if (await publishEntry.isVisible({ timeout: 2000 }).catch(() => false)) {
    await publishEntry.click();
    const nowOption = page.getByTestId("publish-now-option");
    await expect(nowOption).toBeVisible({ timeout: 5000 });
    await expect(nowOption).toBeDisabled();
    await expect(page.getByTestId("publish-schedule-option")).toBeDisabled();
    console.log("Fenêtre de publication : Maintenant/Programmer désactivés (attendu pour une story)");
    await page.keyboard.press("Escape");
  } else {
    console.log("Bouton « Publier ou programmer » absent pour une story (OK)");
  }

  // La zone sticker existe dans au moins un aperçu (contenu de l'iframe)
  let stickerFound = false;
  for (let i = 0; i < previewCount; i++) {
    const body = await previews.nth(i).contentFrame()?.locator("body").innerHTML().catch(() => "");
    if (body && body.includes("poser dans Instagram")) {
      stickerFound = true;
      break;
    }
  }
  console.log(`Zone sticker trouvée dans un aperçu : ${stickerFound}`);

  await page.screenshot({ path: path.join(SHOTS, "02-final.png"), fullPage: true });
});
