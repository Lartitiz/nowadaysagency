// Hauteur réelle du menu de l'app (12/11/2026, suite passe Auriana) : la ligne d'outils de
// l'éditeur de carrousel se collait à des hauteurs écrites en dur (49 / 57 / 81 px). On mesure
// l'en-tête collé visible et on l'écrit dans --app-header-h sur <html> tant que le composant
// est monté ; sans mesure, les classes gardent leur repli (var(--app-header-h, 49px)…).
import { useEffect } from "react";

/** Bas de l'en-tête collé (sticky/fixed) visible le plus haut placé, en px ; 0 s'il n'y en a pas. */
export function measureAppHeaderHeight(doc: Document = document): number {
  let h = 0;
  doc.querySelectorAll<HTMLElement>("header").forEach((el) => {
    const cs = doc.defaultView?.getComputedStyle(el);
    if (!cs || (cs.position !== "sticky" && cs.position !== "fixed") || cs.display === "none") return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    h = Math.max(h, r.height + (parseFloat(cs.top) || 0));
  });
  return Math.round(h);
}

/** Tient --app-header-h à jour (redimensionnement, changement du menu) ; le retire au démontage. */
export function useAppHeaderHeightVar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const apply = () => {
      const h = measureAppHeaderHeight();
      if (h > 0) root.style.setProperty("--app-header-h", `${h}px`);
      else root.style.removeProperty("--app-header-h");
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    document.querySelectorAll("header").forEach((el) => ro?.observe(el));
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--app-header-h");
    };
  }, []);
}
