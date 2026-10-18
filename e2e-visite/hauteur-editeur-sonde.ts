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
 *
 * Trois tailles (18/10/2026, chantier W élargi, accord de Laetitia) : la slide coupée sur
 * un petit portable (1280×720, 22 px) et sur téléphone (36 à 60 px) échappait à la sonde,
 * qui ne regardait que 1440×900. Ligne :
 *   … · slide 1 : ordi ✅ 521 px · petit écran ✅ 377 px · téléphone ✅ 356 px
 * (largeur de la slide ; « coupée N px » = cachée sous la barre « Publier »). Seuils : 0 px
 * caché à chaque taille, et une slide d'au moins 440 / 330 / 320 px de large (mesuré 521 /
 * 377 / 356 le 18/10 ; avant W élargi 353 / 238 / 251) : plus petite = la mise en page a
 * régressé, 🟠.
 */
import type { Page } from "@playwright/test";

// Seuils (au-delà = 🟠) : mesuré à cet endroit du test (titre de la slide 1 choisi) —
// carrousel 1,85 / 2,22 écrans, 58 commandes (17/10/2026, slide qui tient au-dessus de la
// barre « Publier » ; 2,04 / 2,36 le 16/10) ; stories 2,01 / 2,95, 61 commandes (16/10) —
// plus environ 10 % de marge. Avant le chantier D : 2,77 / 3,85 et 84 ; stories 5,46 / 8,99.
// 18/10/2026 : 67 commandes après X (ordre des slides), AA (« Refaire cette slide ») et AB
// (« Mise en page », « Thème du carrousel », « Ajouter une icône »), ajouts validés par
// Laetitia dans le plan design : seuil carrousel relevé de 65 à 72.
const SEUILS = {
  carrousel: { ordi: 2.05, telephone: 2.45, commandes: 72 },
  stories: { ordi: 2.3, telephone: 3.3, commandes: 70 },
} as const;

const VIEWPORTS = [
  { nom: "ordi", width: 1440, height: 900 },
  { nom: "petit écran", width: 1280, height: 720 },
  { nom: "telephone", width: 390, height: 844 },
] as const;
// Largeur minimale de la slide par taille (W élargi : 521 / 377 / 356 px le 18/10/2026).
const SLIDE_MIN: Record<string, number> = { ordi: 440, "petit écran": 330, telephone: 320 };

const fr = (n: number) => n.toFixed(2).replace(".", ",");

export async function sondeHauteurEditeur(page: Page, label: keyof typeof SEUILS) {
  try {
    const avant = page.viewportSize();
    const ecrans: Record<string, number> = {};
    let commandes = -1;
    // Par taille : pixels de slide cachés sous la barre « Publier » (haut de page) et largeur ; null = non mesuré.
    const slides: { nom: string; cache: number | null; largeur: number }[] = [];
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
        // Caché sous la barre « Publier », ou sous le bas de l'écran.
        const cache = slide && barre ? Math.max(0, Math.round(slide.bottom - Math.min(barre.top, window.innerHeight))) : null;
        return { ecrans: document.scrollingElement!.scrollHeight / window.innerHeight, visibles, cache, largeur: Math.round(slide?.width ?? 0) };
      }, label);
      if (!r) {
        console.log(`📏 Hauteur (${label}) : non vérifié (écran introuvable)`);
        if (avant) await page.setViewportSize(avant);
        return;
      }
      ecrans[vp.nom] = r.ecrans;
      slides.push({ nom: vp.nom === "telephone" ? "téléphone" : vp.nom, cache: r.cache, largeur: r.largeur });
      if (vp.nom === "ordi") commandes = r.visibles;
    }
    if (avant) await page.setViewportSize(avant);
    const s = SEUILS[label];
    const minimum = (nom: string) => SLIDE_MIN[nom === "téléphone" ? "telephone" : nom];
    const petite = (x: (typeof slides)[number]) => x.largeur < minimum(x.nom);
    // Seuil : 0 px caché à chaque taille, et une slide pas plus petite qu'après W élargi.
    const slide = label !== "carrousel" ? ""
      : ` · slide 1 : ${slides.map((x) => `${x.nom} ${x.cache === null ? "non vérifiée" : x.cache > 0 ? `coupée ${x.cache} px 🟠` : petite(x) ? `${x.largeur} px, trop petite 🟠` : `✅ ${x.largeur} px`}`).join(" · ")}`;
    const slideKo = label === "carrousel" && slides.some((x) => (x.cache ?? 0) > 0 || petite(x));
    const alerte = ecrans.ordi > s.ordi || ecrans.telephone > s.telephone || commandes > s.commandes || slideKo ? " 🟠" : "";
    console.log(`📏 Hauteur (${label}) : ordi ${fr(ecrans.ordi)} · téléphone ${fr(ecrans.telephone)} écrans · ${commandes} commandes visibles${slide}${alerte}`);
  } catch (e) {
    console.log(`📏 Hauteur (${label}) : non vérifié (${e instanceof Error ? e.message.slice(0, 80) : "?"})`);
  }
}
