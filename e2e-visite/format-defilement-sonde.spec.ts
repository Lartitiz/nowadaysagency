/**
 * Écran Format de /creer : « Suivant » visible sans défiler (15/10/2026, chantier B, #1609) — zéro crédit.
 *
 * Avant le 15/10, le bouton « Suivant » était sous le bas de l'écran pour tous les
 * carrousels (jusqu'à 3 écrans de haut sur téléphone) et aucune routine ne le voyait.
 * La sonde parcourt l'écran Format pour chaque canal, format et type de carrousel,
 * sans rien générer, et vérifie que « Suivant » est dans l'écran, non recouvert.
 * 20 cas par taille d'écran : 40/40 attendu (ordi + téléphone).
 * Seconde ligne 🧭 : rendu de carrousel conseillé (« photo » dès 3 photos dans « Mes photos », sinon « text »).
 * Troisième ligne 🧭 (17/10/2026, #1736) : « Suivant » sans photo en « Tes photos en fond » montre l'alerte
 * « il faut au moins une photo » dans l'écran, non recouverte (elle naissait sous l'écran, la cliente ne voyait rien).
 * Sans photo jointe, « Suivant » ne passe pas l'écran : rien n'est généré.
 */
import { test, expect, type Page } from "@playwright/test";

type Cas = { nom: string; ok: boolean; hauteur: number };

async function verifier(page: Page, nom: string, cas: Cas[]) {
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const vh = window.innerHeight;
    const btn = document.querySelector('[data-testid="creer-format-next"]') as HTMLElement | null;
    const r = btn?.getBoundingClientRect();
    // Un bouton désactivé ignore la souris (pointer-events: none) : on le rend
    // « touchable » le temps de demander ce qui est affiché à son centre.
    const avant = btn?.style.pointerEvents ?? "";
    if (btn) btn.style.pointerEvents = "auto";
    const dessus = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    if (btn) btn.style.pointerEvents = avant;
    return {
      hauteur: document.documentElement.scrollHeight / vh,
      ok: !!r && r.top >= 0 && r.bottom <= vh && !!btn && !!dessus && btn.contains(dessus),
    };
  });
  cas.push({ nom, ...m });
}

const changerCanal = async (page: Page, canal: string) => {
  const chg = page.getByRole("button", { name: /Changer de canal/i });
  if (await chg.isVisible().catch(() => false)) await chg.click();
  await page.getByTestId(`creer-channel-${canal}`).click();
};

const MODES = [
  ["text", "Texte design"],
  ["photo", "Tes photos en fond"],
  ["mix", "Photos + slides design"],
  ["pure_photo", "Photos brutes"],
  ["user_slides", "Mes slides"],
] as const;

test("écran Format : « Suivant » visible sans défiler", async ({ page }, info) => {
  test.setTimeout(120_000);
  const taille = info.project.name === "mobile" ? "téléphone" : "ordi";
  const cas: Cas[] = [];
  // Rendu conseillé (17/10/2026) : « Tes photos en fond » dès 3 photos dans « Mes photos », sinon « Texte design ».
  let conseille = "?";
  let mesPhotos = 0;
  let alerte = "non vérifiée";

  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const fermer = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await fermer.isVisible({ timeout: 2000 }).catch(() => false)) await fermer.click();
  const idee = page.getByTestId("creer-idea-input").or(page.locator("#creation-idea")).first();
  await expect(idee).toBeVisible({ timeout: 15_000 });
  await idee.fill("3 erreurs que je vois souvent quand on parle de son activité");
  await page.getByTestId("creer-idea-next").or(page.getByRole("button", { name: /^(suivant|continuer)$/i })).first().click();
  await expect(page.getByTestId("creer-channel-instagram").or(page.getByTestId("creer-format-next")).first()).toBeVisible({ timeout: 15_000 });
  const chg = page.getByRole("button", { name: /Changer de canal/i });
  if (await chg.isVisible().catch(() => false)) await chg.click();
  await verifier(page, "choix du canal", cas);

  for (const canal of ["instagram", "linkedin"] as const) {
    await changerCanal(page, canal);
    await verifier(page, `${canal} : choix du format`, cas);
    await page.getByTestId("creer-format-carousel").click();
    if (canal === "instagram") {
      await page.waitForTimeout(1500);
      conseille = (await page.locator('[data-testid^="carousel-mode-"][aria-pressed="true"]').first().getAttribute("data-testid"))?.replace("carousel-mode-", "") ?? "aucun";
    }
    for (const [id, nom] of MODES) {
      await page.getByTestId(`carousel-mode-${id}`).click();
      await verifier(page, `${canal} : carrousel ${nom}`, cas);
      if (canal === "instagram" && id === "photo") {
        const bouton = page.getByTestId("photo-zone-library-main");
        mesPhotos = (await bouton.isVisible().catch(() => false)) ? Number((await bouton.textContent())?.match(/\((\d+)\)/)?.[1] ?? 0) : 0;
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByTestId("creer-format-next").click();
        await page.waitForTimeout(1200);
        alerte = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="carousel-photo-warning"]') as HTMLElement | null;
          if (!el) return "absente";
          const r = el.getBoundingClientRect();
          const p = el.querySelector("p")?.getBoundingClientRect() ?? r;
          const dessus = document.elementFromPoint(p.left + 10, p.top + p.height / 2);
          return r.top >= 0 && r.bottom <= window.innerHeight && !!dessus && el.contains(dessus) ? "visible" : `hors écran (${Math.round(r.top)} px / ${window.innerHeight})`;
        });
      }
    }
  }
  for (const f of ["post", "reel", "story"]) {
    await changerCanal(page, "instagram");
    await page.getByTestId(`creer-format-${f}`).click();
    await verifier(page, `instagram : ${f}`, cas);
  }
  await changerCanal(page, "linkedin");
  await page.getByTestId("creer-format-linkedin").click();
  await verifier(page, "linkedin : post", cas);
  await changerCanal(page, "pinterest");
  await verifier(page, "pinterest : choix du format", cas);
  await page.getByTestId("creer-format-pinterest_visual").click();
  await verifier(page, "pinterest : visuel", cas);
  await changerCanal(page, "newsletter");
  await verifier(page, "newsletter", cas);

  const ok = cas.filter((c) => c.ok).length;
  const plusHaut = cas.reduce((a, c) => (c.hauteur > a.hauteur ? c : a));
  console.log(`🧭 Écran Format (${taille}) : Suivant visible sans défiler ${ok}/${cas.length} · le plus haut : ${plusHaut.nom} ${plusHaut.hauteur.toFixed(2)} écran`);
  for (const c of cas.filter((x) => !x.ok)) console.log(`   - ❌ ${c.nom} (${c.hauteur.toFixed(2)} écran)`);
  const attendu = mesPhotos >= 3 ? "photo" : "text";
  console.log(`🧭 Carrousel conseillé : ${conseille} (Mes photos : ${mesPhotos}, attendu ${attendu})${conseille === attendu ? "" : " ❌"}`);
  console.log(`🧭 Alerte photo : ${alerte}${alerte === "visible" ? "" : " ❌"}`);
  await page.screenshot({ path: `e2e-visite/results/format-defilement-${info.project.name}.png` });
  expect(cas.filter((c) => !c.ok).map((c) => c.nom), "« Suivant » repassé sous l'écran Format").toEqual([]);
  expect(conseille, "rendu de carrousel conseillé selon « Mes photos »").toBe(attendu);
  expect(alerte, "alerte « il faut au moins une photo » dans l'écran").toBe("visible");
});
