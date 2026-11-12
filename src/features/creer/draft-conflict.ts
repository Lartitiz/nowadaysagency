// Garde-fou « il y a déjà un contenu en cours » du parcours /creer.
// Sorti à l'identique de CreerUnifie.tsx (lot C, docs/robustesse/gros-fichiers.md, fiche 1).
import { deriveCanalFromState } from "@/features/creer/format-mappers";
import type { loadFlowState } from "@/hooks/use-flow-persistence";

type DraftConflictInput = {
  existingFlowState: ReturnType<typeof loadFlowState>;
  /** Nombre de photos sauvegardées (`loadPhotos().length`). */
  photoCount: number;
  aurianaDemoActive: boolean;
  isFreshStart: boolean;
  paramSujet: string;
  paramIdeaId: string | null;
  paramAuto: boolean;
  paramFormat: string | null;
  paramCanal: string | null;
  locState: any;
};

/** Contenu comparable : sans les marques de sauvegarde, clés triées (la base les réordonne). */
function contentKey(value: any): string {
  return JSON.stringify(value, (key, v) => {
    if (key.startsWith("_carousel_")) return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    return v;
  });
}
function sameContent(a: unknown, b: unknown): boolean {
  return !!a && !!b && contentKey(a) === contentKey(b);
}

// Une nouvelle intention de création (recyclage, actu, brief, raccourci sujet…)
// qui arrive alors qu'un brouillon significatif existe : on demande au lieu de
// silencieusement restaurer l'ancien contenu (et donc ignorer la demande).
export function computeDraftConflict({
  existingFlowState, photoCount, aurianaDemoActive, isFreshStart,
  paramSujet, paramIdeaId, paramAuto, paramFormat, paramCanal, locState,
}: DraftConflictInput) {
  if (aurianaDemoActive) return null;
  // Les photos ont leur propre sauvegarde : une sélection peut exister
  // sans fiche de flux (ancien brouillon ou sauvegarde partielle).
  if (!existingFlowState && photoCount === 0) return null;
  const d = { ...existingFlowState, step: existingFlowState?.step ?? "idea" };
  const hasDraftContent = !!(d.ideaText || d.photoSubject || d.photoDescription || photoCount || d.result || d.editContent || d.selectedFormat);
  if (!hasDraftContent) return null;
  const newSubject = (paramSujet || locState.sujet || locState.subject || "").trim();
  const hasNewIntent = !!(
    isFreshStart ||
    newSubject ||
    locState.fromRecycle ||
    locState.fromBrief ||
    locState.fromCalendar ||
    locState.context ||
    locState.libraryPhotoIds?.length ||
    locState.resumeIdea ||
    paramIdeaId ||
    paramAuto ||
    paramFormat ||
    (photoCount > 0 && paramCanal && paramCanal !== (deriveCanalFromState(d) || d.forcedChannel))
  );
  if (!hasNewIntent) return null;
  // A verified Studio return resumes this exact saved idea, not a new draft.
  if (locState.carouselStudioResume === true && locState.ideaId === d.editingIdeaId) return null;
  // Rouvrir depuis Mes idées le contenu déjà en cours, à l'identique : rien à
  // arbitrer (audit du 01/11). Au moindre écart (retouche ailleurs), on demande.
  if (typeof locState.ideaId === "string" && locState.ideaId === d.editingIdeaId && sameContent(d.result?.raw, locState.resumeIdea?.raw)) return null;
  // Même sujet que le brouillon → pas de conflit, on reprend simplement.
  const hasSource = !!(paramIdeaId || locState.ideaId || locState.fromBrief || locState.fromCalendar || locState.fromRecycle || locState.resumeIdea || locState.libraryPhotoIds?.length);
  if (!isFreshStart && !hasSource && newSubject && newSubject === d.ideaText?.trim()) return null;
  return {
    draft: {
      step: d.step,
      ideaText: d.ideaText || "",
      selectedFormat: d.selectedFormat ?? null,
      result: d.result ?? null,
      editContent: d.editContent || "",
      editingIdeaId: d.editingIdeaId ?? null,
      visualSlides: d.visualSlides ?? [],
      questions: d.questions ?? [],
      answers: d.answers ?? {},
      isLinkedInCarousel: d.isLinkedInCarousel ?? false,
      photoCount,
      photoSubject: d.photoSubject, photoDescription: d.photoDescription,
      forcedChannel: d.forcedChannel,
    },
    // Reprise d'un contenu déjà écrit (calendrier, Mes idées) : la fenêtre
    // parle d'ouvrir ce contenu, pas d'en démarrer un nouveau (QA du 12/11/2026).
    resuming: !!locState.resumeIdea,
    newSubject: newSubject || (locState.resumeIdea ? String(locState.theme || locState.resumeIdea.raw?.subject || "").trim() : ""),
  };
}
