// Stories comme le carrousel (12/11/2026) : Annuler / Rétablir.
// On garde les états successifs de la séquence ; les frappes rapprochées
// dans le même champ (moins de 800 ms d'écart) comptent pour une seule
// modification, comme une phrase.
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyHistory, recordStep, travelHistory } from "@/lib/edit-history";

const MAX_STEPS = 60;

/**
 * Pile commune : src/lib/edit-history.ts (la même que le texte).
 * `automatic` : mis à true juste avant un changement fait par l'app seule (photo
 * posée d'office) ; ce changement devient le nouveau point de départ, sans étape.
 */
export function useStoryHistory<T>(value: T, apply: (next: T) => void, resetKey: string, kindOf: (prev: T, next: T) => string = () => "", automatic?: { current: boolean }) {
  const stack = useRef(emptyHistory<T>());
  const last = useRef(value);
  const restoring = useRef(false);
  const [, bump] = useState(0);

  // Nouvelle séquence venue du parent (régénération, autre contenu) : on repart de zéro.
  useEffect(() => {
    stack.current = emptyHistory<T>();
    last.current = value;
    bump((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (value === last.current) return;
    if (restoring.current || automatic?.current) {
      restoring.current = false;
      if (automatic) automatic.current = false;
      last.current = value;
      return;
    }
    // Seules les frappes dans le même champ se regroupent : un autre réglage est une nouvelle étape.
    recordStep(stack.current, last.current, kindOf(last.current, value), MAX_STEPS);
    last.current = value;
    bump((n) => n + 1);
  }, [value]);

  const travel = useCallback((redo: boolean) => {
    const next = travelHistory(stack.current, last.current, redo);
    if (next === undefined) return;
    restoring.current = true;
    apply(next);
    bump((n) => n + 1);
  }, [apply]);
  const undo = useCallback(() => travel(false), [travel]);
  const redo = useCallback(() => travel(true), [travel]);

  return { undo, redo, canUndo: stack.current.past.length > 0, canRedo: stack.current.future.length > 0 };
}

/** Ce qui a changé entre deux séquences : la story et ses champs (pour regrouper les frappes). */
export function storyChangeKind(prev: any[], next: any[]): string {
  if (prev.length !== next.length) return "structure";
  const i = next.findIndex((s, k) => s !== prev[k]);
  if (i < 0) return "";
  const a = prev[i] || {}, b = next[i] || {};
  const top = Object.keys({ ...a, ...b }).filter((k) => k !== "visual" && a[k] !== b[k]);
  const va = a.visual || {}, vb = b.visual || {};
  // Un glissé touche x et y (et la première fois « déplacé à la main ») : une seule famille.
  const family = (k: string) => (k === "face_avoidance_applied" ? "" : k.replace(/_(x|y|edited)$/, ""));
  const vis = a.visual === b.visual ? [] : [...new Set(Object.keys({ ...va, ...vb }).filter((k) => va[k] !== vb[k]).map(family).filter(Boolean))];
  return `${i}:${top.sort().join(",")}|${vis.sort().join(",")}`;
}
