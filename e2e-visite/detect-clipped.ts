/**
 * Détecteur de « contenu coupé » — s'exécute DANS la page (page.evaluate).
 *
 * Classe de bug du 01/08/2026 : la case du calendrier avait un plafond CSS
 * (`max-h-[150px] overflow-hidden`) EN PLUS de la limite de 3 cartes déjà
 * appliquée en JS. Le plafond étant plus bas que 3 cartes, la 3ᵉ était tranchée
 * en deux et le bouton « +6 autres » poussé hors du cadre : la journée devenait
 * illisible ET sans issue. Invisible au type-check, aux 468 tests et à toutes
 * les sondes existantes (aucune erreur console, aucun 4xx, aucun débordement
 * HORIZONTAL — la seule coupe surveillée jusqu'ici).
 *
 * Extrait dans son propre module pour être testable : `sonde-contenu-coupe.spec.ts`
 * FABRIQUE le bug et vérifie que le détecteur le voit — et qu'il ignore les
 * coupes volontaires.
 */

export type Clipped = { selector: string; hiddenPx: number; sample: string };

/** Coupe franche minimale : en dessous, c'est un arrondi de rendu, pas un bug. */
export const CLIP_MIN_PX = 16;

export function detectClipped(): Clipped[] {
  const MIN_PX = 16; // doit rester aligné sur CLIP_MIN_PX (page.evaluate ne capture rien)
  const out: Clipped[] = [];

  const chemin = (el: Element) => {
    const parts: string[] = [];
    let n: Element | null = el;
    for (let i = 0; n && i < 3; i++, n = n.parentElement) {
      const cls = (n.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      parts.unshift(n.tagName.toLowerCase() + (cls ? "." + cls : ""));
    }
    return parts.join(" > ").slice(0, 200);
  };

  for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
    if (el === document.documentElement || el === document.body) continue;

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;

    // Coupes VOLONTAIRES : texte tronqué à N lignes, ou en « … ».
    if (cs.webkitLineClamp && cs.webkitLineClamp !== "none") continue;
    if (cs.textOverflow === "ellipsis") continue;

    // Le conteneur doit CACHER, pas laisser défiler.
    if (cs.overflowY !== "hidden" && cs.overflow !== "hidden") continue;
    if (/(auto|scroll)/.test(cs.overflowX)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.height < 40 || rect.width < 40) continue;

    const hidden = el.scrollHeight - el.clientHeight;
    if (hidden <= MIN_PX) continue;

    // Un conteneur animé (carrousel, marquee) coupe exprès.
    if (cs.animationName !== "none") continue;
    if (el.closest("[data-embla-container], [role='marquee']")) continue;

    const texte = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!texte) continue;

    out.push({ selector: chemin(el), hiddenPx: Math.round(hidden), sample: texte.slice(0, 120) });
  }

  // Un parent coupé remonte souvent aussi ses enfants : on garde les pires.
  return out.sort((a, b) => b.hiddenPx - a.hiddenPx).slice(0, 5);
}
