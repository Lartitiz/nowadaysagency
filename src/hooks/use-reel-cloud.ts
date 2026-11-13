// Reel : enregistré tout seul dans Mes idées, comme le carrousel et les stories
// (choix de Laetitia du 13/11/2026). Avant, il fallait cliquer « Garder dans mes
// idées ». Ce hook décide quand la sauvegarde continue (use-carousel-autosave.ts,
// kind "reel") peut tourner et donne au reel l'identifiant de document qu'elle
// attend. Une régénération garde la même fiche (même `ideaId`), un reel repris de
// Mes idées met à jour sa fiche : jamais de doublon.
import { useEffect } from "react";
import { reelSectionsOf } from "../../supabase/functions/_shared/reel-caption";

export function reelScriptOf(raw: any): any[] | null {
  const sections = reelSectionsOf(raw);
  return sections.length ? sections : null;
}

interface Options {
  /** Compte prêt, hors démo. */
  ready: boolean;
  step: string;
  selectedFormat: string | null | undefined;
  /** Génération en cours : on attend le script complet. */
  busy: boolean;
  /**
   * Reel rouvert depuis le calendrier sans fiche reliée dans Mes idées : il
   * s'enregistre dans le calendrier (« Sauvegarder dans le calendrier »). En
   * créer une fiche à chaque ouverture ferait des doublons.
   */
  calendarOnly: boolean;
  raw: any;
  setResult: (update: (prev: any) => any) => void;
}

export function useReelCloud({ ready, step, selectedFormat, busy, calendarOnly, raw, setResult }: Options): boolean {
  const eligible = ready && !busy && !calendarOnly && step === "result" && selectedFormat === "reel" && !!reelScriptOf(raw);
  const missingId = eligible && !raw?._carousel_document_id;
  useEffect(() => {
    if (!missingId) return;
    setResult((prev: any) => prev?.raw && reelScriptOf(prev.raw) && !prev.raw._carousel_document_id
      // reel_editor_version : active les versions gardées (Revenir à une version).
      ? { ...prev, raw: { ...prev.raw, _carousel_document_id: crypto.randomUUID(), reel_editor_version: 1 } }
      : prev);
  }, [missingId, setResult]);
  return eligible && !missingId;
}
