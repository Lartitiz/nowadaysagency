/**
 * Sonde du bouton BÊTA sur téléphone (12/11/2026, accord de Laetitia, après #1886).
 *
 * Le rond BÊTA recouvrait le coin de l'aperçu des stories et des titres du tableau de
 * bord à 390 px, et aucune routine ne le voyait. Appelée par `hauteur-editeur-sonde.ts`
 * à la taille téléphone, elle regarde deux moments : le haut de page, puis l'aperçu
 * (story ou slide) amené à l'écran suivi d'une petite remontée, qui fait réapparaître
 * le bouton (c'est là qu'on l'avait vu). Elle ajoute à la ligne 📏 :
 *   · BÊTA ✅            (languette visible, ne recouvre rien)
 *   · BÊTA masqué ✅     (caché parce qu'il tombait sur un bouton : rien de recouvert)
 *   · BÊTA recouvre « … » 🟠
 * Seuil : rien de recouvert. Ne lève jamais d'erreur.
 */
import type { Page } from "@playwright/test";

const APERCU = 'iframe[title^="Aperçu story"], iframe[title^="Éditeur de la slide"]';

export async function mesureBoutonBeta(page: Page): Promise<{ texte: string; ko: boolean }> {
  const haut = await mesureIci(page);
  if (haut.ko) return haut;
  try {
    const apercu = page.locator(APERCU).first();
    if (!(await apercu.count())) return haut;
    await apercu.scrollIntoViewIfNeeded({ timeout: 3000 });
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(1200);
    const bas = await mesureIci(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    return bas.ko ? bas : haut;
  } catch {
    return haut;
  }
}

async function mesureIci(page: Page): Promise<{ texte: string; ko: boolean }> {
  try {
    const r = await page.evaluate(() => {
      const fab = document.querySelector('[data-testid="beta-feedback-fab"]') as HTMLElement | null;
      if (!fab) return { absent: true as const };
      const b = fab.getBoundingClientRect();
      if (getComputedStyle(fab).opacity === "0" || b.width === 0) return { masque: true as const };
      const contenu = document.querySelectorAll(
        'button, a[href], input, select, textarea, iframe, img, video, h1, h2, h3, h4, p, label, [role="button"]',
      );
      const touches: string[] = [];
      for (const el of contenu) {
        if (fab.contains(el)) continue;
        const e = el.getBoundingClientRect();
        if (e.width === 0 || e.height === 0 || !(el as HTMLElement).offsetParent && el.tagName !== "IFRAME") continue;
        if (e.right <= b.left || e.left >= b.right || e.bottom <= b.top || e.top >= b.bottom) continue;
        const nom = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.tagName).trim().slice(0, 30);
        if (!touches.includes(nom)) touches.push(nom);
      }
      return { touches };
    });
    if ("absent" in r) return { texte: "BÊTA absent", ko: false };
    if ("masque" in r) return { texte: "BÊTA masqué ✅", ko: false };
    if (r.touches.length === 0) return { texte: "BÊTA ✅", ko: false };
    return { texte: `BÊTA recouvre ${r.touches.slice(0, 2).map((t) => `« ${t} »`).join(", ")} 🟠`, ko: true };
  } catch {
    return { texte: "BÊTA non vérifié", ko: false };
  }
}
