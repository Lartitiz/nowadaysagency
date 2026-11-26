// Slide en grand (26/11/2026, maquette validée par Laetitia) : tant que l'éditeur de
// carrousel est affiché sur ordinateur, le menu de l'app devient une barre fine qui
// accueille les étapes de /creer et « Créer un autre contenu ». Deux lignes de moins
// au-dessus de la slide. Le menu pose ses emplacements ici, les composants de /creer
// s'y affichent (portail) ; sans emplacement (téléphone, tablette, tests), ils restent
// à leur place habituelle.
import { useSyncExternalStore } from "react";

export type AppHeaderSlot = "steps" | "actions";

const slots: Record<AppHeaderSlot, HTMLElement | null> = { steps: null, actions: null };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const setter = (name: AppHeaderSlot) => (el: HTMLElement | null) => {
  if (slots[name] === el) return;
  slots[name] = el;
  listeners.forEach((l) => l());
};

/** Refs (stables) à poser sur les emplacements du menu de l'app. */
export const appHeaderSlotRef: Record<AppHeaderSlot, (el: HTMLElement | null) => void> = {
  steps: setter("steps"),
  actions: setter("actions"),
};

// Le menu du haut n'existe qu'à partir de 1024 px (`hidden lg:block`) : en dessous, son
// emplacement est dans la page mais invisible, il ne faut rien y envoyer.
const DESKTOP = "(min-width: 1024px)";
const desktopQuery = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DESKTOP) : null);
const subscribeDesktop = (l: () => void) => {
  const q = desktopQuery();
  q?.addEventListener?.("change", l);
  return () => q?.removeEventListener?.("change", l);
};

/** L'emplacement du menu où s'afficher, ou `null` s'il faut rester dans la page. */
export function useAppHeaderSlot(name: AppHeaderSlot): HTMLElement | null {
  const el = useSyncExternalStore(subscribe, () => slots[name], () => null);
  const desktop = useSyncExternalStore(subscribeDesktop, () => !!desktopQuery()?.matches, () => false);
  return desktop ? el : null;
}
