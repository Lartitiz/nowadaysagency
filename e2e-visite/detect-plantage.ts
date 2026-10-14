/**
 * Détecteur d'« écran de plantage » — s'exécute DANS la page (page.evaluate).
 *
 * Quand un composant plante pendant le rendu, React RATTRAPE l'erreur :
 *   - `src/components/ErrorBoundary.tsx` (global) remplace tout l'écran par
 *     « 😵 » + un titre `MESSAGES.errors.generic.title` + « 🔄 Réessayer » ;
 *   - `src/components/LocalErrorBoundary.tsx` remplace un bloc par un triangle
 *     d'alerte + un message + un bouton « Réessayer ».
 * Une erreur rattrapée ne déclenche PAS `pageerror` : sans ce détecteur, un
 * écran entièrement planté ne remontait au mieux qu'en « console.error »
 * (bac 🟡), noyé parmi le bruit.
 *
 * Détection par le CONTENU RENDU (pas de data-testid) : le front n'est mis en
 * ligne que par un Publish Lovable manuel, la sonde doit marcher sur le site
 * tel qu'il est aujourd'hui. Si l'un de ces textes change dans le front,
 * mettre à jour les constantes ci-dessous (le test `sonde-ecran-plantage.spec.ts`
 * reproduit le DOM des deux écrans).
 *
 * Extrait dans son propre module pour être testable, comme `detect-clipped.ts`.
 */

export type Plantage = { kind: "global" | "local"; titre: string };

export function detectPlantage(): Plantage[] {
  // Dupliqué ici car page.evaluate ne capture aucune variable extérieure.
  // Titres possibles du ErrorBoundary global (MESSAGES.errors.generic.title).
  const TITRES_GLOBAL = ["Oups, quelque chose a coincé"];
  const norm = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();
  const visible = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const out: Plantage[] = [];

  // --- Écran global : un élément dont le texte est exactement « 😵 », suivi
  // d'un <h1> (titre connu OU bouton « Réessayer » dans le même bloc — on reste
  // robuste à un changement de libellé du titre).
  for (const el of Array.from(document.querySelectorAll("div, span, p"))) {
    if (el.children.length || norm(el.textContent) !== "😵" || !visible(el)) continue;
    const bloc = el.parentElement;
    if (!bloc) continue;
    const h1 = bloc.querySelector("h1");
    const titre = norm(h1?.textContent);
    const boutonReessayer = Array.from(bloc.querySelectorAll("button")).some((b) =>
      /Réessayer/.test(b.textContent || ""),
    );
    if (h1 && (TITRES_GLOBAL.includes(titre) || boutonReessayer)) {
      out.push({ kind: "global", titre: titre.slice(0, 160) });
    }
  }

  // --- Bloc local : un bouton « Réessayer » (texte exact) dont le bloc parent
  // contient le triangle d'alerte lucide + un <p> de message.
  for (const btn of Array.from(document.querySelectorAll("button"))) {
    if (norm(btn.textContent) !== "Réessayer" || !visible(btn)) continue;
    const bloc = btn.parentElement;
    if (!bloc) continue;
    const triangle = bloc.querySelector(
      ":scope > svg.lucide-triangle-alert, :scope > svg.lucide-alert-triangle",
    );
    const p = bloc.querySelector(":scope > p");
    if (triangle && p) out.push({ kind: "local", titre: norm(p.textContent).slice(0, 160) });
  }

  return out;
}
