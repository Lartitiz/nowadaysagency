/**
 * Sonde « barre d'une photo » de l'éditeur de carrousel (27/11/2026, accord de
 * Laetitia, après #2137 / #2157 / #2169).
 *
 * Appelée à la fin du rejeu figé du carrousel photo (zéro crédit). Elle choisit
 * la photo de la slide 2 à 1280×720 (petit portable, slide de 358 px) et écrit :
 *   🧰 Barre d'une photo (1280×720) : une ligne · vignettes visibles ✅
 * Pourquoi : dans le Loom du 26/11, la barre d'une photo passait sur deux lignes
 * et cachait les vignettes. Puis, même sur une ligne, elle sortait SOUS la slide
 * et se posait sur la rangée des vignettes ; la 1re correction (#2157) mesurait
 * une liste en `display: contents` (rectangle vide) et n'avait rien changé en
 * ligne, sans qu'aucun test ne le voie.
 * Lue le lundi par le bilan hebdo (ligne 🧰, consigne `routine-hebdo-lundi`). Seuils : barre de 44 px de haut au
 * plus (une ligne) et bas de la barre au-dessus du haut des vignettes. Sinon 🟠.
 * Elle n'échoue jamais.
 */
import type { Page } from "@playwright/test";

const UNE_LIGNE_MAX = 44;

/** Le cadre de la slide a fini de se (re)charger. */
async function expectCadrePret(page: Page) {
  await page.waitForFunction(() => {
    const f = document.querySelector('iframe[title^="Éditeur de la slide"]') as HTMLIFrameElement | null;
    return f?.contentDocument?.readyState === "complete" && (f.contentDocument.body?.children.length ?? 0) > 0;
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

export async function sondeBarreVignettes(page: Page) {
  const avant = page.viewportSize();
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    const vignettes = page.locator('[aria-label="Slides du carrousel"] > button');
    if ((await vignettes.count()) >= 2) {
      await vignettes.nth(1).click();
      await page.waitForTimeout(1500);
    }
    // La photo de la slide 2 est un calque de fond (pas une <img>) : on clique dans la slide,
    // en haut à gauche, et on vérifie que l'élément choisi est bien « Photo ».
    const cadre = page.locator('iframe[title^="Éditeur de la slide"]');
    await expectCadrePret(page);
    await cadre.click({ position: { x: 60, y: 60 } });
    const barre = page.getByRole("toolbar", { name: "Barre d’outils de l’élément" });
    if (!(await barre.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false))) {
      console.log("🧰 Barre d'une photo (1280×720) : non vérifié (barre absente après le clic)");
      return;
    }
    const choisi = (await page.getByTestId("selection-name").textContent().catch(() => null))?.trim();
    if (choisi !== "Photo") {
      console.log(`🧰 Barre d'une photo (1280×720) : non vérifié (élément choisi : ${choisi ?? "?"}, pas une photo)`);
      return;
    }
    await page.waitForTimeout(400);
    const m = await barre.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const slide = document.querySelector('iframe[title^="Éditeur de la slide"]')?.getBoundingClientRect();
      // La liste est en `display: contents` : on mesure les vignettes elles-mêmes.
      const tops = [...(document.querySelector('[aria-label="Slides du carrousel"]')?.children ?? [])]
        .map((c) => c.getBoundingClientRect())
        .filter((t) => t.height > 0 && slide && t.top >= slide.bottom - 1)
        .map((t) => t.top);
      return { h: Math.round(r.height), bas: Math.round(r.bottom), vignettes: tops.length ? Math.round(Math.min(...tops)) : null };
    });
    const lignes = m.h <= UNE_LIGNE_MAX ? "une ligne" : `🟠 deux lignes (${m.h} px)`;
    const etatVignettes = m.vignettes === null ? "vignettes non trouvées"
      : m.bas <= m.vignettes ? "vignettes visibles" : `🟠 recouvre les vignettes (${m.bas - m.vignettes} px)`;
    const ok = m.h <= UNE_LIGNE_MAX && m.vignettes !== null && m.bas <= m.vignettes;
    console.log(`🧰 Barre d'une photo (1280×720) : ${lignes} · ${etatVignettes}${ok ? " ✅" : ""}`);
  } catch (e) {
    console.log(`🧰 Barre d'une photo (1280×720) : non vérifié (${e instanceof Error ? e.message.slice(0, 80) : "?"})`);
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
    if (avant) await page.setViewportSize(avant).catch(() => {});
  }
}
