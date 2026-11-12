// Stories comme le carrousel (12/11/2026) : Annuler / Rétablir.
// On garde les états successifs de la séquence ; les frappes rapprochées
// dans le même champ (moins de 800 ms d'écart) comptent pour une seule
// modification, comme une phrase.
import { useCallback, useEffect, useRef, useState } from "react";

const GROUP_MS = 800;
const MAX_STEPS = 60;

/**
 * `automatic` : mis à true juste avant un changement fait par l'app seule (photo
 * posée d'office) ; ce changement devient le nouveau point de départ, sans étape.
 */
export function useStoryHistory<T>(value: T, apply: (next: T) => void, resetKey: string, kindOf: (prev: T, next: T) => string = () => "", automatic?: { current: boolean }) {
  const lastKind = useRef("");
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef(value);
  const lastAt = useRef(0);
  const restoring = useRef(false);
  const [, bump] = useState(0);

  // Nouvelle séquence venue du parent (régénération, autre contenu) : on repart de zéro.
  useEffect(() => {
    past.current = [];
    future.current = [];
    last.current = value;
    lastAt.current = 0;
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
    const now = Date.now();
    // Seules les frappes dans le même champ se regroupent : un autre réglage est une nouvelle étape.
    const kind = kindOf(last.current, value);
    if (now - lastAt.current > GROUP_MS || kind !== lastKind.current || past.current.length === 0) {
      past.current = [...past.current, last.current].slice(-MAX_STEPS);
    }
    lastAt.current = now;
    lastKind.current = kind;
    future.current = [];
    last.current = value;
    bump((n) => n + 1);
  }, [value]);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (previous === undefined) return;
    future.current = [last.current, ...future.current];
    restoring.current = true;
    lastAt.current = 0;
    apply(previous);
    bump((n) => n + 1);
  }, [apply]);

  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (next === undefined) return;
    future.current = rest;
    past.current = [...past.current, last.current];
    restoring.current = true;
    lastAt.current = 0;
    apply(next);
    bump((n) => n + 1);
  }, [apply]);

  return { undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
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
