/**
 * Sonde de hauteur de l'éditeur de carrousel et des stories (chantier D du plan
 * simplicité, 16/10/2026, accord de Laetitia).
 *
 * Appelée TOUT À LA FIN des contenus figés (carrousel texte, stories), déjà rejoués
 * chaque matin sans crédit. Elle n'échoue jamais : elle écrit une ligne lue par la
 * visite du matin (consigne 7terdecies) :
 *   📏 Hauteur (carrousel) : ordi 1,85 · téléphone 2,22 écrans · 58 commandes visibles · slide 1 entière ✅
 *
 * Pourquoi : avant le 15/10, l'éditeur faisait 2,5 à 3,9 écrans et montrait jusqu'à
 * 84 commandes ; les stories 5,5 à 9 écrans. Le test CI `carousel-editor-simple-mode`
 * garde le nombre de boutons du mode simple, mais rien ne mesurait la page en ligne.
 *
 * « slide 1 entière » (17/10/2026, accord de Laetitia, après #1726) : à 1440×900, en haut
 * de page, le bas de la slide de l'éditeur doit rester au-dessus de la barre « Publier »
 * collée en bas. Le 16/10, 269 px de slide étaient cachés dessous et rien ne le voyait.
 */
import type { Page } from "@playwright/test";

// Seuils (au-delà = 🟠) : mesuré à cet endroit du test (titre de la slide 1 choisi) —
// carrousel 1,85 / 2,22 écrans, 58 commandes (17/10/2026, slide qui tient au-dessus de la
// barre « Publier » ; 2,04 / 2,36 le 16/10) ; stories 2,01 / 2,95, 61 commandes (16/10) —
// plus environ 10 % de marge. Avant le chantier D : 2,77 / 3,85 et 84 ; stories 5,46 / 8,99.
const SEUILS = {
  carrousel: { ordi: 2.05, telephone: 2.45, commandes: 65 },
  stories: { ordi: 2.3, telephone: 3.3, commandes: 70 },
} as const;

const VIEWPORTS = [
  { nom: "ordi", width: 1440, height: 900 },
  { nom: "telephone", width: 390, height: 844 },
] as const;

const fr = (n: number) => n.toFixed(2).replace(".", ",");

export async function sondeHauteurEditeur(page: Page, label: keyof typeof SEUILS) {
  try {
    const avant = page.viewportSize();
    const ecrans: Record<string, number> = {};
    let commandes = -1;
    // Pixels de slide cachés sous la barre « Publier » (ordi, haut de page) ; null = non mesuré.
    let cache: number | null = null;
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const r = await page.evaluate((format) => {
        const root = format === "carrousel"
          ? document.querySelector('section[aria-label="Éditeur de carrousel"]')
          : document.querySelector("main") || document.body;
        if (!root) return null;
        const visibles = [...root.querySelectorAll("button, a[href], select, input:not([type=hidden]), textarea")].filter((e) => {
          const b = (e as HTMLElement).getBoundingClientRect();
          return !!(e as HTMLElement).offsetParent && b.width > 0 && b.height > 0;
        }).length;
        const slide = document.querySelector('iframe[title^="Éditeur de la slide"]')?.getBoundingClientRect();
        const barre = document.querySelector('[data-testid="result-actions"]')?.getBoundingClientRect();
        const cache = slide && barre ? Math.max(0, Math.round(slide.bottom - barre.top)) : null;
        return { ecrans: document.scrollingElement!.scrollHeight / window.innerHeight, visibles, cache };
      }, label);
      if (!r) {
        console.log(`📏 Hauteur (${label}) : non vérifié (écran introuvable)`);
        if (avant) await page.setViewportSize(avant);
        return;
      }
      ecrans[vp.nom] = r.ecrans;
      if (vp.nom === "ordi") { commandes = r.visibles; cache = r.cache; }
    }
    if (avant) await page.setViewportSize(avant);
    const s = SEUILS[label];
    // Seuil : 0 px caché (mesuré 773 / 787 le 17/10/2026, 14 px de marge).
    const slide = label !== "carrousel" ? "" : cache === null ? " · slide 1 non vérifiée" : cache > 0 ? ` · slide 1 coupée de ${cache} px` : " · slide 1 entière ✅";
    const alerte = ecrans.ordi > s.ordi || ecrans.telephone > s.telephone || commandes > s.commandes || (cache ?? 0) > 0 ? " 🟠" : "";
    console.log(`📏 Hauteur (${label}) : ordi ${fr(ecrans.ordi)} · téléphone ${fr(ecrans.telephone)} écrans · ${commandes} commandes visibles${slide}${alerte}`);
  } catch (e) {
    console.log(`📏 Hauteur (${label}) : non vérifié (${e instanceof Error ? e.message.slice(0, 80) : "?"})`);
  }
}
