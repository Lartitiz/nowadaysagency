// Clavier de l'éditeur de carrousel (15/10/2026) : touches reçues par la
// section (panneau, boutons, vignettes) et par la page quand le focus en est
// sorti (clic à côté de la slide, bouton devenu inactif). ⌘Z, ⌘C/V, Suppr…
// marchent alors quand même, comme dans Canva, tant que personne n'écrit dans
// un autre champ de la page. L'aperçu (iframe) a ses propres touches
// (canvas-events.ts).
import { useEffect, useRef, type RefObject } from "react";
import { listLayers, type EditorSlide } from "@/lib/carousel-editor";

type EditorKeys = {
  editorRoot: RefObject<HTMLElement>;
  copySelection: () => void;
  paste: () => void;
  shortcut: (event: KeyboardEvent) => boolean;
  onHistoryKey: (event: KeyboardEvent) => void;
  removeMany: (ids: string[]) => void;
  selected: string | null;
  group: string[];
  slide: EditorSlide;
  /** ← → (et Page préc./suiv.) sans rien de choisi : slide précédente / suivante. */
  goBy?: (delta: number) => void;
};

const SLIDE_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -1, PageDown: 1 };

export function useEditorKeys(keys: EditorKeys) {
  const latest = useRef(keys);
  latest.current = keys;
  // Touches reçues par la section de l'éditeur.
  const onEditorKey = (event: KeyboardEvent, target: HTMLElement) => {
    const { copySelection, paste, shortcut, onHistoryKey, goBy, selected, editorRoot } = latest.current;
    const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
    // Sur la section elle-même ou une vignette, rien de choisi : les flèches changent de slide.
    if (goBy && !selected && !typing && SLIDE_KEYS[event.key] && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      && (target === editorRoot.current || target.hasAttribute("data-thumb"))) {
      event.preventDefault();
      goBy(SLIDE_KEYS[event.key]);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.key === "c" || event.key === "v") && !typing && !window.getSelection()?.toString()) {
      event.preventDefault();
      if (event.key === "c") copySelection();
      else paste();
      return;
    }
    // Tab garde son rôle de navigation dans le panneau ; il ne change d'élément que dans l'aperçu.
    if (event.key !== "Tab" && !typing && shortcut(event)) {
      event.preventDefault();
      return;
    }
    onHistoryKey(event);
  };
  // Touches reçues par la page quand aucun champ n'a le focus.
  const onPageKey = (event: KeyboardEvent) => {
    const { editorRoot, removeMany, selected, group, slide, goBy } = latest.current;
    const body = window.document.body;
    const root = editorRoot.current;
    if ((event.target !== body && event.target !== window.document.documentElement) || !root?.isConnected) return;
    const mod = event.metaKey || event.ctrlKey;
    if ((event.key === "Delete" || event.key === "Backspace") && !mod && !event.altKey && selected && !slide.locked) {
      const removable = listLayers(slide.html).filter((l) => group.includes(l.id) && !l.locked && !l.fixed).map((l) => l.id);
      if (!removable.length) return;
      event.preventDefault();
      removeMany(removable);
      root.focus({ preventScroll: true });
      return;
    }
    if (goBy && !selected && !mod && !event.altKey && !event.shiftKey && SLIDE_KEYS[event.key]) {
      event.preventDefault();
      goBy(SLIDE_KEYS[event.key]);
      return;
    }
    if (!mod) return;
    onEditorKey(event, body);
    if (event.defaultPrevented && window.document.activeElement === body) root.focus({ preventScroll: true });
  };
  const pageKey = useRef(onPageKey);
  pageKey.current = onPageKey;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => pageKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  return onEditorKey;
}
