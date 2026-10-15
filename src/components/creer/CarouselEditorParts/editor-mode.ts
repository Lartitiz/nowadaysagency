// Chantier D (15/10/2026) : mode de l'éditeur. « simple » (par défaut) montre
// texte, photo, couleur et police ; « complet » (« Plus d'outils ») montre le
// panneau complet. Le choix est retenu dans le navigateur.
import { useState } from "react";

export type EditorMode = "simple" | "complet";
export const EDITOR_MODE_KEY = "carousel-editor:mode";

const readMode = (): EditorMode => {
  try {
    return window.localStorage.getItem(EDITOR_MODE_KEY) === "complet" ? "complet" : "simple";
  } catch {
    return "simple";
  }
};

export function useEditorMode() {
  const [mode, setModeState] = useState<EditorMode>(readMode);
  const setMode = (next: EditorMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(EDITOR_MODE_KEY, next);
    } catch {
      // Stockage indisponible : le choix reste pour la session.
    }
  };
  return [mode, setMode] as const;
}
