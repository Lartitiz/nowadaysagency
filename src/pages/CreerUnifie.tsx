import { restoreCarouselPhotos } from "@/lib/restore-carousel-photos";
import { purePhotoRawOrNull } from "@/lib/pure-photo-slides";
import { recoverStudioPhotos } from "@/features/carousel-studio/bridge";
import { CarouselStudioDialog } from "@/features/carousel-studio/CarouselStudioDialog";
import { CreationUpgradeInvite } from "@/components/CreationUpgradeInvite";
import { invalidateProgressionReceipt } from "../../supabase/functions/_shared/carousel-editorial-snapshot";
import { splitCarouselWarnings } from "@/lib/carousel-warnings";
import { prepareIdeaPhotos } from "@/features/creer/prepare-idea-photos";
import { useCreationEntryKey } from "@/hooks/use-creation-entry-key";
import { useTextEditHistory } from "@/hooks/use-text-edit-history";
import { editHistoryShortcut } from "@/lib/edit-history-shortcut";
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { invokeWithHeartbeat } from "@/lib/invoke-with-heartbeat";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { slideText } from "@/lib/slide-text";
import { deriveCanalFromState, mapFormatToContentType } from "@/features/creer/format-mappers";
import { countContentBriefs, saveContentBrief } from "@/features/creer/content-brief";
import { flattenResultForEdit } from "@/features/creer/edit-text-from-result";
import { computeDraftConflict } from "@/features/creer/draft-conflict";
import { type Step, resolveSafeStep, isInterruptedGeneration } from "@/features/creer/creer-step";
import { pickNonEmpty } from "@/features/creer/photo-source";
import { applyEditedText, structuredEditText, withoutEditedText } from "@/features/creer/edited-text";
import { replaceSlideText } from "@/lib/carousel-html-edit";
import { ownPhotos } from "@/lib/stock-ambient-photos";
import { findPublishableImageUrl, REASON_IMAGE_MANQUANTE, INSTAGRAM_DIRECT_MAX_IMAGES } from "@/features/creer/publish-guards";
import { useSearchParams, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { recordCreationResume } from "@/lib/retour-apres-detour";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CreerTransformTab from "@/components/creer/CreerTransformTab";
import PublishOrScheduleDialog from "@/components/creer/PublishOrScheduleDialog";
import { useSocialConnections } from "@/hooks/use-social-connections";
import LowCreditsBanner from "@/components/creer/LowCreditsBanner";
import PhotoMissingDialog from "@/components/creer/PhotoMissingDialog";
import ConfirmResetDialog from "@/components/creer/ConfirmResetDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Loader2, Palette, Sparkles, Undo2, Redo2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

import BrandReviewGate from "@/components/branding/BrandReviewGate";
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";
import { useLinkedInCarouselCaption } from "@/hooks/use-linkedin-carousel-caption";
import { useUserSlidesGenerate } from "@/hooks/use-user-slides-generate";
import { useSelectInspirationProposal } from "@/hooks/use-select-inspiration-proposal";
import { useCalendarSave } from "@/hooks/use-calendar-save";
import { useFormatNext } from "@/hooks/use-format-next";
import { useGenerateVisuals } from "@/hooks/use-generate-visuals";
import { applyMixRenderMemory, mergeEditorRaw, withRaw } from "@/lib/mix-layout-memo";
import { withVisualCtaLabels } from "@/lib/carousel-cta-label";
import { useDoGenerate } from "@/hooks/use-do-generate";
import { useRegenerationBackup } from "@/hooks/use-regeneration-backup";
import CreerStepIdea from "@/components/creer/CreerStepIdea";
// Code-splitting : les étapes après l'écran « idée » sont chargées à la demande
// (chunk /creer initial allégé → premier écran plus rapide).
const CreerStepFormat = lazy(() => import("@/components/creer/CreerStepFormat"));
const CreerStepQuestions = lazy(() => import("@/components/creer/CreerStepQuestions"));
import { NEWSJACKING_FIELD_QUESTION } from "@/lib/field-question";
const CreerStepResult = lazy(() => import("@/components/creer/CreerStepResult"));
import type { CarouselColors } from "@/components/creer/formatRenderers/CarouselPhotoResult";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
const CreerStepEdit = lazy(() => import("@/components/creer/CreerStepEdit"));
import CreerStepper, { type StepperKey } from "@/components/creer/CreerStepper";
const PinterestInspirationStep = lazy(() => import("@/components/creer/PinterestInspirationStep"));
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { useUserPhotos } from "@/hooks/use-user-photos";
const StructureReviewStep = lazy(() => import("@/components/creer/StructureReviewStep"));
// Mode « Mes slides » : l'utilisatrice fournit le texte, l'IA ne fait que le design.
const UserSlidesStep = lazy(() => import("@/components/creer/UserSlidesStep"));
import type { UserSlidesInputDraft } from "@/components/creer/UserSlidesStep";
const HookSelectionStep = lazy(() => import("@/components/creer/HookSelectionStep"));
// Type-only : n'entre pas dans le bundle, le composant reste lazy.
import type { ReelHook } from "@/components/creer/HookSelectionStep";
import CarouselStructureLoader from "@/components/creer/CarouselStructureLoader";
import CarouselAdvancedOptions from "@/components/creer/CarouselAdvancedOptions";

import PhotoDumpProgress from "@/components/creer/PhotoDumpProgress";
import { runPhotoDump, PremiumRequiredError, type DumpProgressItem } from "@/lib/photo-dump";
import { usePhotoWishlistMutations } from "@/hooks/use-photo-wishlist";
import { downscalePhotosForVision } from "@/lib/image-vision";
import type { SlideProposal, StructureProposal } from "@/components/creer/StructureReviewStep";

import { useContentGenerator } from "@/hooks/use-content-generator";
import { normalizeFormat } from "@/lib/format-normalizer";
import { stripFontImportLeakFromSlides } from "@/lib/strip-font-import-leak";
import { EDITORIAL_ANGLES, LINKEDIN_EDITORIAL_ANGLES, PINTEREST_EDITORIAL_ANGLES, PINTEREST_VISUAL_ANGLES, normalizeObjective } from "@/lib/content-structures";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
// DEMO_DATA n'est plus importé directement — on utilise demoData du context
import { useWorkspaceId, useWorkspaceReady, useIsOwnSpace } from "@/hooks/use-workspace-query";
import { useCarouselAutosave } from "@/hooks/use-carousel-autosave";
import { useCarouselQuality } from "@/hooks/use-carousel-quality";
import CarouselSaveStatus from "@/components/creer/CarouselSaveStatus";
import { useCreerExports } from "@/hooks/use-creer-exports";
import { useLaunchSequence } from "@/hooks/use-launch-sequence";
import { useReelHooks } from "@/hooks/use-reel-hooks";
import { useReelArtifact } from "@/hooks/use-reel-artifact";
import { useCreerPublish } from "@/hooks/use-creer-publish";
import { useCreerEntryInit } from "@/hooks/use-creer-entry-init";
import { creerResultKey, useFreshEntryCleanup, useCreerResultSession, useRestorePersistedFlow, useAutoPersistFlow } from "@/hooks/use-creer-flow-persistence";
import { useLibraryPhotosPreload, usePhotosRehydration, usePhotosSnapshot, useAddCarouselPhoto, useLibraryAutoCast } from "@/hooks/use-creer-photos";
import LaunchSequenceResults from "@/components/creer/LaunchSequenceResults";
import { useBrandCharter } from "@/hooks/use-branding";
import { useActivityExamples } from "@/hooks/use-activity-examples";
import { supabase } from "@/integrations/supabase/client";
import { useGenerationReloadGuard } from "@/hooks/use-generation-reload-guard";
import ResultEmptyState from "@/components/creer/ResultEmptyState";
import { loadFlowState, saveFlowState as persistFlowState, clearFlowState, savePhotos as persistPhotos, loadPhotos, setFlowWorkspaceId, setFlowUserId } from "@/hooks/use-flow-persistence";
import DraftConflictDialog from "@/components/creer/DraftConflictDialog";
import { isAurianaDemoEmail, AURIANA_DEMO_SUBJECT, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";

// Phase 4: streaming SSE is now encapsulated inside useContentGenerator
import { useUserPlan } from "@/hooks/use-user-plan";



export default function CreerUnifie() {
  const entryLocation = useLocation();
  const navigationType = useNavigationType();
  const entryKey = useCreationEntryKey(entryLocation.search, entryLocation.key, navigationType, !!entryLocation.state);
  const workspaceId = useWorkspaceId();
  const ready = useWorkspaceReady();
  const { user } = useAuth();
  if (!ready) return null;
  setFlowUserId(user?.id && user.id !== "demo-user" ? user.id : null);
  setFlowWorkspaceId(workspaceId);
  return <CreerWorkspace key={`${user?.id || "demo"}:${workspaceId}:${entryKey}`} />;
}

function CreerWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const brandReturnRef = useRef({ path: location.pathname + location.search, state: location.state });
  const { session } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  // Fiche de marque en attente de validation → on renvoie vers elle (voir plus bas).
  const { pending: brandReviewPending, checking: brandReviewChecking } = usePendingBrandReview();
  // Le portail fiche de marque ne s'applique qu'à l'ENTRÉE du parcours. La
  // fiche peut passer en pending_review PENDANT le travail (diagnostic-
  // enrichment est asynchrone) : au prochain refetch de la requête
  // (reconnexion réseau, remontage), l'écran de création était REMPLACÉ en
  // plein travail par le portail — état des questions/réponses perdu (vécu
  // 13/08, 1er contenu post-onboarding). Une fois le flux affiché, on ne
  // l'arrache plus ; le portail attendra la prochaine entrée sur /creer.
  const flowShownRef = useRef(false);
  const workspaceId = useWorkspaceId();
  const workspaceReady = useWorkspaceReady();
  const isOwnSpace = useIsOwnSpace();
  const { data: charterData } = useBrandCharter();
  const { activityText } = useActivityExamples();
  const { remainingWithBonus, loading: planLoading, verified: planVerified, plan, usage, refresh: refreshPlan } = useUserPlan();

  // URL params
  const paramFormat = searchParams.get("mode") === "transform" ? null : searchParams.get("format");
  const paramSujet = searchParams.get("sujet") || searchParams.get("subject") || "";
  const paramObjectif = searchParams.get("objectif") || searchParams.get("objective") || "";
  const paramMode = searchParams.get("mode");
  const paramFrom = searchParams.get("from");
  const paramAngle = searchParams.get("angle");
  // "auto=1" : le premier carrousel démarre depuis le diagnostic. Pour les
  // produits, on attend les photos importées avant de lancer la génération.
  const paramAuto = searchParams.get("auto") === "1";
  const paramIdeaId = searchParams.get("idea_id");
  const paramCalendarDate = searchParams.get("calendar_date") || "";

  const isFreshStart = searchParams.get("new") === "1";

  // Location state (from calendar, etc.)
  const locState = (location.state as any) || {};

  // Check if we have URL params that should override persisted state
  const paramCanal = searchParams.get("canal");
  const hasUrlParams = !!(paramFormat || paramCanal || paramSujet || paramObjectif || locState.fromCalendar);

  // Restore persisted state if:
  // 1. We have URL params / location state (coming back from calendar, etc.)
  // 2. OR there is a recent session in storage (survives HMR / tab refresh)
  const hasSomeContext = hasUrlParams || !!location.state;

  const candidateFlowState = loadFlowState();
  const existingFlowState = candidateFlowState?.workspaceId && candidateFlowState.workspaceId !== workspaceId ? null : candidateFlowState;
  const aurianaDemoActive = locState?.demoScenario === "auriana-carousel" || existingFlowState?.demoScenario === "auriana-carousel";

  // ── Garde-fou « il y a déjà un contenu en cours » ──
  const [draftConflict] = useState(() => computeDraftConflict({
    existingFlowState, photoCount: loadPhotos().length, aurianaDemoActive, isFreshStart,
    paramSujet, paramIdeaId, paramAuto, paramFormat, paramCanal, locState,
  }));
  const [conflictResolved, setConflictResolved] = useState(false);
  const conflictPending = !!draftConflict && !conflictResolved;

  const shouldRestore = !isFreshStart && !draftConflict && (hasSomeContext || aurianaDemoActive || loadPhotos().length > 0 || (existingFlowState !== null && !!existingFlowState.step));
  const persistedState = useRef(shouldRestore ? (existingFlowState || null) : null);

  // Core state — restore from sessionStorage if available
  const ps = persistedState.current;
  const [creationId, setCreationId] = useState(ps?.creationId || crypto.randomUUID());
  const activeVisit = useRef(false);
  useEffect(() => { activeVisit.current = true; return () => { activeVisit.current = false; }; }, []);
  const activeCreation = useRef(creationId);
  activeCreation.current = creationId;
  const isCurrentCreation = useCallback(() => activeVisit.current && activeCreation.current === creationId && !conflictPending, [creationId, conflictPending]);
  // Old callbacks must not write through the global scope after A → B → A.
  const saveFlowState = useCallback((state: Parameters<typeof persistFlowState>[0]) => {
    if (isCurrentCreation()) persistFlowState(state);
  }, [isCurrentCreation]);
  const savePhotos = useCallback((photos: any[]) => {
    if (isCurrentCreation()) return persistPhotos(photos);
    return Promise.resolve();
  }, [isCurrentCreation]);

  const [transformOpen, setTransformOpen] = useState(paramMode === "transform");
  useEffect(() => {
    if (paramMode === "transform") setTransformOpen(true);
  }, [paramMode, location.key]);
  const closeTransform = () => {
    setTransformOpen(false);
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("mode");
    cleaned.delete("format");
    setSearchParams(cleaned, { replace: true });
  };
  // Mode « 1er contenu » (auto=1) figé pour TOUTE la session du parcours :
  // le paramètre d'URL est retiré une fois l'init consommée (voir plus bas),
  // donc paramAuto retombe à false — le mode doit survivre en state + dans la
  // persistance du flux pour que le récap « Ton premier contenu » tienne au
  // reload. On n'hérite du flag persisté QUE sans nouveaux params d'URL (une
  // nouvelle entrée avec params est un NOUVEAU parcours, jamais un 1er contenu).
  const [autoFlow] = useState<boolean>(paramAuto || (!hasUrlParams && !!ps?.autoFlow));
  // Un ordre de génération n'est valable que pour cette visite. Le rechargement
  // après une requête interrompue doit proposer une reprise, jamais repayer seul.
  const autoGeneratePendingRef = useRef(paramAuto);

  // ── Canal forcé via URL (?canal=) vs canal du brouillon restauré ──
  // Les raccourcis "Créer/Programmer sur tel réseau" (dashboard) doivent PRIMER sur
  // un brouillon d'un AUTRE canal : on repart à l'étape format sur le canal demandé
  // (le sujet est conservé). CreerStepFormat pré-sélectionne ensuite ce canal.
  const FORCED_CANALS = ["instagram", "linkedin", "pinterest", "newsletter"] as const;
  type ForcedChannel = (typeof FORCED_CANALS)[number];
  const [forcedChannel, setForcedChannel] = useState<ForcedChannel | null>(() =>
    (FORCED_CANALS as readonly string[]).includes(paramCanal || "") ? (paramCanal as ForcedChannel) : ps?.forcedChannel ?? null);
  const restoredCanal = deriveCanalFromState(ps);
  const canalConflict = !!forcedChannel && !!restoredCanal && restoredCanal !== forcedChannel;
  const safeStep = resolveSafeStep(ps, {
    canalConflict,
    hasIdea: !!(ps?.ideaText || paramSujet || locState.sujet || locState.subject),
    photoCount: loadPhotos().length,
  });
  const [step, setStep] = useState<Step>(safeStep);
  
  const ideaHistory = useTextEditHistory(ps?.ideaText ?? (paramSujet || locState.sujet || locState.subject || ""));
  const ideaText = ideaHistory.value;
  // Incoming sources and new creations establish a new baseline, not an edit.
  const setIdeaText = ideaHistory.reset;
  const [objective, setObjective] = useState<string | null>(
    ps?.objective || paramObjectif || locState.objectif || locState.objective || null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(canalConflict ? null : (ps?.selectedFormat || paramFormat || null));
  const [editorialAngle, setEditorialAngle] = useState<string | null>(ps?.editorialAngle || null);
  const [answers, setAnswers] = useState<Record<string, string>>(ps?.answers || {});
  // Lot 7 reels : choix de l'angle d'attaque avant génération (use-reel-hooks.ts).
  const reelHooksStep = useReelHooks();
  const { reelHooks, hooksLoading, hooksRefreshing, hooksError, selectedReelHook, setSelectedReelHook, pendingReelAnswersRef } = reelHooksStep;
  const [editContent, setEditContent] = useState(ps?.editContent || "");
  // Texte de l'étape « Modifier » à son ouverture (ou à la dernière sauvegarde) :
  // sert à savoir s'il reste des modifications non appliquées.
  const [editBaseline, setEditBaseline] = useState<string | null>(ps?.editBaseline ?? null);
  const [existingCalendarContent, setExistingCalendarContent] = useState<string | null>(null);
  const [calendarPostId, setCalendarPostId] = useState<string | null>(locState?.calendarPostId || searchParams.get("calendar_id") || ps?.calendarPostId || null);
  const [calendarPostDate, setCalendarPostDate] = useState<string | null>(locState?.postDate || ps?.calendarPostDate || null);
  const fromCalendar = !!calendarPostId;

  // Photo states (carousel photo + post photo)
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | "pure_photo" | "user_slides" | null>(canalConflict ? null : (ps?.carouselSubMode ?? null));
  // Longueur choisie via les puces « Longueur » (CreerStepFormat).
  // "auto" = aucun slide_count envoyé, l'edge applique ses cibles adaptatives.
  const [slideLength, setSlideLength] = useState<"auto" | "short" | "classic" | "long">(ps?.slideLength ?? "auto");
  const [userSlidesInput, setUserSlidesInput] = useState<UserSlidesInputDraft | null>(ps?.userSlidesInput ?? null);
  const slideCountChoice = slideLength === "short" ? 4 : slideLength === "classic" ? 7 : slideLength === "long" ? 10 : undefined;
  // Init à [] : le base64 n'est plus stocké inline (cf use-flow-persistence
  // hybride). Les photos sont rehydratées en asynchrone par l'effet plus bas
  // (IndexedDB pour les dépôts, refetch serveur pour la photothèque).
  const [uploadedPhotos, setUploadedPhotos] = useState<any[]>([]);
  const [photosRestored, setPhotosRestored] = useState(false);
  const [isLoadingLibraryPhotos, setIsLoadingLibraryPhotos] = useState(false);
  // Snapshot des photos au moment de la génération du carrousel.
  // Sert de source de vérité pour handleGenerateVisuals si le state UI est reset.
  const [generatedWithPhotos, setGeneratedWithPhotos] = useState<any[]>([]);
  // ═══ Photo dump (lot 3 mise en scène) — pure_photo uniquement ═══
  // Toggle « Compléter en photo dump » remonté depuis l'étape format (ON par défaut).
  const [photoDumpEnabled, setPhotoDumpEnabled] = useState(true);
  // Résolution en cours : bloque la réentrance et affiche PhotoDumpProgress.
  const [photoDumpResolving, setPhotoDumpResolving] = useState(false);
  const [photoDumpProgress, setPhotoDumpProgress] = useState<{
    narrativeThread: string;
    items: DumpProgressItem[];
  } | null>(null);
  // Beats introuvables → wishlist « Photos à prendre » (source directive).
  const { addDirective: addWishlistDirective } = usePhotoWishlistMutations();
  // Le dump ne se résout qu'UNE fois par parcours (une régénération réutilise
  // les photos résolues au lieu de re-facturer les slides générées).
  const photoDumpDoneRef = useRef(false);
  // Miroir synchrone de uploadedPhotos.length pour handleAddCarouselPhoto
  // (deux ajouts avant re-render doivent produire des index distincts).
  const carouselPhotoCountRef = useRef(0);
  // Cache de luminance par photo (session) : mesurer coûte un décodage canvas et
  // peut échouer par intermittence → le voile retombait au pire cas. On mémorise
  // la mesure réussie par identité de photo pour que les régénérations la
  // réutilisent au lieu de re-mesurer (et de risquer un null → voile trop sombre).
  const luminanceCacheRef = useRef<Map<string, { top: number; center: number; bottom: number }>>(new Map());
  // Dialog "photos manquantes" : remplace le downgrade silencieux.
  const [photoMissingDialog, setPhotoMissingDialog] = useState<{
    open: boolean;
    rawType: "photo" | "mix" | null;
  }>({ open: false, rawType: null });
  const [photoDescription, setPhotoDescription] = useState(ps?.photoDescription ?? "");
  const photoSubjectHistory = useTextEditHistory(ps?.photoSubject ?? ps?.ideaText ?? "");
  const photoSubject = photoSubjectHistory.value;
  const setPhotoSubject = photoSubjectHistory.reset;
  const [photoEntry, setPhotoEntry] = useState(ps?.photoEntry ?? (shouldRestore && loadPhotos().length > 0));
  const [photoMode, setPhotoMode] = useState(false);
  const [demoGenerating, setDemoGenerating] = useState(false);
  const [pinterestData, setPinterestData] = useState<{ link?: string; boardId?: string; boardName?: string } | null>(null);
  const [isLinkedInCarousel, setIsLinkedInCarousel] = useState(canalConflict ? false : (ps?.isLinkedInCarousel ?? false));
  const [pinterestPinHtml, setPinterestPinHtml] = useState<string | null>(null);
  const [pinterestVisualGenerating, setPinterestVisualGenerating] = useState(false);
  const [inspirationLoading, setInspirationLoading] = useState(false);
  const [inspirationAnalysis, setInspirationAnalysis] = useState<any>(ps?.inspirationAnalysis || null);
  const [inspirationProposals, setInspirationProposals] = useState<any[]>(ps?.inspirationProposals || []);
  const [chosenProposal, setChosenProposal] = useState<any>(null);
  const [inspirationImageBase64, setInspirationImageBase64] = useState<string | null>(null);
  const [inspirationImagePreview, setInspirationImagePreview] = useState<string | null>(ps?.inspirationImagePreview || null);
  const [photoBriefResult, setPhotoBriefResult] = useState<any>(null);
  const [currentBriefId, setCurrentBriefId] = useState<string | null>(ps?.currentBriefId || null);
  // Réponses pré-remplies quand on arrive depuis « Créer à partir de ce brief »
  // (boîte à idées) — affichées telles quelles sur l'étape questions.
  const [briefPrefillAnswers, setBriefPrefillAnswers] = useState<Record<string, string> | null>(null);
  // Id du brief d'origine quand on vient de « Créer à partir de ce brief » :
  // on met à jour ce brief au lieu d'en créer un doublon à la génération.
  const [incomingBriefId, setIncomingBriefId] = useState<string | null>(ps?.incomingBriefId || null);
  const [briefsCount, setBriefsCount] = useState(0);
  const [photoBriefOverlayHtml, setPhotoBriefOverlayHtml] = useState<string | null>(null);
  const [structureProposal, setStructureProposal] = useState<StructureProposal | null>(null);
  // "Mode qualité Max" : rédaction du carrousel par Opus (plus soigné, ~2-3x plus lent).
  // Off par défaut → Sonnet (rapide), plus d'escalade silencieuse.
  const [qualityMax, setQualityMax] = useState(false);
  // Qualité Max = fonctionnalité Premium. Sur un plan gratuit le toggle est verrouillé
  // (badge + upsell) au lieu d'échouer à la génération. `plan` défaut "free" pendant le
  // chargement → fail closed (verrouillé tant qu'on ne sait pas que l'utilisatrice est payante).
  const qualityMaxLocked = !planVerified || plan === "free";
  // Garde : si l'état avait été laissé ON (toggle mémorisé d'une session) alors que le plan
  // est gratuit, on le remet à OFF pour ne JAMAIS envoyer `qualityMax` côté serveur (sinon
  // échec quota). Couvre tous les sites d'envoi d'un seul endroit.
  useEffect(() => {
    if (planVerified && qualityMaxLocked && qualityMax) setQualityMax(false);
  }, [planVerified, qualityMaxLocked, qualityMax]);
  // « Illustration de couverture » : Recraft génère une grande illustration de
  // marque en couverture (layout ancré en bas). Off par défaut (dosé + coût).
  // Premium, même verrou fail-closed que Qualité Max.
  const [coverIllustration, setCoverIllustration] = useState(false);
  const coverIllustrationLocked = !planVerified || plan === "free";
  useEffect(() => {
    if (planVerified && coverIllustrationLocked && coverIllustration) setCoverIllustration(false);
  }, [planVerified, coverIllustrationLocked, coverIllustration]);
  const [structureLoading, setStructureLoading] = useState(false);
  const [lastConfirmedStructure, setLastConfirmedStructure] = useState<SlideProposal[] | null>(null);
  const [lastScenarioOrigin, setLastScenarioOrigin] = useState<"automatic" | "user_validated" | null>(null);
  const [lastNarrativeThread, setLastNarrativeThread] = useState<string | null>(null);
  const [newsjackingContext, setNewsjackingContext] = useState<string | null>(ps?.newsjackingContext || null);
  const [newsjackingSuggestedFormat, setNewsjackingSuggestedFormat] = useState<string | null>(ps?.newsjackingSuggestedFormat || null);

  // ═══ Régime « texte d'abord » (lot 1 casting) ═══
  // Newsjacking + carrousel mixte sans photos : le texte est rédigé d'abord, chaque
  // slide photo sort avec une directive d'image, et le casting se fait dans le résultat.
  // Lot 4 : ce régime est aussi accessible hors newsjacking via le choix explicite
  // « J'écris d'abord » dans la fourche du mixte (remonté par CreerStepFormat).
  const [explicitTextFirstMix, setExplicitTextFirstMix] = useState(false);
  const isTextFirstMix = carouselSubMode === "mix" && (!!newsjackingContext || explicitTextFirstMix) && uploadedPhotos.length === 0;
  // Catalogue bibliothèque envoyé à l'edge (texte léger : descriptions + type) pour le
  // matching strict. Les lignes sont snapshotées au moment de la génération pour que
  // library_photo_index (1-based) reste résoluble même si la bibliothèque bouge entre-temps.
  const { data: libraryPhotosForCasting } = useUserPhotos();
  const textFirstCatalogRows = useMemo(
    () =>
      (libraryPhotosForCasting || [])
        .filter((p) => p.status === "ready" && (p.description || "").trim())
        .slice(0, 40),
    [libraryPhotosForCasting],
  );
  const textFirstCatalog = useMemo(
    () =>
      textFirstCatalogRows.map((p, i) => ({
        index: i + 1,
        description: (p.description || "").slice(0, 400),
        kind: p.kind || undefined,
      })),
    [textFirstCatalogRows],
  );
  const textFirstRowsSnapshotRef = useRef<UserPhotoRow[]>([]);
  const uploadedPhotosLiveRef = useRef<any[]>(uploadedPhotos);
  uploadedPhotosLiveRef.current = uploadedPhotos;




  // Le canal demandé via l'URL (?canal=) est géré de façon déterministe à
  // l'initialisation (canalConflict ci-dessus) + pré-sélectionné dans
  // CreerStepFormat via la prop forcedChannel. Plus d'effet de priming fragile ici.

  // Charger le nombre de briefs existants quand on arrive sur les questions
  useEffect(() => {
    if (step !== "questions" || !session?.user?.id) return;
    countContentBriefs(session.user.id, workspaceId).then(setBriefsCount);
  }, [step, session?.user?.id, workspaceId]);

  const { launchResults, setLaunchResults, launchIndex, setLaunchIndex, launchGenerating, runLaunchSequence } = useLaunchSequence();

  // Post-generation states
  const [saving, setSaving] = useState(false);
  const [saveIdeaDialogOpen, setSaveIdeaDialogOpen] = useState(false);
  const [ideaSaving, setIdeaSaving] = useState(false);
  const [savedIdeaVersion, setSavedIdeaVersion] = useState<{ signature: string; complete: boolean } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(ps?.savedId || null);
  // L'idée de départ (« Créer ce contenu » depuis /idees ou la fiche du
  // calendrier) : gardée tout le long pour relier le contenu à l'idée quand il
  // est posé au calendrier (l'idée passe alors en « Créée »).
  // Recover historical broken resumes without letting a blank page overwrite
  // the old saved content when a different subject is entered.
  const orphanedEmptyDraft = ps?.step === "idea" && !ps?.ideaText?.trim() && !ps?.result && !ps?.editContent &&
    !ps?.photoSubject && !ps?.photoDescription && loadPhotos().length === 0;
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(paramIdeaId ?? (typeof locState.ideaId === "string" ? locState.ideaId : null) ?? (orphanedEmptyDraft ? null : ps?.editingIdeaId) ?? null);
  // Entrée « à blanc » et ?new=1 : nettoyage du brouillon (use-creer-flow-persistence.ts).
  // Appelé ici (et non plus haut) car il a besoin de setEditingIdeaId ; toujours
  // AVANT useCreerResultSession, qui relit ce que ce nettoyage efface.
  const CREER_RESULT_KEY = creerResultKey(session?.user?.id, workspaceId, creationId);
  useFreshEntryCleanup({
    hasSomeContext, shouldRestore, conflictPending, isFreshStart, searchParams, setSearchParams, CREER_RESULT_KEY,
    setStep, setSelectedFormat, setEditorialAngle, setIdeaText, setObjective, setAnswers, setEditContent, setEditingIdeaId,
  });
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  // Visual states (carousel only)
  const [visualSlides, setVisualSlides] = useState<{ slide_number: number; html: string }[]>(stripFontImportLeakFromSlides(ps?.visualSlides || []));
  const [visualLoading, setVisualLoading] = useState(false);
  // Échec des tentatives AUTO de visuels (elles sont volontairement muettes en
  // toast) : sans ce message, le loader retombe sur le bouton « Créer les
  // visuels » sans un mot — l'utilisatrice ne sait pas que ça a échoué ni
  // qu'il faut recliquer (vécu 21/07, même famille que le faux « Génération
  // en cours » Pinterest #584).
  const [visualsAutoError, setVisualsAutoError] = useState<string | null>(null);
  // Progression RÉELLE de la génération des visuels (events SSE de l'edge :
  // lots de slides terminés). null = pas d'info (fallback barre simulée).
  const [visualChunkProgress, setVisualChunkProgress] = useState<{ done: number; total: number } | null>(null);
  // Surcharge de couleurs du carrousel (null = couleurs de la charte). Réinitialisée à chaque nouvelle génération.
  const [carouselColors, setCarouselColors] = useState<CarouselColors | null>(null);
  // Visuels périmés (slides éditées depuis le dernier rendu) : bloque publication
  // et avertit à l'export pour ne pas publier/télécharger une version obsolète.
  const [carouselVisualsStale, setCarouselVisualsStale] = useState(false);
  

  // ── Persist generated result to sessionStorage (use-creer-flow-persistence.ts) ──
  useCreerResultSession({ CREER_RESULT_KEY, searchParams, step, visualSlides, launchResults, setVisualSlides, setLaunchResults });

  const {
    generate,
    generating,
    generationStage,
    draftSlides,
    outlineTitles,
    result,
    setResult,
    error,
    quotaExhausted,
    markQuotaExhausted,
    clearQuotaExhausted,
    reset: resetGenerator,
    generateQuestions,
    loadingQuestions,
    questions,
    setQuestions,
    questionsError,
    generateStream,
    streamingContent,
    streaming,
    streamDone,
    streamStage,
    streamReset,
  } = useContentGenerator();
  // Filet « Régénérer » / « Changer d'angle » : la version d'avant (retouches
  // comprises) revient si la nouvelle échoue, et reste à un clic sinon.
  const regenerationBackup = useRegenerationBackup({
    result,
    step,
    busy: generating || streaming || structureLoading || photoDumpResolving || hooksLoading,
    restore: (snapshot) => {
      setResult(snapshot.result);
      setVisualSlides(snapshot.visualSlides);
      setEditContent(snapshot.editContent);
      setStep("result");
    },
  });
  const regenerationSnapshot = () => ({ result, visualSlides, editContent });
  const currentWarnings = useMemo(() => splitCarouselWarnings(invalidateProgressionReceipt(result?.raw || {}), carouselSubMode), [result?.raw, carouselSubMode]);

  const [studioSlideId, setStudioSlideId] = useState<string | null>(null);
  const carouselCloudEnabled = workspaceReady && !!session?.user?.id && !isDemoMode && !aurianaDemoActive && step === "result" && selectedFormat === "carousel" && !!(result?.raw?.carousel_editor_version || result?.raw?.carousel_studio_version);
  const openCarouselStudio = (id: string) => {
    if (id.startsWith("index:")) {
      const index = Number(id.slice(6));
      const raw = result?.raw;
      if (!raw?.slides?.[index]) return;
      const slides = raw.slides.map((s: any) => ({ ...s, editor_id: s.editor_id || crypto.randomUUID() }));
      setResult(prev => prev ? { ...prev, raw: { ...raw, slides, _carousel_document_id: raw._carousel_document_id || crypto.randomUUID(), carousel_studio_version: 1 } } : prev);
      setStudioSlideId(slides[index].editor_id);
    } else setStudioSlideId(id);
  };
  const carouselSave = useCarouselAutosave({
    enabled: carouselCloudEnabled,
    userId: session?.user?.id || "", workspaceId, isOwnSpace, ideaId: editingIdeaId,
    raw: result?.raw, title: ideaText, channel: isLinkedInCarousel ? "linkedin" : "instagram",
    onId: (id) => { if (!isCurrentCreation()) return; setEditingIdeaId(id); saveFlowState({ editingIdeaId: id }); },
    onSaved: (meta) => { if (isCurrentCreation()) setResult((prev: any) => prev ? { ...prev, raw: { ...prev.raw, _carousel_cloud: meta } } : prev); },
    onRestore: (raw) => { if (!isCurrentCreation()) return; setResult((prev: any) => prev ? { ...prev, raw } : prev); setVisualSlides(raw.visual_html || []); },
  });
  useEffect(() => {
    if (!photosRestored || !result?.raw?.slides?.some((s: any) => s.studio_image_receipt) || conflictPending) return;
    setUploadedPhotos(prev => {
      const next = recoverStudioPhotos(result.raw, prev);
      return next.length === prev.length && next.every((p, i) => p === prev[i]) ? prev : next;
    });
  }, [result?.raw, conflictPending, photosRestored]);
  const carouselQuality = useCarouselQuality(visualSlides, selectedFormat === "carousel" && step === "result" && !visualLoading && !generating);

  // Réhydrate les questions et le résultat persistés (use-creer-flow-persistence.ts)
  useRestorePersistedFlow({ ps, questions, setQuestions, result, setResult, setPinterestPinHtml, setPhotoBriefOverlayHtml, safeStep, saveFlowState });

  // Warn if AI forgot the carousel caption
  const warnedCaptionRef = useRef<any>(null);
  useEffect(() => {
    if (selectedFormat !== "carousel") return;
    // « Mes slides » : la légende est celle de l'utilisatrice (souvent vide,
    // c'est un choix) — pas d'IA en cause, pas d'avertissement.
    if (carouselSubMode === "user_slides") return;
    const r: any = (result as any)?.raw;
    if (!r?.slides || warnedCaptionRef.current === r) return;
    const c = r.caption || {};
    const isEmpty = !c.hook && !c.body && !c.cta && (!c.hashtags || c.hashtags.length === 0);
    if (isEmpty) {
      console.warn("[carousel] caption manquante dans la réponse IA", r);
      const msg = isLinkedInCarousel
        ? "L'IA a oublié la légende, vous pouvez l'écrire à la main."
        : "L'IA a oublié la légende, tu peux l'écrire à la main 🌸";
      toast(msg);
      warnedCaptionRef.current = r;
    }
  }, [result, selectedFormat]);

  // Demo mode: pre-fill with carousel example (type dynamique selon le profil)
  useEffect(() => {
    if (aurianaDemoActive) return;
    if (!isDemoMode || !demoData) return;
    const demo = (demoData as any)?.carousel_photo_demo;
    if (!demo) return;
    setIdeaText(demo.subject);
    setSelectedFormat("carousel");
    setCarouselSubMode((demo.carousel_type as "text" | "photo" | "mix" | "pure_photo" | "user_slides") || "text");
    setObjective(demo.objective);
    setStep("format");
    setResult(null);
    setDemoGenerating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aurianaDemoActive, isDemoMode]);

  // Auto-persist state on changes (use-creer-flow-persistence.ts)
  useAutoPersistFlow({
    conflictPending, step, ideaText, objective, selectedFormat, editorialAngle, answers, editContent, editBaseline, result, regenerationBackup, visualSlides, savedId, questions, inspirationAnalysis, inspirationProposals, inspirationImagePreview, aurianaDemoActive, editingIdeaId, incomingBriefId, currentBriefId, carouselSubMode, slideLength, userSlidesInput, photoDescription, photoSubject, photoEntry, forcedChannel, isLinkedInCarousel, autoFlow, workspaceId, creationId, newsjackingContext, newsjackingSuggestedFormat, calendarPostId, calendarPostDate, saveFlowState,
  });

  // Filets anti-perte au rechargement en pleine génération (texte reçu,
  // génération en cours, purge) : use-generation-reload-guard.ts.
  const interruptedGeneration = useGenerationReloadGuard({
    restoredInterrupted: safeStep === "result" && isInterruptedGeneration(ps),
    step, result, streaming, streamingContent, selectedFormat, conflictPending, saveFlowState,
    busy: generating || streaming || structureLoading || photoDumpResolving || pinterestVisualGenerating,
  });

  // Pre-fill from URL/state & auto-advance (use-creer-entry-init.ts)
  const { initDone, justStrippedRef } = useCreerEntryInit({
    conflictPending, brandReviewChecking, brandReviewPending, flowShownRef, ps, hasUrlParams, location, locState, searchParams, setSearchParams, paramSujet, paramObjectif, paramFormat, paramIdeaId, paramAngle, paramCanal, paramAuto, paramMode, saveFlowState, setIdeaText, setObjective, setExistingCalendarContent, setNewsjackingContext, setSelectedFormat, setCarouselSubMode, setResult, setEditingIdeaId, setEditorialAngle, setIsLinkedInCarousel, setVisualSlides, setPinterestPinHtml, setPhotoBriefOverlayHtml, setSavedId, setStep, setQuestions, setAnswers, setBriefPrefillAnswers, setIncomingBriefId,
    // useFormatNext est déclaré plus bas : relais lu seulement quand l'effet tourne.
    handleFormatNext: (...args: Parameters<typeof handleFormatNext>) => handleFormatNext(...args),
  });

  // ── Library photos → preload as if uploaded (chemin /photos → /creer, use-creer-photos.ts) ──
  const { libraryPhotoIdsRef, firstProductRef, initialCreationId } = useLibraryPhotosPreload({
    locState, searchParams, creationId, conflictPending, workspaceId, ideaText, autoGeneratePendingRef,
    savePhotos, setIsLoadingLibraryPhotos, setStep, setCarouselSubMode, setIdeaText, setUploadedPhotos, setEditingIdeaId,
  });


  // ── Rehydrate les photos après restauration du flux (use-creer-photos.ts) ──
  usePhotosRehydration({
    conflictPending, creationId, initialCreationId, shouldRestore, libraryPhotoIdsRef, uploadedPhotos, workspaceId,
    setPhotosRestored, setUploadedPhotos, setGeneratedWithPhotos,
  });

  // Show error
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // Snapshot défensif uploadedPhotos -> generatedWithPhotos (use-creer-photos.ts).
  usePhotosSnapshot({ uploadedPhotos, selectedFormat, photoMode, carouselPhotoCountRef, setGeneratedWithPhotos, savePhotos });

  // ── Step handlers ──

  const handleCoachingSelect = useCallback((data: { subject: string; format: string; objective: string; canal?: string; carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | "user_slides"; editorialAngle?: string }) => {
    setAnswers({});
    if (data.canal && (FORCED_CANALS as readonly string[]).includes(data.canal)) setForcedChannel(data.canal as ForcedChannel);
    setIsLinkedInCarousel(data.canal === "linkedin" && data.format === "carousel");
    // L'angle choisi dans le coach d'idées VOYAGE jusqu'à la génération :
    // c'est lui qu'on a jugé « waouh », le perdre ici ruinait tout l'amont.
    setEditorialAngle(data.editorialAngle ?? null);
    setEditContent("");
    setLaunchResults([]);

    setIdeaText(data.subject);
    // Normalise à la source : la coach émet un vocabulaire non-canonique
    // (engagement/inspirer/eduquer/vendre/creer_du_lien) qui, stocké tel quel,
    // décale les recos, les couleurs calendrier et les stats. On canonicalise.
    if (data.objective) setObjective(normalizeObjective(data.objective) ?? data.objective);

    // Defensive: if the coach returned an unknown/auto format, send the user
    // to the format picker instead of triggering a "Format non supporté" crash.
    const safeFormat = normalizeFormat(data.format);
    if (!safeFormat) {
      setSelectedFormat(null);
      setStep("format");
      toast.info("Choisis un format pour continuer.");
      return;
    }

    setSelectedFormat(safeFormat);
    if (data.carouselSubMode) setCarouselSubMode(data.carouselSubMode);

    // Même politique que l'init URL (chemin Dashboard → /creer?format=...) :
    // carousel et post passent par l'étape format pour permettre le choix
    // d'angle, le sous-mode et l'upload de photos. Sans ça, un "carrousel
    // photo" choisi dans le coach partait en génération sans photos et
    // était silencieusement dégradé en carrousel texte (visionMode=false).
    if (safeFormat === "carousel" || safeFormat === "post") {
      setStep("format");
      return;
    }

    // Autres formats (reel, story, linkedin, newsletter, pinterest…) :
    // pas de sous-choix ni de photos à cette étape, on garde le saut direct.
    setStep("questions");
    generateQuestions({
      format: safeFormat,
      subject: data.subject,
      editorialAngle: data.editorialAngle ?? undefined,
      objective: data.objective || undefined,
    });
  }, [generateQuestions]);

  const handleNewsjackingSelect = useCallback((data: { subject: string; context: string; format?: string; vehicule?: string }) => {
    setIdeaText(data.subject);
    setNewsjackingContext(data.context);
    setSelectedFormat(null);
    setNewsjackingSuggestedFormat(data.format || null);
    if (!objective) setObjective("visibilite");
    setStep("format");
  }, [objective]);

  const handleIdeaNext = (idea: string, ideaId?: string) => {
    ideaHistory.change(idea); if (ideaId && !editingIdeaId) setEditingIdeaId(ideaId);
    setNewsjackingContext(null);
    setNewsjackingSuggestedFormat(null);
    // Auriana demo: keep pre-filled format/angle if subject unchanged
    if (aurianaDemoActive && idea === AURIANA_DEMO_SUBJECT) {
      setStep("format");
      return;
    }
    // Reset format-related state so the user starts fresh at channel selection.
    // NOTE: photos (uploadedPhotos / photoDescription) are NOT reset here so
    // that the "Partir de photos" entry point can pre-load them in CreerStepFormat.
    setSelectedFormat(null);
    setEditorialAngle(null);
    setCarouselSubMode(null);
    setPhotoMode(false);
    setPinterestData(null);
    setStep("format");
  };

  const handlePhotosNext = (photos: PhotoItem[], description: string, subject?: string) => {
    setUploadedPhotos(photos);
    if (photos.length > 0) savePhotos(photos);
    setPhotoDescription(description);
    setIdeaText(subject?.trim() ?? "");
    setSelectedFormat(null);
    setEditorialAngle(null);
    setCarouselSubMode(null);
    setPhotoMode(false);
    setPinterestData(null);
    setStep("format");
  };

  // ─── Lot 7 reels : étape de choix du hook (use-reel-hooks.ts) ───
  const fetchReelHooks = (ans: Record<string, string>, excludeHooks?: string[]) =>
    reelHooksStep.fetchReelHooks(ans, excludeHooks, { questions, ideaText, objective, workspaceId, userId: session?.user?.id });
  const handleHookSelect = (hook: ReelHook) =>
    reelHooksStep.handleHookSelect(hook, { generating, streaming, setStep, doGenerate });
  const handleHookSkip = () =>
    reelHooksStep.handleHookSkip({ generating, streaming, setStep, doGenerate });

  const handleQuestionsNext = async (ans: Record<string, string>) => {
    if (generating || structureLoading || streaming) return; // garde anti double-clic (évite une 2e génération facturée)
    setAnswers(ans);

    // Sauvegarder le brief en base pour les futures créations
    // ⚠️ On n'enregistre PAS les briefs sans sujet : ils polluent l'historique
    // récent envoyé à l'IA et provoquent des questions hors-sujet.
    if (session?.user?.id && Object.keys(ans).length > 0 && ideaText.trim().length > 0) {
      try {
        const briefId = await saveContentBrief({
          userId: session.user.id, workspaceId, incomingBriefId, ideaText, objective,
          selectedFormat, editorialAngle, questions, answers: ans,
        });
        if (briefId) setCurrentBriefId(briefId);
      } catch (e) {
        console.error("[CreerUnifie] Failed to save content brief:", e);
      }
    }

    // Lot 7 reels : détour par le choix de l'angle d'attaque (étape gratuite)
    // avant la génération facturée. Les modes démo gardent le chemin direct.
    if (selectedFormat === "reel" && !isDemoMode && !aurianaDemoActive && !autoFlow) {
      pendingReelAnswersRef.current = ans;
      setStep("hook_selection");
      void fetchReelHooks(ans);
      return;
    }

    // On bascule TOUJOURS vers "result" pour afficher un loader pendant
    // que doGenerate tourne (pour les carrousels photo/mix, ce loader correspond
    // à l'écran "structureLoading"). Sinon l'écran questions reste figé 30-60s.
    setStep("result");
    await doGenerate(ans);
  };

  const handleSkipQuestions = async () => {
    if (generating || structureLoading || streaming) return; // garde anti double-clic (évite une 2e génération facturée)
    setAnswers({});
    if (selectedFormat === "reel" && !isDemoMode && !aurianaDemoActive && !autoFlow) {
      pendingReelAnswersRef.current = {};
      setStep("hook_selection");
      void fetchReelHooks({});
      return;
    }
    setStep("result");
    await doGenerate({});
  };

  const handleRegenerate = async () => {
    // « Mes slides » : le texte vient de l'utilisatrice — « Régénérer » ne doit
    // JAMAIS réécrire. On refait uniquement le design (nouveaux visuels).
    if (carouselSubMode === "user_slides") {
      setVisualSlides([]);
      await handleGenerateVisuals();
      return;
    }
    regenerationBackup.begin(regenerationSnapshot());
    await doGenerate(answers);
    regenerationBackup.settleIfNotStarted();
  };

  // Drapeau qui force une régénération une fois que le nouveau editorialAngle a été commité dans le state.
  // (setState étant async, on ne peut pas appeler doGenerate juste après setEditorialAngle.)
  const [pendingAngleRegen, setPendingAngleRegen] = useState(false);
  const handleChangeAngle = (newAngle: string | null) => {
    setEditorialAngle(newAngle);
    // Reel : le hook d'ouverture avait été choisi pour l'ANCIEN angle — le garder
    // forcerait le prompt à répéter le même hook mot pour mot malgré le nouvel
    // angle (selectedHook prime sur HOOK_AUTO côté edge). On le vide pour que
    // l'IA en génère un nouveau, cohérent avec le nouvel angle.
    if (selectedFormat === "reel") setSelectedReelHook(null);
    regenerationBackup.begin(regenerationSnapshot());
    setPendingAngleRegen(true);
  };
  useEffect(() => {
    if (!pendingAngleRegen) return;
    setPendingAngleRegen(false);
    doGenerate(answers).finally(regenerationBackup.settleIfNotStarted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAngleRegen, editorialAngle]);

  // ── LinkedIn carousel caption: appel dédié à linkedin-ai/caption-for-carousel ──
  const { captionLoading, regenerateCaption } = useLinkedInCarouselCaption({
    newsContext: newsjackingContext,
    answers,
    result,
    setResult,
    generating,
    isLinkedInCarousel,
    carouselSubMode,
    ideaText,
    editorialAngle,
    objective,
    workspaceId,
    session,
  });

  // ── Mode « Mes slides » : construction des slides SANS écriture IA ──
  const { userSlidesDraft, userSlidesBuilding, handleUserSlidesGenerate } = useUserSlidesGenerate({
    generating,
    visualLoading,
    workspaceId,
    session,
    setUploadedPhotos,
    setGeneratedWithPhotos,
    setSavedId,
    setVisualSlides,
    setCarouselColors,
    setStep,
    setResult,
  });

  // ── Sélection d'une proposition d'inspiration Pinterest ──
  const { handleSelectInspirationProposal } = useSelectInspirationProposal({
    pinterestVisualGenerating,
    inspirationImageBase64,
    pinterestData,
    workspaceId,
    session,
    clearQuotaExhausted,
    markQuotaExhausted,
    setChosenProposal,
    setStep,
    setResult,
    setSelectedFormat,
    setIdeaText,
    setPinterestPinHtml,
    setPinterestVisualGenerating,
    setPhotoBriefOverlayHtml,
    setPhotoBriefResult,
  });

  // ── Carrousel "juste photo" : on supprime tout overlay/title/body sur les slides
  // ET on tronque le nombre de slides au nombre de photos uploadées (1 photo = 1 slide).
  // La légende reste générée par l'IA.
  // purePhotoRawOrNull renvoie null sur un raw déjà nettoyé : sans ce point
  // d'arrêt, chaque setResult re-déclenchait l'effet À L'INFINI (nouvel objet à
  // chaque tour) et la pré-génération des visuels s'abandonnait à chaque
  // changement de résultat — aucun appel carousel-visual (visite du 05/10).
  useEffect(() => {
    if (carouselSubMode !== "pure_photo") return;
    // Source de vérité : snapshot pris au moment de la génération, sinon état UI courant.
    const photoCount = generatedWithPhotos.length || uploadedPhotos.length;
    if (!purePhotoRawOrNull((result as any)?.raw, photoCount)) return;
    setResult((prev: any) => {
      const nextRaw = prev ? purePhotoRawOrNull(prev.raw, photoCount) : null;
      return nextRaw ? { ...prev, raw: nextRaw } : prev;
    });
  }, [result, carouselSubMode, generatedWithPhotos.length, uploadedPhotos.length]);


  const handleConfirmStructure = async (
    confirmedSlides: SlideProposal[],
    proposalOverride?: StructureProposal,
    answersOverride?: Record<string, string>,
    photosOverride?: PhotoItem[],
  ) => {
    if (generating) return; // garde anti double-clic (évite une 2e génération facturée)
    const enrichedSubject = existingCalendarContent
      ? ideaText + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : ideaText;
    // Capture le fil narratif AVANT de reset structureProposal. En mode photo on
    // saute l'écran de review : structureProposal n'est pas encore posé dans le
    // state (setState async), donc on lit d'abord la proposition passée en argument.
    const narrativeThread =
      (proposalOverride ?? structureProposal)?.narrative_thread || undefined;
    setLastConfirmedStructure(confirmedSlides);
    setLastScenarioOrigin(proposalOverride ? "automatic" : "user_validated");
    setLastNarrativeThread(narrativeThread || null);
    setStructureProposal(null);
    setStep("result");
    // Ré-indexe les réponses par le TEXTE de la question, comme le chemin direct
    // de doGenerate : keyées `q_0`/`q_1`, le modèle qui rédige perdrait tout le
    // cadrage des questions (il ne connaît pas les IDs).
    const rekeyedAnswers: Record<string, string> = (() => {
      const textById = new Map(questions.map((q) => [q.id, q.question]));
      const out: Record<string, string> = {};
      for (const [id, v] of Object.entries(answersOverride ?? answers)) {
        if (!v || !v.trim()) continue;
        out[textById.get(id) || id] = v;
      }
      return out;
    })();
    // Même repli que les visuels : si le state UI a été reset entre l'upload et
    // cette génération, le snapshot generatedWithPhotos tient encore les photos.
    // Mode photo : les photos d'ambiance libres de droit d'une génération précédente ne repartent pas.
    const photosForText = carouselSubMode === "photo"
      ? ownPhotos(photosOverride ?? pickNonEmpty(uploadedPhotos, generatedWithPhotos))
      : photosOverride ?? pickNonEmpty(uploadedPhotos, generatedWithPhotos);
    // Snapshot des photos avant la génération finale (au cas où le state UI serait reset)
    if ((carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo") && uploadedPhotos.length > 0) {
      setGeneratedWithPhotos(uploadedPhotos);
    }
    await generate({
      format: "carousel",
      subject: enrichedSubject,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      answers: Object.keys(rekeyedAnswers).length > 0 ? rekeyedAnswers : undefined,
      channel: isLinkedInCarousel ? "linkedin" : undefined,
      slideCount: slideCountChoice,
      confirmedStructure: confirmedSlides,
      scenarioOrigin: proposalOverride ? "automatic" : "user_validated",
      editorialIntent: (proposalOverride ?? structureProposal)?.editorial_intent,
      ...(narrativeThread ? { narrativeThread } : {}),
      ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: photosForText.map(p => ({ base64: p.base64, context: p.context, libraryContext: p.libraryContext, mimeType: p.mimeType })), photoDescription,
        // Photos d'ambiance libres de droit posées par l'app : ajoutées après les siennes.
        onStockAmbientPhotos: (added: PhotoItem[]) => {
          if (!isCurrentCreation()) return;
          const next = [...photosForText, ...added];
          setUploadedPhotos(next);
          setGeneratedWithPhotos(next);
        } } : {}),
      ...(carouselSubMode === "mix"
        ? (isTextFirstMix
            ? { carouselType: "mix", textFirst: true, ...(textFirstCatalog.length > 0 ? { photoCatalog: textFirstCatalog } : {}) }
            : { carouselType: "mix", photos: photosForText.map(p => ({ base64: p.base64, context: p.context, libraryContext: p.libraryContext, mimeType: p.mimeType })), photoDescription })
        : {}),
      ...(carouselSubMode === "pure_photo" ? { carouselType: "photo", carouselSubMode: "pure_photo", photos: photosForText.map(p => ({ base64: p.base64, context: p.context, libraryContext: p.libraryContext, mimeType: p.mimeType })), photoDescription } : {}),
      ...(photoMode ? { photoMode: true, photos: photosForText.length > 0 ? photosForText.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context, libraryContext: p.libraryContext, mimeType: p.mimeType, userPhotoId: p.userPhotoId })) : undefined, photoDescription } : {}),
      ...(qualityMax ? { qualityMax: true } : {}),
      ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
    });
  };

  const handleSkipStructure = async (slides: SlideProposal[]) => {
    await handleConfirmStructure(slides);
  };

  // ── Cœur de la génération de contenu (6 sous-flux selon format/sous-mode) ──
  const { doGenerate } = useDoGenerate({
    firstProductCarousel: firstProductRef.current,
    selectedFormat,
    generating,
    structureLoading,
    streaming,
    photoDumpResolving,
    selectedReelHook,
    questions,
    aurianaDemoActive,
    ideaText,
    isDemoMode,
    demoData,
    existingCalendarContent,
    objective,
    editorialAngle,
    workspaceId,
    session,
    newsjackingContext,
    qualityMax,
    clearQuotaExhausted,
    markQuotaExhausted,
    setDemoGenerating,
    generateStream,
    streamReset,
    generate,
    photo: {
      restoreSavedPhotos: () => restoreCarouselPhotos(visualSlides),
      isCurrent: isCurrentCreation,
      uploadedPhotos,
      photoMode,
      photoDescription,
      generatedWithPhotos,
      photoDumpEnabled,
      photoDumpDoneRef,
      libraryPhotosForCasting,
      setUploadedPhotos,
      setGeneratedWithPhotos,
      setPhotoDumpResolving,
      setPhotoDumpProgress,
    },
    pinterest: {
      pinterestData,
      chosenProposal,
      inspirationImageBase64,
      setPinterestPinHtml,
      setPhotoBriefOverlayHtml,
      setPhotoBriefResult,
      setPinterestVisualGenerating,
    },
    carousel: {
      carouselSubMode,
      isTextFirstMix,
      textFirstCatalogRows,
      textFirstCatalog,
      textFirstRowsSnapshotRef,
      structureProposal,
      lastConfirmedStructure,
      lastScenarioOrigin,
      lastNarrativeThread,
      slideCountChoice,
      isLinkedInCarousel,
      setStructureLoading,
      setStructureProposal,
      handleConfirmStructure,
    },
    resultSetters: {
      setStep,
      setResult,
      setSavedId,
      setVisualSlides,
      setCarouselColors,
    },
  });

  useEffect(() => {
    if (!autoGeneratePendingRef.current || conflictPending || step !== "result" || result ||
        selectedFormat !== "carousel" || generating || structureLoading || streaming || isLoadingLibraryPhotos) return;
    if (carouselSubMode === "photo" && uploadedPhotos.length === 0) return;
    if (firstProductRef.current && carouselSubMode === "photo" && uploadedPhotos.length === 1) {
      autoGeneratePendingRef.current = false;
      setStep("format");
      toast.info("Une seule photo différente a été trouvée. Ajoute une autre photo pour créer un carrousel varié.");
      return;
    }
    if (carouselSubMode !== "photo" && carouselSubMode !== "text") return;
    autoGeneratePendingRef.current = false;
    void doGenerate({});
  }, [conflictPending, step, result, selectedFormat, generating, structureLoading, streaming,
      isLoadingLibraryPhotos, carouselSubMode, uploadedPhotos, doGenerate]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const handleEdit = () => {
    const r = result?.raw || result;

    // Carrousel et stories : la structure est la seule source de vérité (lot 7),
    // le texte à plat est reconstruit à partir d'elle à chaque ouverture.
    const structured = structuredEditText(selectedFormat, r);
    if (structured !== null) {
      // Ancienne sauvegarde à plat (avant le 14/10/2026) : on la rouvre pour
      // qu'elle soit remise à sa place à l'enregistrement, au lieu de la perdre.
      const legacy = typeof r?.edited_text === "string" && /^--- (SLIDE|STORY) \d+/m.test(r.edited_text) ? r.edited_text : null;
      setEditContent(legacy ?? structured);
      setEditBaseline(structured);
      setStep("edit");
      return;
    }

    // Si une édition manuelle a déjà été sauvegardée, on la rouvre telle quelle.
    if (typeof r?.edited_text === "string") {
      setEditContent(r.edited_text);
      setEditBaseline(r.edited_text);
      setStep("edit");
      return;
    }

    const text = flattenResultForEdit(selectedFormat, r, existingCalendarContent);

    setEditContent(text);
    setEditBaseline(text);
    setStep("edit");
  };

  // Garde anti-perte : "Nouveau contenu" efface tout (texte généré + photos).
  // Si un travail est en cours, on demande confirmation avant de vider.
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const requestReset = () => {
    const hasWork =
      uploadedPhotos.length > 0 ||
      !!result ||
      step === "edit" ||
      visualSlides.length > 0 ||
      !!editContent;
    if (hasWork) {
      setConfirmResetOpen(true);
      return;
    }
    handleReset();
  };

  const handleReset = () => {
    setCurrentBriefId(null);
    setIncomingBriefId(null);
    const nextCreationId = crypto.randomUUID();
    activeCreation.current = nextCreationId;
    setCreationId(nextCreationId);
    setCalendarPostId(null);
    setCalendarPostDate(null);
    setNewsjackingSuggestedFormat(null);
    resetGenerator();
    streamReset();
    setStep("idea");
    setNewsjackingContext(null);
    setIdeaText("");
    setObjective(null);
    setSelectedFormat(null);
    setEditorialAngle(null);
    setAnswers({});
    setEditContent("");
    setLaunchResults([]);
    setLaunchIndex(0);
    setSavedId(null);
    setSavedIdeaVersion(null);
    setVisualSlides([]);
    setPinterestPinHtml(null);
    setCarouselSubMode(null);
    setUserSlidesInput(null);
    setIsLinkedInCarousel(false);
    setUploadedPhotos([]);
    setPhotoDescription("");
    setPhotoSubject("");
    setPhotoEntry(false);
    setPhotoMode(false);
    setIsLinkedInCarousel(false);
    setInspirationLoading(false);
    setInspirationAnalysis(null);
    setInspirationProposals([]);
    setChosenProposal(null);
    setInspirationImageBase64(null);
    setInspirationImagePreview(null);
    setPhotoBriefResult(null);
    setPhotoBriefOverlayHtml(null);
    setStructureProposal(null);
    setLastConfirmedStructure(null);
    setLastScenarioOrigin(null);
    setEditingIdeaId(null);
    // Sans ça, le suivi de la publication précédente restait en mémoire et
    // renvoyait « déjà enregistré » pour tout contenu créé ensuite.
    resetPublishedTracking();
    setReelMp4Url(null);
    clearFlowState();
    
    sessionStorage.removeItem(CREER_RESULT_KEY);
  };


  const handleTransformToLinkedInCarousel = async () => {
    if (generating) return; // garde anti double-clic (évite une 2e génération facturée)
    const r = result?.raw;
    if (!r) return;
    const linkedinText = r.full_text || r.content || [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    if (!linkedinText) return;

    setIsLinkedInCarousel(true);
    setSelectedFormat("carousel");
    setCarouselSubMode("text");
    setResult(null);
    setVisualSlides([]);
    setSavedId(null);

    await generate({
      format: "carousel" as any,
      subject: linkedinText,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      channel: "linkedin",
    });
  };

  // ── Post-generation handlers ──

  const persistCarousel = async () => {
    if (!session?.user?.id || !result?.raw || saving) return null;
    if (savedId) return savedId;
    const r = result.raw;
    if (selectedFormat === "carousel" && r?.slides) {
      setSaving(true);
      try {
        // Slide 1 quel que soit le format (texte=title, mixte/photo=overlay_text).
        const hookText = slideText(r.slides?.[0]);
        const captionText = [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n\n");
        const { data, error } = await supabase.from("generated_carousels" as any).insert({
          user_id: session.user.id,
          ...(workspaceId && workspaceId !== session.user.id ? { workspace_id: workspaceId } : {}),
          carousel_type: r.carousel_type || "tips",
          subject: ideaText,
          objective: objective || null,
          hook_text: hookText,
          slide_count: r.slides?.length || 7,
          slides: r.slides,
          caption: captionText,
          hashtags: r.caption?.hashtags || [],
          quality_score: r.quality_check?.score || null,
        }).select("id").single();
        if (error) throw error;
        if (!data) throw new Error("Confirmation de sauvegarde indisponible");
        setSavedId((data as any).id);
        return (data as any).id as string;
      } catch (e: any) {
        console.warn("generated_carousels insert failed:", e?.message);
        toast.error("La sauvegarde du carrousel a échoué. Réessaie.");
        return null;
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSave = async () => {
    if (carouselCloudEnabled) {
      if (await carouselSave.flush()) toast.success("Ton carrousel est enregistré dans Mes idées.");
      return;
    }
    if (selectedFormat === "carousel" && !(await persistCarousel())) return;
    // Ouvrir le dialog SaveToIdeasDialog (insertion réelle dans saved_ideas)
    setSaveIdeaDialogOpen(true);
  };

  const handleAddToCalendar = async () => {
    if (!session?.user?.id || !result?.raw) return;
    if (carouselCloudEnabled && !(await carouselSave.flush())) return;
    // If coming from calendar, save directly back
    if (fromCalendar) {
      await handleSaveBackToCalendar();
      return;
    }
    setPublishDialogOpen(true);
  };

  // Remplacement de la photo d'une slide de carrousel (use-creer-photos.ts).
  const handleAddCarouselPhoto = useAddCarouselPhoto({ uploadedPhotos, carouselPhotoCountRef, setUploadedPhotos });

  // ── Génération des visuels du carrousel (+ pré-génération en arrière-plan) ──
  // A restored result may arrive before its HTML/photos. Opening it is not a
  // request to pay for visuals. A new writing operation in this visit can
  // enable the normal automatic continuation; the manual button stays usable.
  const automaticVisualsAllowed = useRef(!ps?.result && !ps?.pendingStream && !locState.resumeIdea?.raw);
  if (generating || streaming || userSlidesBuilding) automaticVisualsAllowed.current = true;
  const { handleGenerateVisuals } = useGenerateVisuals({
    result, creationId,
    allowAutomatic: automaticVisualsAllowed.current,
    contentGenerating: generating || streaming || userSlidesBuilding || structureLoading || photoDumpResolving,
    visualLoading,
    aurianaDemoActive,
    ideaText,
    carouselSubMode,
    uploadedPhotos,
    generatedWithPhotos,
    workspaceId,
    session,
    carouselColors,
    charterData,
    qualityMax,
    coverIllustration,
    selectedFormat,
    visualSlides,
    step,
    setVisualsAutoError,
    setVisualLoading,
    setVisualSlides,
    setPhotoMissingDialog,
    setVisualChunkProgress,
    refreshPlan,
    onMixLayoutMemos: (memos, receipt, formattingMemo) => setResult((prev: any) => withRaw(prev, prev?.raw && applyMixRenderMemory(prev.raw, { memos, receipt, formattingMemo }))),
    // Carrousel texte : libellé du bouton rangé dans la slide (lot 8b, src/lib/carousel-cta-label.ts).
    onCtaLabels: (visuals) => setResult((prev) => withRaw(prev, prev?.raw && withVisualCtaLabels(prev.raw, visuals))),
  });

  // ═══ Casting automatique bibliothèque (régime texte d'abord) : use-creer-photos.ts ═══
  useLibraryAutoCast({ result, textFirstRowsSnapshotRef, uploadedPhotosLiveRef, setUploadedPhotos, savePhotos, setResult });

  // Compteur de crédits honnête : le débit vient d'avoir lieu côté serveur quand
  // un résultat arrive — sans ça, le cache 60 s de useUserPlan affiche l'ancien
  // solde pendant toute la session de création (vécu 21/07 : « 6 restants » figé
  // sur 3 générations d'affilée).
  useEffect(() => {
    if (!result) return;
    refreshPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // ═══ Publication directe Instagram (image simple OU carrousel) ═══
  const [publishingInstagram, setPublishingInstagram] = useState(false);
  const [publishingLinkedIn, setPublishingLinkedIn] = useState(false);
  // Connexions sociales : conditionnent « Maintenant » / « Programmer » dans la
  // fenêtre de publication (sans compte connecté, les deux échoueraient).
  const { isConnected: isSocialConnected, getTokenExpiry, known: connectionsKnown, loading: connectionsLoading, refresh: refreshConnections } = useSocialConnections();

  const publishableImageUrl = findPublishableImageUrl(result?.raw || result, uploadedPhotos?.[0]?.preview);
  // Reel monté : la vidéo reste liée à son script (use-reel-artifact.ts).
  const { reelScope, activeReelScope, reelMp4Url, setReelMp4Url, instagramInFlight } = useReelArtifact({
    result, workspaceId, creationId, ps, saveFlowState, setPublishingInstagram,
  });

  // ── Sauvegarde dans le calendrier (nouveau post + mise à jour d'un post existant) ──
  const { savingToCalendar, handleConfirmCalendar, handleSaveBackToCalendar, recordImmediatePublication, uploadVisualsToStorage, resetPublishedTracking } = useCalendarSave({
    enabled: !conflictPending,
    creationId,
    session,
    result,
    selectedFormat,
    isLinkedInCarousel,
    chosenProposal,
    inspirationAnalysis,
    ideaText,
    workspaceId,
    objective,
    editorialAngle,
    savedId,
    carouselSubMode,
    uploadedPhotos,
    photoMode,
    visualSlides,
    pinterestPinHtml,
    photoBriefOverlayHtml,
    currentBriefId,
    editingIdeaId,
    carouselQualityDisabledReason: selectedFormat === "carousel" ? carouselQuality.disabledReason : undefined,
    reelMp4Url,
    publishableImageUrl,
    calendarPostId,
    calendarPostDate,
    setPublishDialogOpen,
    persistCarousel,
  });

  // ── Publier ou programmer (use-creer-publish.ts) ──
  const {
    publishImageInputRef, addingPublishImage, handlePublishImageSelected,
    isCarouselPublish, publishChannel, publishDialogDisabledReason, handlePublishNowFromDialog,
    connectingPublishChannel, handleConnectFromDialog, handleScheduleFromDialog,
  } = useCreerPublish({
    session, result, setResult, selectedFormat, isLinkedInCarousel, visualSlides, publishableImageUrl, reelMp4Url,
    carouselVisualsStale, visualLoading, generating, carouselQuality, carouselCloudEnabled, carouselSave, charterData,
    workspaceId, reelScope, activeReelScope, instagramInFlight, setPublishingInstagram, setPublishingLinkedIn,
    recordImmediatePublication, handleConfirmCalendar, setPublishDialogOpen, navigate, location, searchParams,
    setSearchParams, connectionsKnown, refreshConnections, isSocialConnected, getTokenExpiry,
  });

  const {
    handleExportPptx,
    handleExportVisualPng,
    handleExportVisualPdf,
    handleExportHybridPptx,
    handleOpenInCanva,
    openingCanva,
    handleExportPinterestPng,
    handleExportPhotoBriefPng,
    handleExportPinterestEditablePptx,
  } = useCreerExports({
    result,
    visualSlides,
    uploadedPhotos,
    generatedWithPhotos,
    charterData,
    ideaText,
    carouselSubMode,
    carouselVisualsStale,
    isCarouselPublish,
    pinterestPinHtml,
    photoBriefOverlayHtml,
  });

  // ── Launch sequence (5 chapters) : use-launch-sequence.ts ──
  const handleLaunchSequence = (format: string, angle: string) =>
    runLaunchSequence(format, angle, { generate, ideaText, objective });

  // ── Étape "format" → "questions" (et raccourcis directs vers d'autres étapes) ──
  const { handleFormatNext } = useFormatNext({
    loadingQuestions,
    generating,
    structureLoading,
    isDemoMode,
    demoData,
    ideaText,
    editorialAngle,
    existingCalendarContent,
    aurianaDemoActive,
    carouselSubMode,
    uploadedPhotos,
    photoDescription,
    photoMode,
    newsjackingContext,
    isLinkedInCarousel,
    objective,
    session,
    workspaceId,
    photoDumpDoneRef,
    setSlideLength,
    setExplicitTextFirstMix,
    setPhotoDumpEnabled,
    setSelectedFormat,
    setEditorialAngle,
    setPinterestData,
    setCarouselSubMode,
    setUploadedPhotos,
    setPhotoDescription,
    setPhotoMode,
    setStep,
    setDemoGenerating,
    setResult,
    setInspirationImageBase64,
    setInspirationImagePreview,
    setInspirationAnalysis,
    setInspirationProposals,
    setInspirationLoading,
    setQuestions,
    resetGenerator,
    generateQuestions,
    handleLaunchSequence,
  });

  // ── Progress bar moved into <CreerStepper /> below ──


  // ── Launch mode rendering ──

  useEffect(() => { if (workspaceReady && (ideaText || result)) recordCreationResume("creation"); }, [workspaceReady, ideaText, result]);
  const isLaunchMode = editorialAngle === "lancement" && step === "result";

  // Demo mode: replace action handlers with toast notifications
  const demoToast = () => toast("Cette action est disponible dans l'outil complet. Crée ton compte gratuit !");
  const effectiveHandleSave = isDemoMode ? demoToast : handleSave;
  const effectiveHandleAddToCalendar = isDemoMode ? demoToast : handleAddToCalendar;
  const effectiveHandleExportPptx = isDemoMode ? demoToast : handleExportPptx;
  const effectiveHandleExportVisualPng = isDemoMode ? demoToast : handleExportVisualPng;
  const effectiveHandleExportHybridPptx = isDemoMode ? demoToast : handleExportHybridPptx;
  const effectiveHandleExportVisualPdf = isDemoMode ? demoToast : handleExportVisualPdf;

  const ideaVersionSignature = useMemo(() => JSON.stringify([result?.raw, visualSlides, uploadedPhotos]), [result?.raw, visualSlides, uploadedPhotos]);
  const ideaSaveNotice = ideaSaving ? "Enregistrement du texte et des visuels…"
    : savedIdeaVersion?.signature === ideaVersionSignature
      ? savedIdeaVersion.complete
        ? "Cette version est enregistrée dans Mes idées → En cours."
        : "Texte enregistré, mais visuels incomplets. Garde cet onglet ouvert et réessaie l’enregistrement."
      : savedIdeaVersion
        ? "Modifications à enregistrer pour mettre à jour ton contenu dans Mes idées."
        : "Pour retrouver cette version plus tard, enregistre-la dans Mes idées → En cours.";

  /* Fiche de marque d'abord. Tant que la fiche captée à l'inscription attend
     sa relecture, la marque n'est pas encore écrite dans les tables lues par la
     génération : créer maintenant produirait un contenu générique. La prochaine
     action est donc de valider sa fiche, pas de créer.
     `checking` borne l'attente (cf. use-pending-brand-review) : réseau lent ou
     KO → on laisse créer plutôt que d'immobiliser l'écran. */
  if (brandReviewChecking && !flowShownRef.current) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Un instant…</p>
        </div>
      </div>
    );
  }
  if (brandReviewPending && !flowShownRef.current) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <BrandReviewGate returnTo={brandReturnRef.current.path} returnState={brandReturnRef.current.state} />
      </div>
    );
  }
  // À partir d'ici le flux de création est affiché : verrouillé pour la durée
  // de vie du composant (cf. commentaire à la déclaration de flowShownRef).
  flowShownRef.current = true;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <Sheet open={transformOpen} onOpenChange={(open) => { if (!open) closeTransform(); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4"><SheetTitle>Transformer un contenu existant</SheetTitle></SheetHeader>
          <CreerTransformTab />
        </SheetContent>
      </Sheet>

      {conflictPending && draftConflict && (
        <DraftConflictDialog
          open
          draft={draftConflict.draft}
          newSubject={draftConflict.newSubject}
          onResume={() => {
            // Retirer aussi l'état de navigation de la photo source : sinon
            // le dialogue peut réapparaître après le rechargement.
            window.history.replaceState({ ...(window.history.state || {}), usr: null }, "", location.pathname);
            window.location.replace(location.pathname);
          }}
          onStartNew={() => {
            handleReset();
            initialCreationId.current = activeCreation.current;
            persistedState.current = null;
            initDone.current = false;
            justStrippedRef.current = false;
            setConflictResolved(true);
          }}
        />
      )}


      {isLoadingLibraryPhotos && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Préparation de ta photo…</p>
          </div>
        </div>
      )}



      <div className={`${step === "idea" || (step === "result" && selectedFormat === "carousel") ? "max-w-6xl" : step === "format" ? "max-w-3xl" : "max-w-2xl"} mx-auto px-4 sm:px-6 ${step === "result" ? "pt-3 sm:pt-4" : "py-6 sm:py-10"} pb-24 [--primary:330_55%_20%] [--ring:330_55%_20%] dark:[--primary:338_96%_61%] dark:[--ring:338_96%_61%]`}>
        {/* Sub-page header */}
        {paramFrom && (
          <SubPageHeader
            parentLabel="Retour"
            parentTo={paramFrom}
            currentLabel="Créer un contenu"
            useFromParam
          />
        )}

        {/* Mode tabs — first visible choice */}

        <div className="mt-4">
          {/* Unified stepper — visible from step 1, hidden on result/edit screens to give content full focus */}
          {(() => {
            const stepperKey: StepperKey | null = (() => {
              if (step === "idea") return "idea";
              if (step === "format") return "format";
              if (step === "questions" || step === "hook_selection" || step === "structure_review" || step === "inspiration_proposals" || step === "user_slides") return "brief";
              if (step === "result" || step === "edit") return "result";
              return null;
            })();
            if (!stepperKey) return null;
            const handleStepClick = (key: StepperKey) => {
              // An existing result stays reachable while revisiting the brief.
              if (key === "result" && result && result.type === selectedFormat && !generating && !streaming) { setStep("result"); return; }
              if (key === "idea") setStep("idea");
              else if (key === "format" && step !== "idea") setStep("format");
              // « Mes slides » : le « brief », c'est l'écran de saisie du texte.
              else if (key === "brief" && (step === "result" || step === "edit")) setStep(carouselSubMode === "user_slides" ? "user_slides" : "questions");
            };
            const credits =
              !planLoading && remainingWithBonus() < 9000 ? (
                <span className="text-2xs text-muted-foreground whitespace-nowrap inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> {remainingWithBonus()} crédit{remainingWithBonus() > 1 ? "s" : ""} restant{remainingWithBonus() > 1 ? "s" : ""}
                </span>
              ) : null;
            return (
              <CreerStepper
                current={stepperKey}
                contentAvailable={!!result && result.type === selectedFormat && !generating && !streaming}
                onStepClick={handleStepClick}
                rightSlot={credits}
                verbOverride={autoFlow && stepperKey === "brief" ? "Ton premier contenu" : undefined}
              />
            );
          })()}

            {/* Steps */}
            {step === "idea" && (
              <div onKeyDown={(event) => {
                const target = event.target as HTMLElement;
                // Preserve native undo in secondary panels and other inputs.
                if (target.id !== "creation-idea" && target.id !== "creation-photo-subject" && !target.closest('[data-idea-history]')) return;
                const action = editHistoryShortcut(event.nativeEvent);
                if (!action || !isCurrentCreation()) return;
                event.preventDefault();
                event.stopPropagation();
                (photoEntry ? photoSubjectHistory : ideaHistory).travel(action === "redo");
              }}>
                {planVerified && <LowCreditsBanner remaining={remainingWithBonus()} plan={plan} />}
                {(() => {
                  const history = photoEntry ? photoSubjectHistory : ideaHistory;
                   // Visible seulement après une vraie modification du sujet (évite un bouton grisé incompréhensible, ex. newsjacking).
                   if (!history.canUndo && !history.canRedo) return null;
                   return <div data-idea-history className="mb-4 flex flex-wrap gap-2" aria-label="Historique du sujet">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!history.canUndo || !isCurrentCreation()} onClick={() => history.travel()} aria-label="Annuler la modification du sujet" aria-keyshortcuts="Meta+Z Control+Z" title="Annuler (⌘Z / Ctrl+Z)"><Undo2 className="h-3.5 w-3.5" /> Annuler</Button>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!history.canRedo || !isCurrentCreation()} onClick={() => history.travel(true)} aria-label="Rétablir la modification du sujet" aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y" title="Rétablir (⌘⇧Z / Ctrl+⇧Z / Ctrl+Y)"><Redo2 className="h-3.5 w-3.5" /> Rétablir</Button>
                  </div>;
                })()}
                <CreerStepIdea initialFormat={selectedFormat} channel={(deriveCanalFromState({ selectedFormat, isLinkedInCarousel }) as ForcedChannel | null) ?? forcedChannel} onNext={handleIdeaNext} onCoachingSelect={handleCoachingSelect} onNewsjackingSelect={handleNewsjackingSelect} onPhotosNext={handlePhotosNext} workspaceId={workspaceId} initialIdea={ideaText} initialPhotos={uploadedPhotos} initialPhotoDescription={photoDescription} initialPhotoSubject={photoSubject}
                  onIdeaChange={(value) => { if (isCurrentCreation()) ideaHistory.change(value, true); }} onPhotosChange={(photos) => { if (!isCurrentCreation()) return; setUploadedPhotos(photos); void savePhotos(photos); }}
                  onPhotoDescriptionChange={setPhotoDescription} onPhotoSubjectChange={(value) => { if (isCurrentCreation()) photoSubjectHistory.change(value, true); }}
                  photoEntry={photoEntry} onPhotoEntryChange={setPhotoEntry} />
              </div>
            )}

            <Suspense fallback={<div className="py-12 flex justify-center"><Spinner className="h-8 w-8" /></div>}>
            {/* Monté APRÈS le chargement des photos de la photothèque : le
                composant fige ses valeurs initiales (sous-mode, photos) au
                montage, et le 1er contenu sans photo bascule le sous-mode en
                texte pendant ce chargement. */}
            {step === "format" && !isLoadingLibraryPhotos && (
              <CreerStepFormat
                idea={ideaText} directStart={autoFlow}
                objective={objective || undefined}
                forcedChannel={forcedChannel}
                onChannelChange={(channel) => {
                  const next = new URLSearchParams(searchParams);
                  if (channel) next.set("canal", channel);
                  else next.delete("canal");
                  justStrippedRef.current = true;
                  setSearchParams(next, { replace: true });
                }}
                initialFormat={selectedFormat || undefined}
                initialChannel={isLinkedInCarousel ? "linkedin" : undefined}
                initialCarouselSubMode={carouselSubMode || undefined}
                initialSlideLength={slideLength}
                suggestedFormat={newsjackingSuggestedFormat || undefined}
                initialPhotos={uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
                initialPhotoDescription={photoDescription || undefined}
                newsjackingActive={!!newsjackingContext}
                onNext={(fmt, angle, sub, photos, desc, pm, pintData, linkedinCar, photoDump, textFirstMix, slideLen) => {
                  if (pintData) setPinterestData(pintData);
                  if (linkedinCar) setIsLinkedInCarousel(true);
                  else setIsLinkedInCarousel(false);
                  const directFirstContent = autoFlow && fmt === "carousel" && (sub === "photo" || sub === "text");
                  if (directFirstContent && (sub === "text" || photos?.length || uploadedPhotos.length)) {
                    autoGeneratePendingRef.current = true;
                  }
                  handleFormatNext(fmt, angle, { carouselSubMode: sub, photos, photoDescription: desc, photoMode: pm, linkedinCarousel: !!linkedinCar, photoDump, textFirstMix, slideLength: slideLen, skipQuestions: directFirstContent });
                }}
                onSelectionChange={({ channel, format, carouselSubMode: sub, slideLength: length }) => {
                  setSlideLength(length);
                  setIsLinkedInCarousel(channel === "linkedin" && format === "carousel");
                  // Persiste les choix en cours pour les restaurer au reload (avant « Suivant »).
                  setSelectedFormat((prev) => (prev === format ? prev : format));
                  setCarouselSubMode((prev) => (prev === sub ? prev : sub));
                }}
                onBack={() => { setStep("idea"); setNewsjackingContext(null); }}
                onIdeaChange={setIdeaText}
              />
            )}

            {step === "questions" && (
              <CreerStepQuestions
                format={selectedFormat || ""}
                subject={ideaText}
                editorialAngle={editorialAngle || undefined}
                questions={questions}
                loadingQuestions={loadingQuestions}
                loadError={questionsError}
                onNext={handleQuestionsNext}
                onSkip={handleSkipQuestions}
                onBack={() => setStep("format")}
                previousBriefsCount={briefsCount}
                initialAnswers={briefPrefillAnswers ?? (Object.keys(answers).length > 0 ? answers : undefined) ?? (aurianaDemoActive && ideaText === AURIANA_DEMO_SUBJECT && carouselSubMode === "text" && uploadedPhotos.length === 0 ? AURIANA_DEMO_FLOW.answers : undefined)}
                onAnswersChange={setAnswers}
                autoFirstContent={autoFlow}
                allowNarrative={selectedFormat === "carousel" && (carouselSubMode === "photo" || carouselSubMode === "mix")}
                fieldQuestion={newsjackingContext ? NEWSJACKING_FIELD_QUESTION : undefined}
              />
            )}

            {/* Réglages secondaires : APRÈS le bloc principal, repliés par défaut. */}
            {step === "questions" && selectedFormat === "carousel" && (
              <CarouselAdvancedOptions
                qualityMax={qualityMax}
                onQualityMaxChange={setQualityMax}
                qualityMaxLocked={qualityMaxLocked}
                coverIllustration={coverIllustration}
                onCoverIllustrationChange={setCoverIllustration}
                coverIllustrationLocked={coverIllustrationLocked}
              />
            )}



            {step === "hook_selection" && (
              <HookSelectionStep
                hooks={reelHooks}
                loading={hooksLoading}
                refreshing={hooksRefreshing}
                error={hooksError}
                onSelect={handleHookSelect}
                onSkip={handleHookSkip}
                onRefresh={() => fetchReelHooks(pendingReelAnswersRef.current, reelHooks.map((h) => h.text))}
                onBack={() => setStep("questions")}
              />
            )}

            {/* Mode « Mes slides » : saisie du texte slide par slide, zéro écriture IA */}
            {step === "user_slides" && (
              <UserSlidesStep
                initialPhotos={uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
                initialSlides={userSlidesDraft?.slides}
                initialCaption={userSlidesDraft?.caption}
                initialDraft={userSlidesInput}
                onDraftChange={setUserSlidesInput}
                onPhotosChange={(photos) => {
                  if (!isCurrentCreation()) return;
                  setUploadedPhotos(photos);
                  void savePhotos(photos);
                }}
                generating={userSlidesBuilding}
                onBack={() => setStep("format")}
                onGenerate={handleUserSlidesGenerate}
              />
            )}

            {step === "structure_review" && structureProposal && (
              <StructureReviewStep
                structureProposal={structureProposal}
                onConfirm={handleConfirmStructure}
                onSkip={handleSkipStructure}
                onBack={() => {
                  setStructureProposal(null);
                  setStep("questions");
                }}
                isLoading={generating || structureLoading}
                photos={(carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo") ? uploadedPhotos : undefined}
                carouselSubMode={carouselSubMode || "text"}
              />
            )}

            {step === "inspiration_proposals" && (
              inspirationLoading ? (
                <div className="py-12 text-center space-y-3 animate-fade-in">
                  <Spinner className="h-8 w-8 mx-auto" />
                  <p className="text-sm font-medium text-foreground">Analyse de l'épingle en cours...</p>
                  <p className="text-xs text-muted-foreground">L'IA étudie la structure, les mots-clés et le potentiel</p>
                </div>
              ) : inspirationProposals.length === 0 ? (
                <div className="py-12 text-center space-y-4 animate-fade-in">
                  <p className="text-sm text-muted-foreground">L'analyse n'a pas pu identifier de propositions. Essaie avec une autre épingle.</p>
                  <Button variant="outline" size="sm" onClick={() => setStep("format")}>
                    ← Choisir une autre image
                  </Button>
                </div>
              ) : (
                <PinterestInspirationStep
                  analysis={inspirationAnalysis}
                  proposals={inspirationProposals}
                  imagePreview={inspirationImagePreview}
                  onSelect={handleSelectInspirationProposal}
                  onBack={() => setStep("format")}
                />
              )
            )}

            {/* Photo dump : résolution des slides (avant le loader carrousel habituel) */}
            {step === "result" && photoDumpResolving && (
              photoDumpProgress ? (
                <PhotoDumpProgress
                  narrativeThread={photoDumpProgress.narrativeThread}
                  items={photoDumpProgress.items}
                />
              ) : (
                <div className="py-16 text-center space-y-3 animate-fade-in">
                  <Spinner className="h-8 w-8 mx-auto" />
                  <p className="text-sm font-medium text-foreground">Je compose ta série de photos…</p>
                  <p className="text-xs text-muted-foreground">Tes vraies photos d'abord, l'IA pour le reste.</p>
                </div>
              )
            )}

            {step === "result" && structureLoading && (
              <CarouselStructureLoader hasPhotos={uploadedPhotos.length > 0} />
            )}

            {step === "result" && autoGeneratePendingRef.current && !result && !generating && !structureLoading && (
              <div className="py-16 text-center space-y-3 animate-fade-in">
                <Spinner className="h-8 w-8 mx-auto" />
                <p className="text-sm font-medium text-foreground">Je lance ton premier carrousel…</p>
              </div>
            )}

            {step === "result" && !autoGeneratePendingRef.current && !isLaunchMode && !generating && !demoGenerating && !streaming && !pinterestVisualGenerating && !structureLoading && !photoDumpResolving && !result && (
              <ResultEmptyState quotaExhausted={quotaExhausted} error={error} interrupted={interruptedGeneration} onPricing={() => navigate("/pricing")} onRetry={handleRegenerate} onReset={requestReset} />
            )}

            {step === "result" && !isLaunchMode && (generating || demoGenerating || streaming || pinterestVisualGenerating || result) && (
              <CreerStepResult
                result={result?.raw || result}
                format={selectedFormat || "post"}
                generating={generating || demoGenerating || streaming || pinterestVisualGenerating}
                generationStage={generationStage || streamStage}
                // « Photos brutes » (pure_photo) : le texte écrit est retiré à la fin,
                // un plan ou des brouillons de texte annonceraient autre chose (08/10/2026).
                draftSlides={selectedFormat === "carousel" && carouselSubMode !== "pure_photo" ? draftSlides : undefined}
                outlineTitles={selectedFormat === "carousel" && carouselSubMode !== "pure_photo" ? outlineTitles : undefined}
                streamingContent={streaming ? streamingContent : undefined}
                step2of2={selectedFormat === "carousel" && !!lastConfirmedStructure && (carouselSubMode === "photo" || carouselSubMode === "mix")}
                qualityMax={qualityMax}
                photos={(selectedFormat === "carousel" || (photoMode && uploadedPhotos.length > 0)) ? uploadedPhotos : undefined}
                usedPhotoCount={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos.length : undefined}
                onEdit={handleEdit}
                onResultTextChange={(text) => setResult((prev) => prev ? { ...prev, raw: { ...(prev.raw || {}), edited_text: text, content: text } } : prev)}
                onPostPhotosChange={!isDemoMode ? async (photos) => {
                  if (!session?.user || !photos[0]?.base64) throw new Error("Photo indisponible. Réessaie après reconnexion.");
                  // Commit the new preview + durable publish URL together, only after upload.
                  // Unique path preserves the old image if the upload fails or edits are undone.
                  const response = await fetch(photos[0].base64);
                  const blob = await response.blob();
                  const ext = blob.type === "image/png" ? "png" : "jpg";
                  const path = `${session.user.id}/post-retouche-${crypto.randomUUID()}.${ext}`;
                  const { error } = await supabase.storage.from("calendar-media").upload(path, blob, { contentType: blob.type });
                  if (error) throw new Error("La nouvelle photo n'a pas pu être enregistrée. L'ancienne est conservée.");
                  const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
                  if (!data?.publicUrl) throw new Error("Adresse de la photo introuvable. Réessaie.");
                  setUploadedPhotos(photos);
                  setPhotoMode(true);
                  setResult((prev) => prev ? { ...prev, raw: { ...(prev.raw || {}), image_url: data.publicUrl } } : prev);
                } : undefined}
                onReset={requestReset}
                onRegenerate={handleRegenerate}
                onCopy={handleCopy}
                onSave={effectiveHandleSave}
                saveNotice={isDemoMode || carouselCloudEnabled ? undefined : ideaSaveNotice} autoSavedToIdeas={carouselCloudEnabled}
                savingContent={ideaSaving}
                canAutoPublish={!!publishChannel}
                reelMp4Url={reelMp4Url}
                onReelMp4Change={setReelMp4Url}
                onReelResultChange={(nextReel) => setResult((prev) => {
                  if (!prev) return prev;
                  // Script retouché directement : il prime sur le texte à plat de « Modifier » (lot 7).
                  const scriptChanged = JSON.stringify([nextReel?.sections, nextReel?.script]) !== JSON.stringify([prev.raw?.sections, prev.raw?.script]);
                  return { ...prev, raw: scriptChanged ? withoutEditedText(nextReel) : nextReel };
                })}
                reelWorkspaceId={workspaceId}
                onPublishOrSchedule={effectiveHandleAddToCalendar}
                publishOrScheduleLabel={fromCalendar ? "Sauvegarder dans le calendrier" : undefined}
                onGenerateVisuals={selectedFormat === "carousel" ? handleGenerateVisuals : undefined}
                visualLoading={visualLoading}
                visualsAutoError={visualsAutoError}
                visualChunkProgress={visualChunkProgress}
                visualSlides={visualSlides.length > 0 ? visualSlides : undefined}
                onCarouselDocumentChange={(raw, visuals) => {
                  // Le reçu de sauvegarde reste celui du carrousel courant (jamais
                  // la copie de l'éditeur) : sinon « Une version plus récente existe ».
                  setResult((prev: any) => prev ? { ...prev, raw: mergeEditorRaw(prev.raw, raw) } : prev);
                  setVisualSlides(visuals);
                }}
                onOpenCarouselStudio={workspaceReady && !!session?.user?.id && !isDemoMode && !aurianaDemoActive ? openCarouselStudio : undefined}
                carouselCloudTools={<CarouselSaveStatus save={carouselSave} />}
                carouselQuality={carouselQuality}
                onExportPptx={selectedFormat === "carousel" ? effectiveHandleExportPptx : undefined}
                onExportVisualPng={selectedFormat === "carousel" && visualSlides.length > 0 ? effectiveHandleExportVisualPng : undefined}
                onExportVisualPdf={selectedFormat === "carousel" && isLinkedInCarousel && visualSlides.length > 0 ? effectiveHandleExportVisualPdf : undefined}
                logoAvailable={!!(charterData as any)?.logo_url}
                onExportHybridPptx={selectedFormat === "carousel" && visualSlides.length > 0 ? effectiveHandleExportHybridPptx : undefined}
                onOpenInCanva={selectedFormat === "carousel" && visualSlides.length > 0 && !isDemoMode ? handleOpenInCanva : undefined}
                openingCanva={openingCanva}
                pinterestPinHtml={pinterestPinHtml}
                onExportPinterestPng={selectedFormat === "pinterest_visual" ? handleExportPinterestPng : selectedFormat === "pinterest_photo" ? handleExportPhotoBriefPng : undefined}
                onExportPinterestEditablePptx={selectedFormat === "pinterest_visual" ? handleExportPinterestEditablePptx : undefined}
                onSlidesUpdate={selectedFormat === "carousel" ? (slides, caption) => {
                  // Important : on remplace `result` par une NOUVELLE référence (et pas une
                  // mutation en place de result.raw.slides) sinon l'effet d'auto-persistance,
                  // qui dépend de l'identité de `result`, ne se redéclenche pas → les éditions
                  // de slide (swap photo, réordo, add/delete, texte) sont perdues au reload.
                  setResult((prev: any) => {
                    if (!prev?.raw) return prev;
                    // Retouche directe des slides : plus récente que le texte à plat (lot 7).
                    const nextRaw = { ...withoutEditedText(prev.raw), slides };
                    if (prev.raw.caption) nextRaw.caption = caption;
                    else if (prev.raw.carousel?.caption) nextRaw.carousel = { ...prev.raw.carousel, caption };
                    // L'IA n'avait fourni AUCUNE légende : sans cette branche, la légende
                    // éditée par l'utilisatrice n'était jamais écrite dans raw → publication
                    // avec légende vide alors que l'UI en affichait une.
                    else if (caption) nextRaw.caption = caption;
                    return { ...prev, raw: nextRaw };
                  });
                } : undefined}
                onAddPhoto={selectedFormat === "carousel" ? handleAddCarouselPhoto : undefined}
                carouselColors={selectedFormat === "carousel" ? carouselColors : undefined}
                onCarouselColorsChange={selectedFormat === "carousel" ? setCarouselColors : undefined}
                onCarouselStaleChange={selectedFormat === "carousel" ? setCarouselVisualsStale : undefined}
                charterColors={
                  selectedFormat === "carousel" && charterData?.color_primary
                    ? {
                        primary: charterData.color_primary,
                        secondary: charterData.color_secondary || charterData.color_primary,
                        accent: charterData.color_accent || charterData.color_primary,
                      }
                    : undefined
                }
                onStoriesUpdate={selectedFormat === "story" ? (stories) => {
                  setResult((prev) => {
                    if (!prev?.raw) return prev;
                    const key = Array.isArray(prev.raw.stories) ? "stories"
                      : Array.isArray(prev.raw.sequences) ? "sequences" : "slides";
                    return { ...prev, raw: { ...withoutEditedText(prev.raw), [key]: stories } };
                  });
                } : undefined}
                photoBriefOverlayHtml={photoBriefOverlayHtml}
                channel={isLinkedInCarousel ? "linkedin" : "instagram"}
                captionLoading={captionLoading}
                onRegenerateCaption={
                  isLinkedInCarousel && (carouselSubMode === "mix" || carouselSubMode === "photo" || carouselSubMode === "pure_photo")
                    ? regenerateCaption
                    : undefined
                }
                // « Mes slides » : changer d'angle relancerait une écriture IA — interdit.
                onChangeAngle={carouselSubMode === "user_slides" ? undefined : handleChangeAngle}
                currentAngle={editorialAngle}
                currentChannel={
                  selectedFormat === "linkedin" || isLinkedInCarousel ? "linkedin"
                  : selectedFormat?.startsWith("pinterest") ? "pinterest"
                  : "instagram"
                }
                sourceIdea={ideaText}
                sourceObjective={objective}
                sourceAngle={editorialAngle}
              />
            )}

            {step === "result" && currentWarnings.blocking.length > 0 && !generating && (
              <div role="alert" className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
                <p className="font-medium">Ce carrousel est à compléter avant de le publier.</p>
                <ul className="mt-2 list-disc pl-5">{currentWarnings.blocking.map((message: string, i: number) => <li key={i}>{message}</li>)}</ul>
              </div>
            )}

            {step === "result" && currentWarnings.suggestions.length > 0 && !generating && (
              <div data-testid="carousel-relecture" className="mt-4 rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground">
                <p className="font-medium">Pistes de relecture (facultatif)</p>
                <p className="mt-1 text-xs text-muted-foreground">{currentWarnings.blocking.length ? "" : "Ton carrousel est publiable tel quel. "}Ces passages gagneraient peut-être à être retouchés.</p>
                <ul className="mt-2 list-disc pl-5">{currentWarnings.suggestions.map((message: string, i: number) => <li key={i}>{message}</li>)}</ul>
              </div>
            )}

            {/* Transform LinkedIn text to carousel */}
            {step === "result" && result && !generating && !streaming && !isDemoMode && <CreationUpgradeInvite key={session?.user?.id} />}

            {step === "result" && selectedFormat === "linkedin" && result?.raw && (result.raw.content || result.raw.full_text || result.raw.hook) && !generating && !streaming && !demoGenerating && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
                <div>
                  <p className="text-sm font-semibold text-foreground">Transformer en carrousel LinkedIn ?</p>
                  <p className="text-xs text-muted-foreground">L'IA structure ton post en slides visuelles téléchargeables en PDF.</p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleTransformToLinkedInCarousel}
                  disabled={generating}
                  className="gap-1.5 shrink-0"
                >
                  <Palette className="h-3.5 w-3.5" /> Créer le carrousel
                </Button>
              </div>
            )}

            {/* Launch mode: multi-chapter results */}
            {isLaunchMode && (
              <LaunchSequenceResults
                launchGenerating={launchGenerating}
                launchIndex={launchIndex}
                launchResults={launchResults}
                setLaunchResults={setLaunchResults}
                selectedFormat={selectedFormat}
                onEdit={handleEdit}
                onReset={requestReset}
                onRegenerate={handleRegenerate}
                onCopy={handleCopy}
                photos={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
                ideaText={ideaText}
                objective={objective}
                editorialAngle={editorialAngle}
              />
            )}

            {step === "edit" && (
              <CreerStepEdit
                content={editContent}
                savedContent={editBaseline ?? undefined}
                // Chaque frappe part dans la copie de secours : un rechargement
                // ou un onglet fermé ne perd plus le texte en cours.
                onDraftChange={setEditContent}
                subject={ideaText}
                newsContext={newsjackingContext}
                workspaceId={workspaceId}
                format={selectedFormat || "post"}
                onSave={(edited) => {
                  // Carrousel et stories : le texte retrouve sa place dans les slides /
                  // stories (lot 7). Autres formats : gardé dans edited_text, que les
                  // chemins de sauvegarde (calendrier/idées) préfèrent à la version IA.
                  const applied = applyEditedText(selectedFormat, result?.raw, edited);
                  if (applied.ok === false) {
                    toast.error(applied.error, { duration: 10000 });
                    return false;
                  }
                  setEditContent(edited);
                  setEditBaseline(edited);
                  setResult((prev) => (prev ? { ...prev, raw: applied.raw } : prev));
                  // Le visuel suit le texte, comme pour une retouche directe sur la slide.
                  if (applied.slideChanges.length && visualSlides.length) {
                    let next = visualSlides;
                    let stale = false;
                    for (const change of applied.slideChanges) {
                      const slideNumber = applied.raw.slides?.[change.index]?.slide_number || change.index + 1;
                      const vi = next.findIndex((v) => v.slide_number === slideNumber);
                      if (vi < 0) { stale = true; continue; }
                      const patched = replaceSlideText(next[vi].html, change.field, change.oldText, change.newText);
                      if (!patched) { stale = true; continue; }
                      next = next.map((v, i) => (i === vi ? { ...v, html: patched } : v));
                    }
                    setVisualSlides(next);
                    if (stale) setCarouselVisualsStale(true);
                  }
                  toast.success("Modifications appliquées. Enregistre cette version pour la retrouver plus tard.");
                }}
                onBack={() => setStep("result")}
                onCopy={(text) => {
                  navigator.clipboard.writeText(text);
                  toast.success("Copié !");
                }}
              />
            )}
            </Suspense>
        </div>
      </div>

      {/* Fenêtre « Publier ou programmer » : publication immédiate, programmation
          auto (cron social-publish-scheduled) ou simple brouillon calendrier. */}
      <PublishOrScheduleDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        channel={publishChannel}
        disabledReason={publishDialogDisabledReason}
        blockedAction={
          publishChannel === "instagram" && publishDialogDisabledReason === REASON_IMAGE_MANQUANTE
            ? {
                label: "Ajouter une image",
                onClick: () => publishImageInputRef.current?.click(),
                busy: addingPublishImage,
              }
            : publishChannel === "instagram" && isCarouselPublish && visualSlides.length > INSTAGRAM_DIRECT_MAX_IMAGES
              // Carrousel texte de plus de 10 slides (jusqu'à 20 en Auto) : la
              // publication directe est impossible, on propose le téléchargement
              // pour publier depuis l'appli Instagram du téléphone.
              ? { label: "Télécharger les slides (ZIP)", onClick: () => void handleExportVisualPng(), icon: "download" as const }
              : null
        }
        channelConnected={connectionsKnown ? (publishChannel ? isSocialConnected(publishChannel) : false) : null}
        connectionLoading={connectionsLoading}
        onRefreshConnection={() => void refreshConnections()}
        onConnectChannel={handleConnectFromDialog}
        connectingChannel={connectingPublishChannel}
        publishing={publishingInstagram || publishingLinkedIn}
        onPublishNow={handlePublishNowFromDialog}
        scheduling={savingToCalendar}
        onSchedule={handleScheduleFromDialog}
        onDraft={(d) => handleConfirmCalendar({ date: d })}
        defaultDraftDate={paramCalendarDate || undefined}
        theme={ideaText}
        canal={selectedFormat === "newsletter" ? "newsletter" : selectedFormat?.startsWith("pinterest") ? "pinterest" : isLinkedInCarousel ? "linkedin" : publishChannel || "instagram"}
      />

      {/* Sélecteur de fichier du bouton « Ajouter une image » de la fenêtre ci-dessus. */}
      <input
        ref={publishImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handlePublishImageSelected(e.target.files?.[0] || null);
          e.target.value = "";
        }}
      />

      <PhotoMissingDialog
        open={photoMissingDialog.open}
        rawType={photoMissingDialog.rawType}
        onOpenChange={(open) => {
          if (!open) setPhotoMissingDialog({ open: false, rawType: null });
        }}
        onContinueText={() => {
          // Continuer en texte : relance la génération avec forceText.
          setPhotoMissingDialog({ open: false, rawType: null });
          handleGenerateVisuals({ forceText: true });
        }}
        onAddPhotos={() => {
          // Ajouter des photos : retour à l'étape format, on force le
          // sub-mode mix pour exposer la zone d'upload. Le contexte
          // (sujet, angle, réponses, format) est préservé.
          setCarouselSubMode("mix");
          setPhotoMissingDialog({ open: false, rawType: null });
          setStep("format");
        }}
      />
      <ConfirmResetDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        photoCount={uploadedPhotos.length}
        onConfirm={() => {
          setConfirmResetOpen(false);
          handleReset();
        }}
      />
      {studioSlideId && carouselCloudEnabled && editingIdeaId && <CarouselStudioDialog
        key={`${workspaceId}:${studioSlideId}`}
        userId={session!.user.id} workspaceId={workspaceId} isOwnSpace={isOwnSpace} ideaId={editingIdeaId}
        raw={result!.raw} slideId={studioSlideId} photos={recoverStudioPhotos(result!.raw, uploadedPhotos).filter(Boolean)}
        flush={carouselSave.flush} isCurrent={isCurrentCreation} onClose={() => setStudioSlideId(null)}
      />}
      <SaveToIdeasDialog
        open={saveIdeaDialogOpen}
        onOpenChange={setSaveIdeaDialogOpen}
        contentType={mapFormatToContentType(selectedFormat)}
        subject={ideaText}
        contentData={result?.raw}
        sourcePhotos={selectedFormat === "post" || photoMode ||
          (selectedFormat === "carousel" && ["photo", "mix", "pure_photo", "user_slides"].includes(carouselSubMode || ""))
          ? uploadedPhotos : []}
        onPrepareContent={selectedFormat === "post" && uploadedPhotos.length > 0
          ? raw => prepareIdeaPhotos(supabase, session?.user?.id, editingIdeaId, uploadedPhotos, raw)
          : undefined}
        isSaveCurrent={isCurrentCreation}
        sourceModule="creer"
        format={selectedFormat || undefined}
        objectif={objective || undefined}
        visualSlides={selectedFormat === "carousel" && visualSlides.length > 0 ? visualSlides : undefined}
        onUploadVisuals={selectedFormat === "carousel" ? uploadVisualsToStorage : undefined}
        editingIdeaId={editingIdeaId}
        onSavingChange={setIdeaSaving}
        onSaved={(id, complete, preparedContent) => {
          if (!isCurrentCreation()) return;
          setEditingIdeaId(id);
          if (preparedContent) setResult((prev: any) => prev ? { ...prev, raw: preparedContent } : prev);
          setSavedIdeaVersion({ signature: preparedContent
            ? JSON.stringify([preparedContent, visualSlides, uploadedPhotos])
            : ideaVersionSignature, complete });
        }}
      />
    </div>
  );
}
