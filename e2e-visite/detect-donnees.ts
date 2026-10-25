/**
 * Détecteur « données incomplètes » — s'exécute DANS la page (page.evaluate).
 *
 * Quand une requête de données échoue, le front le DIT à l'écran avec un
 * message qui commence par « Impossible de charger … » (bandeau de l'accueil
 * `src/pages/AdaptiveHome.tsx`, blocs `role="alert"` des pages LinkedIn,
 * offres, photos, calendrier…). Ce n'est ni une erreur JS (rattrapée par
 * react-query), ni un écran de plantage React (`detect-plantage.ts` cherche le
 * triangle du LocalErrorBoundary) : le 25/10/2026 l'accueil de Camille
 * affichait ce bandeau pendant un chargement lent et seul le REGARD sur la
 * capture l'a vu. Ce détecteur le remonte en observation 🟡 `donnees-incompletes`.
 *
 * Détection par le CONTENU RENDU, comme les autres détecteurs : le front n'est
 * en ligne que par un Publish Lovable, la sonde doit marcher sur le site tel
 * qu'il est. Le test `src/test/sonde-detect-donnees.test.tsx` vérifie que le
 * libellé du bandeau de l'accueil commence toujours par ce préfixe.
 */

export type DonneesIncompletes = { texte: string };

export function detectDonneesIncompletes(): DonneesIncompletes[] {
  // Dupliqué ici car page.evaluate ne capture aucune variable extérieure.
  const PREFIXE = /^Impossible de charger/;
  const norm = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();
  const visible = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const out: DonneesIncompletes[] = [];
  const vus = new Set<string>();
  // On garde l'élément le plus PROFOND qui porte le message (pas ses parents,
  // dont le texte commence par la même phrase) pour ne compter qu'une fois.
  for (const el of Array.from(document.querySelectorAll("p, div, span, h1, h2, h3, li"))) {
    const texte = norm(el.textContent);
    if (!PREFIXE.test(texte) || !visible(el)) continue;
    const enfantPorteur = Array.from(el.children).some((c) => PREFIXE.test(norm(c.textContent)));
    if (enfantPorteur) continue;
    const court = texte.slice(0, 160);
    if (vus.has(court)) continue;
    vus.add(court);
    out.push({ texte: court });
  }
  return out;
}
