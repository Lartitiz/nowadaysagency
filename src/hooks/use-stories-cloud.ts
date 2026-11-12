// Stories : sauvegarde continue dans Mes idées, comme le carrousel (12/11/2026).
// Avant, une séquence retouchée ne vivait que dans l'onglet : le fermer sans
// « Garder dans mes idées » perdait tout. Ce hook décide quand la sauvegarde
// continue (use-carousel-autosave.ts, kind "story") peut tourner et donne à la
// séquence l'identifiant de document qu'elle attend.
import { useEffect } from "react";

export function storySequenceOf(raw: any): any[] | null {
  const list = [raw?.stories, raw?.sequences, raw?.slides].find(Array.isArray);
  return Array.isArray(list) && list.length ? list : null;
}

interface Options {
  /** Compte prêt, hors démo. */
  ready: boolean;
  step: string;
  selectedFormat: string | null | undefined;
  /** Génération en cours : on attend la séquence complète. */
  busy: boolean;
  raw: any;
  setResult: (update: (prev: any) => any) => void;
}

export function useStoriesCloud({ ready, step, selectedFormat, busy, raw, setResult }: Options): boolean {
  const eligible = ready && !busy && step === "result" && selectedFormat === "story" && !!storySequenceOf(raw);
  const missingId = eligible && !raw?._carousel_document_id;
  useEffect(() => {
    if (!missingId) return;
    setResult((prev: any) => prev?.raw && storySequenceOf(prev.raw) && !prev.raw._carousel_document_id
      // story_editor_version : active les versions gardées (Revenir à une version).
      ? { ...prev, raw: { ...prev.raw, _carousel_document_id: crypto.randomUUID(), story_editor_version: 1 } }
      : prev);
  }, [missingId, setResult]);
  return eligible && !missingId;
}
