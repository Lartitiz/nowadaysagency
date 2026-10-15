// Sauvegarde locale du parcours /creer (sessionStorage + copie de secours) :
// nettoyage à l'entrée « à blanc » et sur ?new=1, visuels et séquence de
// lancement (CREER_RESULT_KEY), réhydratation des questions et du résultat
// (dont le texte coupé en plein streaming), sauvegarde au fil de l'eau.
// Sorti à l'identique de CreerUnifie.tsx (lot I, docs/robustesse/gros-fichiers.md, fiche 1).
// Un hook par bloc, chacun appelé par la page à l'endroit exact où vivait son
// bloc : l'ordre des effets ne change pas. Recevoir l'ENVELOPPE saveFlowState de
// la page (garde isCurrentCreation), jamais celle de use-flow-persistence.
// ⚠️ useAutoPersistFlow : une clé oubliée = perte silencieuse au rechargement.
// src/test/regeneration-backup.test.tsx lit le texte de ce fichier.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { clearFlowState } from "@/hooks/use-flow-persistence";
import { consumeFreshStart } from "@/lib/creation-navigation";
import { stripFontImportLeakFromSlides } from "@/lib/strip-font-import-leak";
import { parsePendingStreamText } from "@/features/creer/pending-stream";

type SaveFlowState = (state: Record<string, any>) => void;

/** Clé sessionStorage des visuels et de la séquence de lancement d'une création. */
export function creerResultKey(userId: string | undefined, workspaceId: string | null | undefined, creationId: string) {
  return `creer_unifie_result:${userId || "demo"}:${workspaceId}:${creationId}`;
}

export function useFreshEntryCleanup({
  hasSomeContext, shouldRestore, conflictPending, isFreshStart, searchParams, setSearchParams, CREER_RESULT_KEY,
  setStep, setSelectedFormat, setEditorialAngle, setIdeaText, setObjective, setAnswers, setEditContent, setEditingIdeaId,
}: {
  hasSomeContext: boolean;
  shouldRestore: boolean;
  conflictPending: boolean;
  isFreshStart: boolean;
  searchParams: URLSearchParams;
  setSearchParams: (params: URLSearchParams, options?: { replace?: boolean }) => void;
  CREER_RESULT_KEY: string;
  setStep: (step: any) => void;
  setSelectedFormat: (format: string | null) => void;
  setEditorialAngle: (angle: string | null) => void;
  setIdeaText: (text: string) => void;
  setObjective: (objective: string | null) => void;
  setAnswers: (answers: Record<string, string>) => void;
  setEditContent: (content: string) => void;
  setEditingIdeaId: (id: string | null) => void;
}) {
  const clearedFreshStart = useRef(false);

  // When arriving at /creer without params AND no persisted in-progress flow, clear state
  // This distinguishes "fresh sidebar click" from "page reload mid-flow"
  useEffect(() => {
    if (!hasSomeContext && !shouldRestore && !conflictPending) {
      clearFlowState();
      sessionStorage.removeItem(CREER_RESULT_KEY);
      setStep("idea");
      setSelectedFormat(null);
      setEditorialAngle(null);
      setIdeaText("");
      setObjective(null);
      setAnswers({});
      setEditContent("");
      setEditingIdeaId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove ?new=1 from URL after a fresh start so reloads don't wipe the flow
  useEffect(() => {
    if (isFreshStart && !conflictPending) {
      if (!clearedFreshStart.current) {
        clearFlowState();
        clearedFreshStart.current = true;
      }
      setSearchParams(consumeFreshStart(searchParams), { replace: true });
    }
  }, [isFreshStart, conflictPending, searchParams, setSearchParams]);
}

export function useCreerResultSession({
  CREER_RESULT_KEY, searchParams, step, visualSlides, launchResults, setVisualSlides, setLaunchResults,
}: {
  CREER_RESULT_KEY: string;
  searchParams: URLSearchParams;
  step: string;
  visualSlides: any[];
  launchResults: any[];
  setVisualSlides: (slides: any[]) => void;
  setLaunchResults: (results: any[]) => void;
}) {
  // ── Persist generated result to sessionStorage ──
  const resultRestoredRef = useRef(false);

  useEffect(() => {
    if (resultRestoredRef.current) return;
    if (searchParams.get("format") || searchParams.get("sujet")) return;
    resultRestoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(CREER_RESULT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.visualSlides?.length) setVisualSlides(stripFontImportLeakFromSlides(saved.visualSlides));
      if (saved.launchResults?.length) setLaunchResults(saved.launchResults);
    } catch { /* corrupt — ignore */ }
  }, []);

  useEffect(() => {
    if (step === "idea" || step === "format") return;
    try {
      sessionStorage.setItem(CREER_RESULT_KEY, JSON.stringify({
        visualSlides,
        launchResults,
      }));
    } catch { /* quota — ignore */ }
  }, [step, visualSlides, launchResults]);
}

export function useRestorePersistedFlow({
  ps, questions, setQuestions, result, setResult, setPinterestPinHtml, setPhotoBriefOverlayHtml, safeStep, saveFlowState,
}: {
  ps: any;
  questions: any[];
  setQuestions: (questions: any) => void;
  result: any;
  setResult: (result: any) => void;
  setPinterestPinHtml: (html: string | null) => void;
  setPhotoBriefOverlayHtml: (html: string | null) => void;
  safeStep: string;
  saveFlowState: SaveFlowState;
}) {
  // Réhydrate les questions persistées : elles vivent dans useContentGenerator
  // (initialisées à [] à chaque mount) alors que le flux les sauvegarde. Sans
  // ça, restaurer l'étape "questions" afficherait un écran vide.
  useEffect(() => {
    if ((ps?.questions?.length ?? 0) > 0 && questions.length === 0) {
      setQuestions(ps!.questions as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore result from persisted state
  useEffect(() => {
    if (ps?.result && !result) {
      setResult(ps.result);
      // Re-hydrate les states dédiés Pinterest depuis result.raw : sinon, au refresh,
      // pinterestPinHtml / photoBriefOverlayHtml repartent à null et les boutons
      // "Exporter en PNG" et "Ajouter au calendrier" deviennent muets (no-op).
      const raw: any = (ps.result as any)?.raw;
      if (raw?.pin_html) setPinterestPinHtml(raw.pin_html);
      if (raw?.overlay_html) setPhotoBriefOverlayHtml(raw.overlay_html);
    } else if (!ps?.result && !result && (ps?.pendingStream?.text?.length ?? 0) > 40 && safeStep === "result") {
      // Génération interrompue : on reconstruit un résultat depuis le texte déjà
      // streamé — le crédit était débité (JSON tronqué : voir pending-stream.ts).
      const parsed = parsePendingStreamText(ps!.pendingStream!.text);
      setResult({ type: (ps!.pendingStream!.format || ps?.selectedFormat || "post") as any, raw: parsed });
      saveFlowState({ pendingStream: null });
      toast("💾 J'ai récupéré le texte généré avant l'interruption.", {
        description: "Vérifie-le : il peut être incomplet. « Regénérer » en refait une version (1 crédit).",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useAutoPersistFlow({
  conflictPending, step, ideaText, objective, selectedFormat, editorialAngle, answers, editContent, editBaseline, result, regenerationBackup, visualSlides, savedId, questions, inspirationAnalysis, inspirationProposals, inspirationImagePreview, aurianaDemoActive, editingIdeaId, incomingBriefId, currentBriefId, carouselSubMode, slideLength, userSlidesInput, photoDescription, photoSubject, photoEntry, forcedChannel, isLinkedInCarousel, autoFlow, workspaceId, creationId, newsjackingContext, newsjackingSuggestedFormat, calendarPostId, calendarPostDate, saveFlowState,
}: Record<string, any> & { saveFlowState: SaveFlowState }) {
  // Auto-persist state on changes
  useEffect(() => {
    if (conflictPending) return;
    // Persist empty edits as well: an empty field must never revive old text.
    saveFlowState({
        step,
        ideaText,
        objective,
        selectedFormat,
        editorialAngle,
        answers,
        editContent,
        editBaseline,
        // Régénération en cours : la copie de secours garde la version d'avant,
        // pour qu'un rechargement ne la perde pas.
        result: result || regenerationBackup.pending?.result || undefined,
        visualSlides: !result && regenerationBackup.pending ? regenerationBackup.pending.visualSlides : visualSlides,
        savedId,
        questions: questions || [],
        inspirationAnalysis: inspirationAnalysis || undefined,
        inspirationProposals: inspirationProposals || [],
        inspirationImagePreview: inspirationImagePreview || null,
        demoScenario: aurianaDemoActive ? "auriana-carousel" : undefined,
        editingIdeaId,
        incomingBriefId, currentBriefId,
        carouselSubMode,
        slideLength,
        userSlidesInput,
        photoDescription, photoSubject, photoEntry, forcedChannel,
        isLinkedInCarousel,
        autoFlow, workspaceId, creationId, newsjackingContext, newsjackingSuggestedFormat,
        calendarPostId, calendarPostDate,
    });
  }, [conflictPending, step, ideaText, objective, selectedFormat, editorialAngle, answers, editContent, result, visualSlides, savedId, questions, inspirationAnalysis, inspirationProposals, inspirationImagePreview, editingIdeaId, incomingBriefId, currentBriefId, carouselSubMode, slideLength, userSlidesInput, photoDescription, photoSubject, photoEntry, forcedChannel, isLinkedInCarousel, workspaceId, creationId, newsjackingContext, newsjackingSuggestedFormat, calendarPostId, calendarPostDate, regenerationBackup.pending, editBaseline]);
  // Texte reçu en streaming, génération en cours et purge du texte partiel :
  // use-generation-reload-guard.ts (15/10/2026).
}
