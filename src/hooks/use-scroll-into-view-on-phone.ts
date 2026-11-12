import { useEffect, useRef } from "react";

/**
 * Téléphone uniquement : à l'arrivée sur l'écran, fait défiler UNE fois
 * jusqu'à l'élément (la story affichée), pour que sa case de texte ET son
 * aperçu tiennent sur le premier écran. Le haut de la page (enregistrement,
 * « Toute la séquence… ») reste accessible en remontant.
 *
 * Ne fait rien sur ordi/tablette (≥ 640 px, point de rupture `sm`), ni si
 * l'élément est déjà entièrement visible, ni si la personne a déjà défilé.
 */
export function useScrollIntoViewOnPhone<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(min-width: 640px)").matches) return;
    const timer = window.setTimeout(() => {
      const el = ref.current;
      if (!el || window.scrollY > 80) return;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.bottom <= window.innerHeight) return;
      el.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);
  return ref;
}
