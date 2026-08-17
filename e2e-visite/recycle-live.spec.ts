/**
 * Recyclage réel de bout en bout — `handleRecycleStep` de creative-flow, le plus
 * gros morceau extrait par la PR #777 (pipeline PARALLÈLE par format, garde
 * rédactionnelle dédiée sur le carrousel structuré), jamais exercé en live
 * depuis le refactor. La seule spec existante (verif-recycler-decoche) vérifie
 * les cases à cocher à 0 crédit, pas la génération.
 *
 * Parcours : /creer?mode=transform → Recycler → coller un texte source →
 * cocher 3 formats (Carrousel Instagram, Post LinkedIn, Email / Newsletter :
 * couvre la branche carrousel STRUCTURÉE {slides, caption} + deux formats
 * texte du pipeline parallèle) → Recycler → onglets de résultats.
 *
 * Vérifie :
 *  - chaque format coché revient dans un onglet avec un contenu substantiel,
 *  - le carrousel est bien la version structurée aplatie (Slide N · titre +
 *    séparateur Légende), preuve que l'objet {slides, caption} a survécu au
 *    pipeline ET à la garde rédactionnelle,
 *  - pas de toast « Génération partielle » (failed_formats vide).
 *
 * Coût ~2-3 crédits → à la demande uniquement : FORCE_RECYCLE_LIVE=1.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/recycle-live");
fs.mkdirSync(SHOTS, { recursive: true });

// Source réaliste (~1200 car.) alignée sur l'activité du compte test Camille :
// assez de matière pour nourrir 3 formats sans approcher la limite des 10 000.
const SOURCE = `La saponification à froid, c'est la méthode que j'ai choisie dès le début pour fabriquer tous mes savons, et ce n'est pas un hasard.

Contrairement aux savons industriels fabriqués à chaud en quelques heures, un savon saponifié à froid demande quatre semaines de cure. Pendant ce temps, la réaction chimique entre les huiles et la soude se termine doucement, à température ambiante. Résultat : la glycérine produite naturellement pendant la réaction reste dans le savon, au lieu d'être retirée et revendue comme sous-produit.

C'est cette glycérine qui change tout pour ta peau. Elle attire l'humidité et la retient : le savon nettoie sans décaper. Les personnes qui me disent « je ne peux pas utiliser de savon, ça m'assèche » parlent en fait du savon industriel.

Et pour la planète ? Pas de cuisson longue donc très peu d'énergie, des huiles végétales locales et bio, zéro emballage plastique. Un savon solide remplace deux à trois flacons de gel douche.

Choisir un savon à froid, ce n'est pas un geste de niche. C'est revenir à un produit simple, fabriqué lentement, qui respecte ta peau et le vivant.`;

// Les 3 formats cochés : carrousel = branche structurée + garde rédactionnelle,
// LinkedIn + Newsletter = deux chemins texte du pipeline parallèle.
const FORMATS = ["Carrousel Instagram", "Post LinkedIn", "Email / Newsletter"];

test("recyclage réel : 3 formats cochés → chaque onglet revient rempli", async ({ page, viewport }) => {
  test.skip(!process.env.FORCE_RECYCLE_LIVE, "à la demande uniquement (coût ~2-3 crédits) : FORCE_RECYCLE_LIVE=1");
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût réel)");
  test.setTimeout(600_000);

  page.on("response", (res) => {
    if (res.url().includes("/functions/v1/")) {
      console.log(`⏱️ ${res.url().split("/functions/v1/")[1].split("?")[0]} → ${res.status()}`);
    }
  });
  // Le résultat PARTIEL (failed_formats) passe par un toast warning : on le
  // capture au vol, il aura disparu au moment des assertions finales.
  let generationPartielle: string | null = null;

  await page.goto("/creer?mode=transform", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Recycler/ }).first().click();

  // Texte source
  const sourceBox = page.getByPlaceholder(/Colle ton contenu ici/i).first();
  await expect(sourceBox).toBeVisible({ timeout: 15000 });
  await sourceBox.fill(SOURCE);

  // Cocher les 3 formats
  for (const label of FORMATS) {
    const lab = page.locator("label", { hasText: label });
    await expect(lab).toBeVisible();
    await lab.locator('button[role="checkbox"]').click();
    expect(await lab.locator('button[role="checkbox"]').getAttribute("data-state"), label).toBe("checked");
  }
  await page.screenshot({ path: path.join(SHOTS, "recycle-1-brief.png"), fullPage: true });

  const recyclerBtn = page.getByRole("button", { name: /^Recycler$/ });
  await expect(recyclerBtn).toBeEnabled();
  await recyclerBtn.click();
  console.log("🚀 Recyclage lancé (3 formats)");

  // Toast « Génération partielle » = un format retombé après 2 essais.
  page
    .getByText(/Génération partielle/i)
    .first()
    .waitFor({ state: "visible", timeout: 300_000 })
    .then(async () => {
      generationPartielle =
        (await page.getByText(/n'a pas pu être généré/i).first().textContent().catch(() => "")) ?? "vu";
    })
    .catch(() => {});

  // Fin = les onglets de résultats (ou le toast d'échec total). Timeout front
  // invokeWithTimeout = 120 s ; on prend large pour absorber le réseau.
  const premierOnglet = page.getByRole("button", { name: FORMATS[0] });
  const echecTotal = page.getByText(/Génération incomplète/i).first();
  await Promise.race([
    premierOnglet.waitFor({ state: "visible", timeout: 300_000 }),
    echecTotal.waitFor({ state: "visible", timeout: 300_000 }),
  ]);
  if (await echecTotal.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "recycle-ECHEC.png"), fullPage: true });
    throw new Error("Recyclage : aucun format généré (data.results vide)");
  }

  // Chaque format coché doit avoir son onglet ET un contenu substantiel.
  const bilan: string[] = [];
  for (const label of FORMATS) {
    const onglet = page.getByRole("button", { name: label });
    await expect(onglet, `onglet manquant : ${label}`).toBeVisible();
    await onglet.click();
    const contenu = (await page.locator("pre").first().textContent().catch(() => "")) ?? "";
    expect(contenu.trim().length, `contenu vide ou squelettique pour ${label}`).toBeGreaterThan(200);
    bilan.push(`${label} : ${contenu.trim().length} car.`);

    if (label === "Carrousel Instagram") {
      // Preuve que l'objet structuré {slides, caption} a survécu : le front
      // l'aplatit en « Slide N · titre » + séparateur « Légende ». Une string
      // brute (régression du recycle structuré) n'aurait ni l'un ni l'autre.
      expect(contenu, "carrousel recyclé : pas de marqueur « Slide 1 » — l'objet structuré s'est perdu").toMatch(/Slide 1/i);
      expect(contenu, "carrousel recyclé : séparateur Légende absent").toMatch(/Légende/i);
      const slideCount = (contenu.match(/Slide \d+/gi) || []).length;
      console.log(`🎠 Carrousel structuré : ${slideCount} slides détectées (8 attendues par le prompt)`);
      if (slideCount < 8) console.log("⚠️ moins de 8 slides — le prompt recycle en exige 8");
    }
    await page.screenshot({
      path: path.join(SHOTS, `recycle-2-${label.toLowerCase().replace(/[^a-z]+/g, "-")}.png`),
      fullPage: true,
    });
  }

  expect(generationPartielle, `un format est retombé : ${generationPartielle}`).toBeNull();
  console.log(`✅ Recyclage complet — ${bilan.join(" | ")}`);
});
