// Enregistrement automatique de la fenêtre d'un post du calendrier : photo du
// formulaire à chaque rendu, « armement » après ouverture (setTimeout 0, pour
// ne pas enregistrer l'état d'ouverture), délai de 1,2 s, jamais sans sujet,
// et `runAutoSave` (aussi branché sur « Réessayer »). Sorti de
// CalendarPostDialog.tsx à l'identique (fiche 13 de
// docs/robustesse/gros-fichiers.md, lot 5).
// ⚠️ Ordre : la fenêtre appelle ce hook JUSTE APRÈS son effet d'initialisation
// (qui remet `createdIdRef` et l'état d'auto-save à zéro) : l'armement doit
// capturer l'état « de départ » au tour suivant. `createdIdRef` et
// `setAutoSaveState` restent dans la fenêtre (l'init et `effectiveId` s'en servent).
import { useEffect, useRef, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { CalendarPost } from "@/lib/calendar-constants";

type SaveData = Record<string, unknown>;
type AutoSaveResult = { post?: CalendarPost; error?: boolean };

export interface CalendarPostAutosaveInput {
  open: boolean;
  editingPost: CalendarPost | null;
  prefillData: { theme?: string; notes?: string } | null | undefined;
  onAutoSave: ((data: any, existingId: string | null) => Promise<AutoSaveResult>) | undefined;
  buildSaveData: () => SaveData;
  createdIdRef: MutableRefObject<string | null>;
  setAutoSaveState: (s: "idle" | "saving" | "saved" | "error") => void;
  setSavedDraft: (v: string | null) => void;
  theme: string;
  angle: string | null;
  status: string;
  notes: string;
  postCanal: string;
  objectif: string | null;
  format: string | null;
  contentDraft: string | null;
  accroche: string | null;
  mediaUrls: string[];
  seriesId: string | null;
  episodeNumber: number | null;
}

export function useCalendarPostAutosave({
  open, editingPost, prefillData, onAutoSave, buildSaveData, createdIdRef, setAutoSaveState, setSavedDraft,
  theme, angle, status, notes, postCanal, objectif, format, contentDraft, accroche, mediaUrls, seriesId, episodeNumber,
}: CalendarPostAutosaveInput) {
  const lastSavedRef = useRef<string>("");            // payload sérialisé du dernier enregistrement
  const liveDataRef = useRef<string>("");             // payload sérialisé du rendu courant
  const skipAutoSaveRef = useRef<boolean>(true);      // bloque l'auto-save tant que l'état initial n'est pas "armé"
  const savingRef = useRef<boolean>(false);

  // Mémorise à chaque rendu le payload sérialisé courant (utilisé pour la baseline d'auto-save).
  useEffect(() => { liveDataRef.current = JSON.stringify(buildSaveData()); });

  // ── Armement de l'auto-save après (ré)ouverture ──
  // On bloque l'auto-save tant que l'état d'ouverture n'est pas posé, puis on capture la baseline
  // via une macrotâche (setTimeout 0) — donc APRÈS que les setState d'initialisation se soient appliqués.
  useEffect(() => {
    if (!open) return;
    skipAutoSaveRef.current = true;
    const t = setTimeout(() => { lastSavedRef.current = liveDataRef.current; skipAutoSaveRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [open, editingPost, prefillData]);

  // ── Auto-save silencieux (debounce) ──
  // Utilisé par l'effet debouncé ET par le bouton « Réessayer » de l'indicateur :
  // un échec ne doit pas rester un simple toast éphémère — sans nouvelle frappe,
  // l'effet ne se redéclenche pas et le texte resterait non sauvé en silence.
  const runAutoSave = async () => {
    if (savingRef.current || !onAutoSave) return;
    savingRef.current = true;
    setAutoSaveState("saving");
    const serialized = JSON.stringify(buildSaveData());
    const res = await onAutoSave(buildSaveData(), editingPost?.id ?? createdIdRef.current);
    savingRef.current = false;
    if (res?.error) { setAutoSaveState("error"); toast.error("Sauvegarde impossible", { description: "Réessaie dans un instant." }); return; }
    if (res?.post && !editingPost) createdIdRef.current = res.post.id;
    lastSavedRef.current = serialized;
    setSavedDraft(contentDraft);
    setAutoSaveState("saved");
  };
  useEffect(() => {
    if (!open || !onAutoSave) return;
    if (skipAutoSaveRef.current) return;             // pas encore armé (juste après ouverture)
    if (!theme.trim()) return;                       // pas d'auto-save d'un post sans sujet
    const serialized = JSON.stringify(buildSaveData());
    if (serialized === lastSavedRef.current) return; // rien de neuf depuis le dernier enregistrement
    const timer = setTimeout(() => { void runAutoSave(); }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, theme, angle, status, notes, postCanal, objectif, format, contentDraft, accroche, mediaUrls, seriesId, episodeNumber]);

  return { runAutoSave };
}
