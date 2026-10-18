/**
 * Carrousel « Tes photos en fond » rechargé (18/10/2026, après #1746, chantier U) — zéro crédit, ordi.
 *
 * Rejoue le contenu figé `audit-carrousel-photo-fond` (réponses serveur enregistrées le
 * 17/10 : aucune génération payée), retouche un mot du titre, attend l'enregistrement,
 * recharge la page et vérifie que l'éditeur revient avec la retouche.
 * Pourquoi : les visuels de ce carrousel pèsent ~11 Mo (photos dans le HTML), plus que
 * la place de l'onglet (~5 Mo). Avant #1746, la copie locale échouait en entier : au
 * rechargement, l'écran revenait au texte avec « Créer les visuels » (1 crédit) et
 * « Sauvegarde locale indisponible », alors que la retouche était dans Mes idées.
 * Les contenus figés du matin ne rechargeaient jamais la page.
 * Les lignes créées chez Camille (fiche de Mes idées, brief) sont effacées à la fin.
 */
import { test, expect, type Page } from "@playwright/test";
import { installFigeReplay } from "./fige-replay";
import { traceurDeCreations, supprimeLignesCreees } from "./nettoyage-camille";

const SUJET = "Trois gestes simples pour faire durer un savon artisanal";
const MOT = "SONDEMOT";
const traceur = traceurDeCreations();

test.afterAll(async () => {
  const res = await supprimeLignesCreees(await traceur.collectees());
  console.log(`🧹 nettoyage sonde photos en fond (Camille) : ${res}`);
});

const vignettes = (page: Page) => page.locator('[aria-label="Slides du carrousel"] > button');
const texteDesSlides = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll("iframe")]
    .map((f) => { try { return (f as HTMLIFrameElement).contentDocument?.body?.innerText || ""; } catch { return ""; } })
    .join(" "));

test("🔁 carrousel « Tes photos en fond » rechargé : l'éditeur revient", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "ordi seulement");
  test.setTimeout(300_000);
  let etape = "ouverture";
  try {
    traceur.branche(page);
    page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
    const fige = await installFigeReplay(page, "audit-carrousel-photo-fond");
    expect(fige.available, "contenu figé absent").toBe(true);

    await page.goto("/creer?new=1", { waitUntil: "networkidle" });
    const fermer = page.locator('[data-testid="branding-banner-close"]').first();
    if (await fermer.isVisible({ timeout: 1500 }).catch(() => false)) await fermer.click();
    const idee = page.getByTestId("creer-idea-input").or(page.locator("#creation-idea")).first();
    await expect(idee).toBeVisible({ timeout: 15_000 });
    await idee.fill(SUJET);
    await page.getByTestId("creer-idea-next").click();
    const changer = page.getByRole("button", { name: /Changer de canal/i });
    if (await changer.isVisible({ timeout: 1500 }).catch(() => false)) await changer.click();
    await page.getByTestId("creer-channel-instagram").click();
    await page.getByTestId("creer-format-carousel").click();
    await page.getByTestId("carousel-mode-photo").click();

    etape = "photos";
    await page.getByTestId("photo-zone-library-main").click();
    const biblio = page.getByRole("dialog").filter({ hasText: "Choisir dans mes photos" });
    const tuiles = biblio.locator("button[aria-pressed]");
    await expect(tuiles.nth(2), "moins de 3 photos dans Mes photos").toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < 3; i++) await tuiles.nth(i).click();
    await biblio.getByRole("button", { name: "Utiliser ces photos" }).click();
    await expect(page.getByText(/Tes photos \(3\)/).first()).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("creer-format-next").click();

    etape = "rejeu";
    const direct = page.getByTestId("creer-generate-direct").or(page.getByRole("button", { name: /générer directement|créer directement/i })).first();
    const generer = page.getByTestId("creer-questions-next").or(page.getByRole("button", { name: /^(générer|créer)\b/i })).first();
    await expect(direct.or(generer).first()).toBeVisible({ timeout: 120_000 });
    if (await direct.isVisible().catch(() => false)) await direct.click(); else await generer.click();
    await expect(page.getByText(/Personnaliser mon carrousel/i).first()).toBeVisible({ timeout: 180_000 });
    await expect.poll(() => vignettes(page).count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    const nonEnregistrees = fige.stats().missing.filter((fn) => !["social-status", "check-subscription"].includes(fn));
    expect(nonEnregistrees, `appels non enregistrés, bloqués pendant le rejeu : ${nonEnregistrees.join(", ")}`).toEqual([]);

    etape = "retouche";
    await vignettes(page).first().click();
    await page.waitForTimeout(900);
    await page.locator('iframe[title^="Éditeur de la slide"]').evaluate((f) => f.scrollIntoView({ block: "center" }));
    const titre = page.frameLocator('iframe[title^="Éditeur de la slide"]').locator("[data-slide-text]").first();
    const champ = page.getByLabel("Texte sélectionné");
    await titre.click();
    if (!(await champ.isVisible({ timeout: 2_000 }).catch(() => false))) await titre.click();
    await expect(champ).toBeVisible({ timeout: 10_000 });
    await champ.fill(`${MOT} ${await champ.inputValue()}`);
    await expect(page.getByText("Tout est enregistré dans ton compte").first()).toBeVisible({ timeout: 30_000 });

    etape = "rechargement";
    await page.reload({ waitUntil: "domcontentloaded" });
    const editeur = page.getByText(/Personnaliser mon carrousel/i).first();
    const revenu = await editeur.waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false);
    const ecran = await page.locator("body").innerText();
    const contradiction = /Sauvegarde locale indisponible/.test(ecran);
    const boutonPayant = await page.getByRole("button", { name: /^Créer les visuels$/ }).isVisible().catch(() => false);
    if (revenu) await vignettes(page).first().click().catch(() => {});
    const retoucheGardee = revenu && (await texteDesSlides(page)).includes(MOT);
    const ok = revenu && retoucheGardee && !contradiction && !boutonPayant;
    console.log(ok
      ? "🔁 Photos en fond rechargé : ✅ éditeur revenu, retouche gardée"
      : `🔁 Photos en fond rechargé : ❌ ${[!revenu && "éditeur absent", revenu && !retoucheGardee && "retouche perdue", contradiction && "« Sauvegarde locale indisponible » affiché", boutonPayant && "« Créer les visuels » proposé"].filter(Boolean).join(", ")}`);
    await page.screenshot({ path: "e2e-visite/results/photos-fond-recharge.png" }).catch(() => {});
    expect(ok, "après rechargement, l'éditeur du carrousel « Tes photos en fond » ne revient pas avec la retouche").toBe(true);
  } catch (e) {
    if (etape !== "rechargement") console.log(`🔁 Photos en fond rechargé : non vérifié (arrêt à l'étape ${etape})`);
    throw e;
  }
});
