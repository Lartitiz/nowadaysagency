// Post écrit (Instagram, LinkedIn) : enregistré tout seul dans Mes idées, comme
// le carrousel, les stories et le reel (choix de Laetitia du 13/11/2026). Avant,
// sans « Garder dans mes idées », le post n'était gardé nulle part. Ce hook
// décide quand la sauvegarde continue (use-carousel-autosave.ts, kind "post")
// peut tourner et donne au post l'identifiant de document qu'elle attend.
// Limite : un post avec photos garde le bouton « Garder dans mes idées », qui
// range aussi ses photos (la sauvegarde continue ne range que le texte).
import { useEffect } from "react";

export const POST_CLOUD_FORMATS = ["post", "linkedin"] as const;

export function postTextOf(raw: any): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return [raw.edited_text, raw.full_text, raw.content, raw.post, raw.text, raw.body, raw.hook]
    .some((v) => typeof v === "string" && v.trim().length > 0);
}

interface Options {
  /** Compte prêt, hors démo. */
  ready: boolean;
  step: string;
  selectedFormat: string | null | undefined;
  /** Génération en cours : on attend le texte complet. */
  busy: boolean;
  /** Post rouvert depuis le calendrier sans fiche reliée : il s'enregistre dans le calendrier. */
  calendarOnly: boolean;
  /** Photos jointes au post : elles passent par « Garder dans mes idées ». */
  hasPhotos: boolean;
  raw: any;
  setResult: (update: (prev: any) => any) => void;
}

export function usePostCloud({ ready, step, selectedFormat, busy, calendarOnly, hasPhotos, raw, setResult }: Options): boolean {
  const eligible = ready && !busy && !calendarOnly && !hasPhotos && step === "result" &&
    (POST_CLOUD_FORMATS as readonly string[]).includes(selectedFormat || "") && postTextOf(raw);
  const missingId = eligible && !raw?._carousel_document_id;
  useEffect(() => {
    if (!missingId) return;
    setResult((prev: any) => prev?.raw && postTextOf(prev.raw) && !prev.raw._carousel_document_id
      // post_editor_version : active les versions gardées (Revenir à une version).
      ? { ...prev, raw: { ...prev.raw, _carousel_document_id: crypto.randomUUID(), post_editor_version: 1 } }
      : prev);
  }, [missingId, setResult]);
  return eligible && !missingId;
}
