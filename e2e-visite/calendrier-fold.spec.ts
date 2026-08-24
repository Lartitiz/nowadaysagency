import { test, expect } from "@playwright/test";

/**
 * /calendrier au doigt : on doit VOIR du calendrier sur le premier écran.
 *
 * Régression constatée deux fois (regard du 17/08, puis bilan hebdo du 24/08) :
 * la page qui s'appelle « Calendrier » ouvrait sur ~1700 px d'encarts — statut
 * de connexion, titre + baseline, trois boutons, encart marronnier — et la
 * première case n'apparaissait qu'après un défilement. Chaque encart pris
 * séparément se justifie ; c'est leur SOMME qui repousse le contenu.
 *
 * 🔑 CE QUE MESURE CE TEST, ET POURQUOI PAS AUTREMENT. Une première version se
 * contentait de « un repère de calendrier existe au-dessus de 844 px » : elle
 * passait AUSSI sur la version fautive, où la bascule Semaine/Mois commençait à
 * 780 px — au-dessus du pli au sens strict, mais dans les derniers pixels et
 * derrière la barre d'onglets fixe. Un seuil binaire sur le bord haut ne dit
 * donc rien de ce qu'on voit. On mesure ici la HAUTEUR de calendrier réellement
 * offerte à l'œil : entre le haut de l'écran et le pli diminué de la barre fixe.
 */

/** Assez pour voir la navigation du mois ET le début du contenu, pas un liseré. */
const MIN_CALENDRIER_VISIBLE_PX = 150;

test("calendrier mobile : du calendrier est visible au-dessus du pli", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "friction propre au doigt");

  await page.goto("/calendrier", { waitUntil: "domcontentloaded" });
  // Les posts arrivent par requête : sans cette attente on mesurerait un
  // squelette, qui est court et passerait toujours.
  await page.waitForTimeout(5000);

  const FOLD = testInfo.project.use.viewport?.height ?? 844;

  const mesure = await page.evaluate((fold) => {
    const estVisible = (el: Element): boolean => {
      const cs = getComputedStyle(el as HTMLElement);
      return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
    };

    // Barre d'onglets fixe en bas (Assistant / Créer / Calendrier) : ce qu'elle
    // recouvre n'est pas vu, même si c'est « au-dessus du pli ».
    let barreBasse = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || !estVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.width < 200) continue;
      if (r.bottom >= fold - 4 && r.top > fold / 2) barreBasse = Math.max(barreBasse, Math.round(r.height));
    }
    const pliUtile = fold - barreBasse;

    // Repère : la bascule Semaine/Mois, présente dans les deux vues et située
    // juste au-dessus de la grille — donc le haut du bloc calendrier.
    let navTop: number | null = null;
    for (const el of Array.from(document.querySelectorAll("button"))) {
      if ((el.textContent || "").trim() !== "Mois" || !estVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8) continue;
      navTop = Math.round(r.top);
      break;
    }

    const premierTexte = (document.querySelector("main")?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 200);

    return {
      navTop,
      barreBasse,
      pliUtile,
      // Le calendrier s'étend vers le bas : ce qui en est offert à l'œil va de
      // son sommet jusqu'au pli utile.
      hauteurVisible: navTop === null ? 0 : Math.max(0, pliUtile - navTop),
      premierTexte,
    };
  }, FOLD);

  console.log("[calendrier-fold]", JSON.stringify(mesure));

  expect(
    mesure.hauteurVisible,
    `Seuls ${mesure.hauteurVisible} px de calendrier sont visibles au doigt (pli utile ${mesure.pliUtile} px, barre fixe ${mesure.barreBasse} px) : les encarts ont repris le premier écran. Début de page : « ${mesure.premierTexte} »`,
  ).toBeGreaterThanOrEqual(MIN_CALENDRIER_VISIBLE_PX);
});
