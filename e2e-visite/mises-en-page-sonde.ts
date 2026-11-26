/**
 * Sonde « mises en page de la slide » (20/11/2026, accord de Laetitia, après #2020, #2022,
 * #2024 et #2026).
 *
 * Appelée à la fin du carrousel texte figé (contenus-figes.spec.ts), déjà rejoué chaque
 * matin sans crédit. Elle n'échoue jamais : elle écrit une ligne lue par la visite du matin :
 *   📐 Mises en page ✅ (4 proposées · police de marque gardée · texte dans le cadre)
 *
 * Pourquoi : le 20/11/2026, changer de mise en page perdait la police de marque (un
 * guillemet double fermait l'attribut style) et coupait le texte en bas de la slide. Les
 * contenus figés photographient les slides générées, jamais une slide recomposée, et les
 * tests CI tournent dans jsdom, qui ne rend ni les polices ni les débordements.
 *
 * Parcours : slide 2, onglet « Mise en page », chaque mise en page proposée est appliquée
 * puis retirée par « Annuler ». Pour chacune : la police du titre est celle de la slide
 * d'origine, et aucun texte ne sort de la slide (marge de 20 px sur 1080). Seuils : au
 * moins 4 mises en page proposées sur une slide sans photo, zéro police perdue, zéro
 * texte hors cadre ; sinon 🟠 avec la mise en page fautive.
 */
import type { Page } from "@playwright/test";

const court = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 90);
const MIN_PROPOSEES = 4;

async function mesure(page: Page) {
  return page.locator('iframe[title^="Éditeur de la slide"]').evaluate((f: HTMLIFrameElement) => {
    const d = f.contentDocument!;
    const root = (d.querySelector('[style*="1080px"]') || d.body) as HTMLElement;
    const R = root.getBoundingClientRect();
    const k = R.width / 1080;
    let dehors = 0;
    d.querySelectorAll<HTMLElement>("[data-pptx-editable],[data-slide-text]").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.bottom > R.bottom - 20 * k || b.top < R.top + 20 * k || b.right > R.right - 20 * k || b.left < R.left + 20 * k) dehors++;
    });
    const titre = d.querySelector('[data-slide-text="title"]') as HTMLElement | null;
    const police = titre ? getComputedStyle(titre).fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase() : "";
    return { dehors, police };
  });
}

export async function sondeMisesEnPage(page: Page) {
  let appliquees = 0;
  const annuler = page.getByLabel("Annuler la modification");
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Sélectionner la slide 2", exact: true }).click();
    await page.waitForTimeout(1000);
    const origine = await mesure(page);
    if (!origine.police) throw new Error("titre de la slide 2 introuvable");

    // Panneau à onglets (26/11/2026) : la galerie est dans l'onglet « Mise en page » (avant : une bulle).
    const ouvrir = page.getByRole("tab", { name: "Mise en page", exact: true }).first();
    const galerie = page.getByRole("group", { name: "Mises en page" }).first();
    const montrer = async () => {
      if (await galerie.isVisible().catch(() => false)) return;
      await ouvrir.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await ouvrir.click({ timeout: 8000 });
      await galerie.waitFor({ state: "visible", timeout: 8000 });
    };
    await montrer();
    const noms = await galerie.getByRole("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") || ""));
    const fautes: string[] = [];
    for (const nom of noms) {
      await montrer();
      await galerie.getByRole("button", { name: nom, exact: true }).first().click({ timeout: 8000 });
      appliquees++;
      await galerie.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const m = await mesure(page);
      const defauts = [m.police !== origine.police ? `police perdue (${m.police || "aucune"})` : "", m.dehors ? `${m.dehors} texte(s) hors cadre` : ""].filter(Boolean);
      if (defauts.length) fautes.push(`${nom.replace("Mise en page ", "")} : ${defauts.join(", ")}`);
      await page.keyboard.press("Escape").catch(() => {});
      await annuler.click({ timeout: 8000 });
      appliquees--;
      await page.waitForTimeout(700);
    }
    if (noms.length < MIN_PROPOSEES) fautes.unshift(`${noms.length} proposée(s), ${MIN_PROPOSEES} attendues`);
    const ok = fautes.length === 0;
    console.log(ok
      ? `📐 Mises en page ✅ (${noms.length} proposées · police de marque gardée · texte dans le cadre)`
      : `📐 Mises en page ❌ (${fautes.join(" ; ").slice(0, 260)}) 🟠`);
  } catch (e) {
    console.log(`📐 Mises en page ❌ (${court(e)}) 🟠`);
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
    while (appliquees-- > 0) await annuler.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
}
