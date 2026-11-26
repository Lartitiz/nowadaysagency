// Temps écoulé pendant la fabrication d'une vidéo, compté à la seconde.
// Avant (26/11/2026) : « ≈ 1 s, environ 2 minutes », deux durées côte à côte
// dont la première avançait par sauts de 6 s (le rythme du suivi du moteur).
import { useEffect, useState } from "react";

export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const start = Date.now();
    setSeconds(0);
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return seconds;
}

/** « 0:07 », « 1:42 ». */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Temps écoulé + une seule durée annoncée : « 0:07 (compte environ 2 minutes) ». */
export function waitNote(seconds: number): string {
  return seconds < 150
    ? `${formatElapsed(seconds)} (compte environ 2 minutes)`
    : `${formatElapsed(seconds)} (c’est plus long que d’habitude, ça continue)`;
}

export function fabricationMessage(seconds: number): string {
  return `Fabrication de ta vidéo… ${waitNote(seconds)}`;
}
