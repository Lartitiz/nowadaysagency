// Publie la hauteur d'une barre collée en bas de l'écran dans une variable CSS
// de la page, pour qu'une autre barre collée puisse se poser juste au-dessus
// (ex. « Assembler mon reel » au-dessus des actions du résultat). La variable
// est retirée quand la barre disparaît.
import { useEffect, type RefObject } from "react";

export function useStickyHeightVar(ref: RefObject<HTMLElement>, name: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(name, `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    return () => { observer?.disconnect(); root.style.removeProperty(name); };
  }, [ref, name]);
}
