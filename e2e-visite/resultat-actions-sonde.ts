/**
 * Sonde de l'écran du résultat de /creer (chantier C du plan simplicité, 15/10/2026).
 *
 * Appelée À LA FIN des contenus figés (post, story, carrousel texte), déjà rejoués
 * chaque matin sans crédit. Elle n'échoue jamais : elle écrit une ligne lue par
 * la visite du matin (consigne 7duodecies) :
 *   🎛️ Écran du résultat (post) : 3 actions + menu · bouton principal visible ordi ✅ téléphone ✅
 *
 * Pourquoi : avant le 15/10, l'écran du résultat avait 3 boutons, un menu de 6 à
 * 8 entrées, 2 boutons en bas, et le bouton principal était caché sous 2 à 9
 * écrans sur un carrousel ou des stories. Le test CI `creer-resultat-actions`
 * garde le nombre d'actions ; seule cette sonde voit le site EN LIGNE.
 */
import type { Page } from "@playwright/test";

const VIEWPORTS = [
  { nom: "ordi", width: 1440, height: 900 },
  { nom: "téléphone", width: 390, height: 844 },
];

export async function sondeResultatActions(page: Page, label: string) {
  try {
    const avant = page.viewportSize();
    let actions = -1;
    const visible: string[] = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="result-actions"]');
        if (!bar) return null;
        const shown = [...bar.querySelectorAll("button, a")].filter(
          (b) => (b as HTMLElement).offsetParent && b.getAttribute("data-testid") !== "more-actions",
        );
        const first = shown[0] as HTMLElement | undefined;
        const box = first?.getBoundingClientRect();
        return { n: shown.length, ok: !!box && box.top >= 0 && box.bottom <= window.innerHeight };
      });
      if (!r) {
        console.log(`🎛️ Écran du résultat (${label}) : non vérifié (barre d'actions introuvable)`);
        if (avant) await page.setViewportSize(avant);
        return;
      }
      if (vp.nom === "ordi") actions = r.n;
      visible.push(`${vp.nom} ${r.ok ? "✅" : "❌"}`);
    }
    if (avant) await page.setViewportSize(avant);
    const alerte = actions > 3 || visible.some((v) => v.includes("❌")) ? " 🟠" : "";
    console.log(`🎛️ Écran du résultat (${label}) : ${actions} actions + menu · bouton principal visible ${visible.join(" ")}${alerte}`);
  } catch (e) {
    console.log(`🎛️ Écran du résultat (${label}) : non vérifié (${e instanceof Error ? e.message.slice(0, 80) : "?"})`);
  }
}
