import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { invokeWithHeartbeat } from "@/lib/invoke-with-heartbeat";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { slideText } from "@/lib/slide-text";
import { deriveCanalFromState, mapFormatToContentType } from "@/features/creer/format-mappers";
import { pickNonEmpty } from "@/features/creer/photo-source";
import { findPublishableImageUrl, extractInstagramCaption, extractLinkedInText, instagramPublishDisabledReason, isInstagramPublishTarget, linkedInPublishDisabledReason, REASON_IMAGE_MANQUANTE, checkScheduleGuards, tokenExpiresBeforeSchedule } from "@/features/creer/publish-guards";
import { startSocialConnect } from "@/lib/social-connect";
import { UX_UPLOAD_LIMITS, uxSizeError } from "@/lib/upload-limits";
import { useSearchParams, useLocation, useNavigate, Link } from "react-router-dom";
import { versConnexions, memoriseRetour } from "@/lib/retour-apres-detour";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";
import PublishOrScheduleDialog from "@/components/creer/PublishOrScheduleDialog";
import { useSocialConnections } from "@/hooks/use-social-connections";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Loader2, Palette, RefreshCw, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import BrandingStatusBanner from "@/components/content/BrandingStatusBanner";
import BrandReviewGate from "@/components/branding/BrandReviewGate";
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";
import { useLinkedInCarouselCaption } from "@/hooks/use-linkedin-carousel-caption";
import { useUserSlidesGenerate } from "@/hooks/use-user-slides-generate";
import { useSelectInspirationProposal } from "@/hooks/use-select-inspiration-proposal";
import { useCalendarSave } from "@/hooks/use-calendar-save";
import { useFormatNext } from "@/hooks/use-format-next";
import { useGenerateVisuals } from "@/hooks/use-generate-visuals";
import { useDoGenerate } from "@/hooks/use-do-generate";
import CreerStepIdea from "@/components/creer/CreerStepIdea";
// Code-splitting : les étapes après l'écran « idée » sont chargées à la demande
// (chunk /creer initial allégé → premier écran plus rapide).
const CreerStepFormat = lazy(() => import("@/components/creer/CreerStepFormat"));
const CreerStepQuestions = lazy(() => import("@/components/creer/CreerStepQuestions"));
const CreerStepResult = lazy(() => import("@/components/creer/CreerStepResult"));
import type { CarouselColors } from "@/components/creer/formatRenderers/CarouselPhotoResult";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
const CreerStepEdit = lazy(() => import("@/components/creer/CreerStepEdit"));
import CreerStepper, { type StepperKey } from "@/components/creer/CreerStepper";
const PinterestInspirationStep = lazy(() => import("@/components/creer/PinterestInspirationStep"));
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";
import { useUserPhotos } from "@/hooks/use-user-photos";
const StructureReviewStep = lazy(() => import("@/components/creer/StructureReviewStep"));
// Mode « Mes slides » : l'utilisatrice fournit le texte, l'IA ne fait que le design.
const UserSlidesStep = lazy(() => import("@/components/creer/UserSlidesStep"));
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
import { CONTENT_STRUCTURES, EDITORIAL_ANGLES, LINKEDIN_EDITORIAL_ANGLES, PINTEREST_EDITORIAL_ANGLES, PINTEREST_VISUAL_ANGLES, getStructureForCombo, normalizeObjective } from "@/lib/content-structures";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
// DEMO_DATA n'est plus importé directement — on utilise demoData du context
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useOpenInCanva } from "@/hooks/use-open-in-canva";
import { publishImageToInstagram, publishRenderedCarouselToInstagram } from "@/lib/instagram-publish";
import { publishTextToLinkedIn, isLinkedInNotConnectedError } from "@/lib/linkedin-publish";
import { useBrandCharter } from "@/hooks/use-branding";
import { useActivityExamples } from "@/hooks/use-activity-examples";
import { supabase } from "@/integrations/supabase/client";
import { loadFlowState, saveFlowState, clearFlowState, savePhotos, loadPhotos, loadPhotosLocal } from "@/hooks/use-flow-persistence";
import DraftConflictDialog from "@/components/creer/DraftConflictDialog";
import { isAurianaDemoEmail, AURIANA_DEMO_SUBJECT, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";

// Phase 4: streaming SSE is now encapsulated inside useContentGenerator
import { useUserPlan } from "@/hooks/use-user-plan";

function LowCreditsBanner({ remaining, plan }: { remaining: number; plan: string }) {
  const shouldShow = plan === "free" && remaining < 5 && remaining > 0;

  useEffect(() => {
    if (shouldShow) {
      posthog.capture("low_credits_banner_shown", { remaining, plan });
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <div className="mb-4 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} />
        <p className="text-sm text-warning">
          <span className="font-medium">Plus que {remaining} crédit{remaining > 1 ? "s" : ""}</span> ce mois-ci.
          {" "}Utilise-les pour ce qui compte le plus pour toi.
        </p>
      </div>
      <Link
        to="/pricing"
        onClick={() => {
          posthog.capture("low_credits_banner_cta_clicked", { remaining, plan });
          // Elle est en pleine création : les tarifs proposeront d'y revenir.
          memoriseRetour();
        }}
        className="shrink-0 text-xs font-medium text-warning hover:text-warning underline underline-offset-2 transition-colors"
      >
        Découvrir le Premium
      </Link>
    </div>
  );
}

type Step = "idea" | "format" | "questions" | "hook_selection" | "structure_review" | "inspiration_proposals" | "user_slides" | "result" | "edit";


export default function CreerUnifie() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  const { data: charterData } = useBrandCharter();
  const { activityText } = useActivityExamples();
  const { remainingWithBonus, loading: planLoading, plan, usage, refresh: refreshPlan } = useUserPlan();

  // URL params
  const paramFormat = searchParams.get("format");
  const paramSujet = searchParams.get("sujet") || searchParams.get("subject") || "";
  const paramObjectif = searchParams.get("objectif") || searchParams.get("objective") || "";
  const paramMode = searchParams.get("mode");
  const paramFrom = searchParams.get("from");
  const paramAngle = searchParams.get("angle");
  // "auto=1" (welcome → 1ère génération guidée) : saute l'étape format et enchaîne
  // direct sur les questions (l'IA choisit l'angle). Évite la page blanche du 1er contenu.
  const paramAuto = searchParams.get("auto") === "1";
  const paramIdeaId = searchParams.get("idea_id");
  const paramCalendarDate = searchParams.get("calendar_date") || "";

  const isFreshStart = searchParams.get("new") === "1";
  const clearedFreshStart = useRef(false);

  // Location state (from calendar, etc.)
  const locState = (location.state as any) || {};

  // Check if we have URL params that should override persisted state
  const paramCanal = searchParams.get("canal");
  const hasUrlParams = !!(paramFormat || paramCanal || paramSujet || paramObjectif || locState.fromCalendar);

  // Restore persisted state if:
  // 1. We have URL params / location state (coming back from calendar, etc.)
  // 2. OR there is a recent session in storage (survives HMR / tab refresh)
  const hasSomeContext = hasUrlParams || !!location.state;

  if (isFreshStart && !clearedFreshStart.current) {
    clearFlowState();
    clearedFreshStart.current = true;
  }
  const existingFlowState = isFreshStart ? null : loadFlowState();
  const aurianaDemoActive = locState?.demoScenario === "auriana-carousel" || existingFlowState?.demoScenario === "auriana-carousel";

  // ── Garde-fou « il y a déjà un contenu en cours » ──
  // Une nouvelle intention de création (recyclage, actu, brief, raccourci sujet…)
  // qui arrive alors qu'un brouillon significatif existe : on demande au lieu de
  // silencieusement restaurer l'ancien contenu (et donc ignorer la demande).
  const [draftConflict] = useState(() => {
    if (isFreshStart || aurianaDemoActive) return null;
    const d = existingFlowState;
    if (!d || d.step === "idea") return null;
    const hasDraftContent = !!(d.ideaText || d.result || d.editContent || d.selectedFormat);
    if (!hasDraftContent) return null;
    const newSubject = (paramSujet || locState.sujet || locState.subject || "").trim();
    const hasNewIntent = !!(
      newSubject ||
      locState.fromRecycle ||
      locState.fromBrief ||
      locState.fromCalendar ||
      locState.context ||
      paramFormat
    );
    if (!hasNewIntent) return null;
    // Même sujet que le brouillon → pas de conflit, on reprend simplement.
    if (newSubject && d.ideaText && newSubject.slice(0, 80) === d.ideaText.trim().slice(0, 80)) return null;
    return {
      draft: {
        step: d.step,
        ideaText: d.ideaText || "",
        selectedFormat: d.selectedFormat ?? null,
        result: d.result ?? null,
        editContent: d.editContent || "",
        editingIdeaId: d.editingIdeaId ?? null,
      },
      newSubject,
    };
  });
  const [conflictResolved, setConflictResolved] = useState(false);
  const conflictPending = !!draftConflict && !conflictResolved;

  const shouldRestore = !draftConflict && (hasSomeContext || aurianaDemoActive || (existingFlowState !== null && existingFlowState.step !== "idea"));
  const persistedState = useRef(shouldRestore ? (existingFlowState || null) : null);

  // Core state — restore from sessionStorage if available
  const ps = persistedState.current;
  const autoOpenTransform = paramMode === "transform";
  // Mode « 1er contenu » (auto=1) figé pour TOUTE la session du parcours :
  // le paramètre d'URL est retiré une fois l'init consommée (voir plus bas),
  // donc paramAuto retombe à false — le mode doit survivre en state + dans la
  // persistance du flux pour que le récap « Ton premier contenu » tienne au
  // reload. On n'hérite du flag persisté QUE sans nouveaux params d'URL (une
  // nouvelle entrée avec params est un NOUVEAU parcours, jamais un 1er contenu).
  const [autoFlow] = useState<boolean>(paramAuto || (!hasUrlParams && !!ps?.autoFlow));

  // ── Canal forcé via URL (?canal=) vs canal du brouillon restauré ──
  // Les raccourcis "Créer/Programmer sur tel réseau" (dashboard) doivent PRIMER sur
  // un brouillon d'un AUTRE canal : on repart à l'étape format sur le canal demandé
  // (le sujet est conservé). CreerStepFormat pré-sélectionne ensuite ce canal.
  const FORCED_CANALS = ["instagram", "linkedin", "pinterest", "newsletter"] as const;
  type ForcedChannel = (typeof FORCED_CANALS)[number];
  const forcedChannel: ForcedChannel | null =
    (FORCED_CANALS as readonly string[]).includes(paramCanal || "") ? (paramCanal as ForcedChannel) : null;
  const restoredCanal = deriveCanalFromState(ps);
  const canalConflict = !!forcedChannel && !!restoredCanal && restoredCanal !== forcedChannel;
  // Restore step — allow "result" and "edit" if their data is available
  const safeStep = (() => {
    if (!ps?.step) return "idea";
    // Canal forcé ≠ canal du brouillon → on repart au choix du format sur le bon canal.
    if (canalConflict) {
      const hasIdea = !!(ps?.ideaText || paramSujet || locState.sujet || locState.subject);
      return hasIdea ? "format" : "idea";
    }
    if (ps.step === "result" && ps.result) return "result";
    // Génération interrompue (reload/fermeture mi-streaming) : le crédit est déjà
    // débité — on restaure le texte déjà écrit au lieu de renvoyer à l'étape format.
    if (ps.step === "result" && !ps.result && (ps.pendingStream?.text?.length ?? 0) > 40) return "result";
    if (ps.step === "edit" && ps.editContent) return "edit";
    // structure_review dépend de `structureProposal`, qui n'est PAS persisté →
    // au reload il repart à null et l'écran serait vide. On retombe donc sur
    // l'étape format (ou idée) plutôt que sur un écran mort.
    if (ps.step === "structure_review") {
      return ps.selectedFormat ? "format" : "idea";
    }
    // hook_selection dépend des hooks générés, non persistés → au reload
    // l'écran serait vide. On retombe sur format (mêmes raisons que structure_review).
    if (ps.step === "hook_selection") {
      return ps.selectedFormat ? "format" : "idea";
    }
    // user_slides (mode « Mes slides ») : le texte collé vit dans le state local
    // de l'écran, non persisté → au reload on repart de l'étape format.
    if (ps.step === "user_slides") {
      return ps.selectedFormat ? "format" : "idea";
    }
    // Si flow photo/mix/pure_photo avec photos retrouvées, garder le step en cours
    if (["questions", "inspiration_proposals"].includes(ps.step)) {
      const isPhotoFlow = ps.carouselSubMode === "photo" || ps.carouselSubMode === "mix" || ps.carouselSubMode === "pure_photo";
      if (isPhotoFlow && loadPhotos().length > 0) return ps.step as Step;
      // Questions persistées → on peut restaurer l'étape telle quelle (elles
      // sont réhydratées dans useContentGenerator par l'effet de mount plus
      // bas). Sans ça, un reload en pleines questions renvoyait à l'étape
      // format et RÉGÉNÉRAIT d'autres questions (réponses orphelines).
      if (ps.step === "questions" && (ps.questions?.length ?? 0) > 0) return "questions";
      // Mode 1er contenu : le récap « Générer mon premier contenu » se suffit
      // du sujet (pas besoin des questions) → on y revient tel quel.
      if (ps.step === "questions" && ps.autoFlow && ps.ideaText) return "questions";
      return ps.selectedFormat ? "format" : "idea";
    }
    // États avec données volatiles non persistées (result/edit invalides)
    if (["result", "edit"].includes(ps.step)) {
      return ps.selectedFormat ? "format" : "idea";
    }
    return ps.step as Step;
  })();
  const [step, setStep] = useState<Step>(safeStep);
  
  const [ideaText, setIdeaText] = useState(ps?.ideaText || paramSujet || locState.sujet || locState.subject || "");
  const [objective, setObjective] = useState<string | null>(
    ps?.objective || paramObjectif || locState.objectif || locState.objective || null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(canalConflict ? null : (ps?.selectedFormat || paramFormat || null));
  const [editorialAngle, setEditorialAngle] = useState<string | null>(ps?.editorialAngle || null);
  const [answers, setAnswers] = useState<Record<string, string>>(ps?.answers || {});
  // Lot 7 reels : choix de l'angle d'attaque avant génération. Les hooks ne sont
  // PAS persistés (safeStep retombe sur "format" au reload) ; le hook choisi est
  // gardé en state pour que « Régénérer » réécrive sur le MÊME angle.
  const [reelHooks, setReelHooks] = useState<ReelHook[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hooksRefreshing, setHooksRefreshing] = useState(false);
  const [hooksError, setHooksError] = useState<string | null>(null);
  const [selectedReelHook, setSelectedReelHook] = useState<ReelHook | null>(null);
  const pendingReelAnswersRef = useRef<Record<string, string>>({});
  const [editContent, setEditContent] = useState(ps?.editContent || "");
  const [existingCalendarContent, setExistingCalendarContent] = useState<string | null>(null);
  const [calendarPostId] = useState<string | null>(locState?.calendarPostId || null);
  const [calendarPostDate] = useState<string | null>(locState?.postDate || null);
  const fromCalendar = !!(locState?.fromCalendar && calendarPostId);

  // Photo states (carousel photo + post photo)
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | "pure_photo" | "user_slides" | null>(canalConflict ? null : (ps?.carouselSubMode ?? null));
  // Longueur choisie via les puces « Longueur » (CreerStepFormat).
  // "auto" = aucun slide_count envoyé, l'edge applique ses cibles adaptatives.
  const [slideLength, setSlideLength] = useState<"auto" | "short" | "classic">(ps?.slideLength ?? "auto");
  const slideCountChoice = slideLength === "short" ? 4 : slideLength === "classic" ? 7 : undefined;
  // Init à [] : le base64 n'est plus stocké inline (cf use-flow-persistence
  // hybride). Les photos sont rehydratées en asynchrone par l'effet plus bas
  // (IndexedDB pour les dépôts, refetch serveur pour la photothèque).
  const [uploadedPhotos, setUploadedPhotos] = useState<any[]>([]);
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
  const [currentBriefId, setCurrentBriefId] = useState<string | null>(null);
  // Réponses pré-remplies quand on arrive depuis « Créer à partir de ce brief »
  // (boîte à idées) — affichées telles quelles sur l'étape questions.
  const [briefPrefillAnswers, setBriefPrefillAnswers] = useState<Record<string, string> | null>(null);
  // Id du brief d'origine quand on vient de « Créer à partir de ce brief » :
  // on met à jour ce brief au lieu d'en créer un doublon à la génération.
  const [incomingBriefId, setIncomingBriefId] = useState<string | null>(null);
  const [briefsCount, setBriefsCount] = useState(0);
  const [photoBriefOverlayHtml, setPhotoBriefOverlayHtml] = useState<string | null>(null);
  const [structureProposal, setStructureProposal] = useState<StructureProposal | null>(null);
  // "Mode qualité Max" : rédaction du carrousel par Opus (plus soigné, ~2-3x plus lent).
  // Off par défaut → Sonnet (rapide), plus d'escalade silencieuse.
  const [qualityMax, setQualityMax] = useState(false);
  // Qualité Max = fonctionnalité Premium. Sur un plan gratuit le toggle est verrouillé
  // (badge + upsell) au lieu d'échouer à la génération. `plan` défaut "free" pendant le
  // chargement → fail closed (verrouillé tant qu'on ne sait pas que l'utilisatrice est payante).
  const qualityMaxLocked = plan === "free";
  // Garde : si l'état avait été laissé ON (toggle mémorisé d'une session) alors que le plan
  // est gratuit, on le remet à OFF pour ne JAMAIS envoyer `qualityMax` côté serveur (sinon
  // échec quota). Couvre tous les sites d'envoi d'un seul endroit.
  useEffect(() => {
    if (qualityMaxLocked && qualityMax) setQualityMax(false);
  }, [qualityMaxLocked, qualityMax]);
  // « Illustration de couverture » : Recraft génère une grande illustration de
  // marque en couverture (layout ancré en bas). Off par défaut (dosé + coût).
  // Premium, même verrou fail-closed que Qualité Max.
  const [coverIllustration, setCoverIllustration] = useState(false);
  const coverIllustrationLocked = plan === "free";
  useEffect(() => {
    if (coverIllustrationLocked && coverIllustration) setCoverIllustration(false);
  }, [coverIllustrationLocked, coverIllustration]);
  const [structureLoading, setStructureLoading] = useState(false);
  const [lastConfirmedStructure, setLastConfirmedStructure] = useState<SlideProposal[] | null>(null);
  const [lastNarrativeThread, setLastNarrativeThread] = useState<string | null>(null);
  const [newsjackingContext, setNewsjackingContext] = useState<string | null>(null);
  const [newsjackingSuggestedFormat, setNewsjackingSuggestedFormat] = useState<string | null>(null);

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



  // When arriving at /creer without params AND no persisted in-progress flow, clear state
  // This distinguishes "fresh sidebar click" from "page reload mid-flow"
  useEffect(() => {
    if (!hasSomeContext && !shouldRestore) {
      clearFlowState();
      sessionStorage.removeItem("creer_unifie_result");
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
    if (isFreshStart) {
      setSearchParams({}, { replace: true });
    }
  }, [isFreshStart, setSearchParams]);

  // Le canal demandé via l'URL (?canal=) est géré de façon déterministe à
  // l'initialisation (canalConflict ci-dessus) + pré-sélectionné dans
  // CreerStepFormat via la prop forcedChannel. Plus d'effet de priming fragile ici.

  // Charger le nombre de briefs existants quand on arrive sur les questions
  useEffect(() => {
    if (step !== "questions" || !session?.user?.id) return;
    let q = supabase.from("content_briefs")
      .select("id", { count: "exact", head: true });
    // Scope workspace : un·e manager voit le compteur de l'espace actif, pas le sien.
    q = workspaceId && workspaceId !== session.user.id
      ? q.eq("workspace_id", workspaceId)
      : q.eq("user_id", session.user.id);
    q.then(({ count }: any) => setBriefsCount(count || 0));
  }, [step, session?.user?.id, workspaceId]);

  const [launchResults, setLaunchResults] = useState<any[]>([]);
  const [launchIndex, setLaunchIndex] = useState(0);
  const [launchGenerating, setLaunchGenerating] = useState(false);

  // Post-generation states
  const [saving, setSaving] = useState(false);
  const [saveIdeaDialogOpen, setSaveIdeaDialogOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(ps?.savedId || null);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(ps?.editingIdeaId ?? paramIdeaId ?? null);
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
  

  // ── Persist generated result to sessionStorage ──
  const CREER_RESULT_KEY = "creer_unifie_result";
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

  const {
    generate,
    generating,
    generationStage,
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

  // Réhydrate les questions persistées : elles vivent dans useContentGenerator
  // (initialisées à [] à chaque mount) alors que le flux les sauvegarde. Sans
  // ça, restaurer l'étape "questions" afficherait un écran vide.
  useEffect(() => {
    if (safeStep === "questions" && (ps?.questions?.length ?? 0) > 0 && questions.length === 0) {
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
      // streamé — le crédit était débité. Le stream étant coupé net, le JSON est
      // souvent TRONQUÉ : JSON.parse échoue et le repli { content: texte brut }
      // affichait le JSON tel quel dans la préviz (vu au re-test live 04/07).
      // On extrait donc "content" même d'un JSON incomplet.
      const text = ps!.pendingStream!.text;
      let parsed: any;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        parsed = null;
      }
      if (!parsed) {
        const contentMatch = text.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/);
        if (contentMatch) {
          try {
            parsed = { content: JSON.parse(`"${contentMatch[1]}"`) };
          } catch {
            parsed = { content: contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') };
          }
        } else {
          parsed = { content: text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "") };
        }
      }
      setResult({ type: (ps!.pendingStream!.format || ps?.selectedFormat || "post") as any, raw: parsed });
      saveFlowState({ pendingStream: null });
      toast("💾 J'ai récupéré le texte généré avant l'interruption.", {
        description: "Vérifie-le : il peut être incomplet. « Regénérer » en refait une version (1 crédit).",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Auto-persist state on changes
  useEffect(() => {
    // Only persist when we're past the idea step or have meaningful state
    if (step !== "idea" || ideaText) {
      saveFlowState({
        step,
        ideaText,
        objective,
        selectedFormat,
        editorialAngle,
        answers,
        editContent,
        result: result || undefined,
        visualSlides,
        savedId,
        questions: questions || [],
        inspirationAnalysis: inspirationAnalysis || undefined,
        inspirationProposals: inspirationProposals || [],
        inspirationImagePreview: inspirationImagePreview || null,
        demoScenario: aurianaDemoActive ? "auriana-carousel" : undefined,
        editingIdeaId,
        carouselSubMode,
        slideLength,
        photoDescription,
        isLinkedInCarousel,
        autoFlow,
      });
    }
  }, [step, ideaText, objective, selectedFormat, editorialAngle, editContent, result, visualSlides?.length, savedId, questions, inspirationAnalysis, inspirationProposals, inspirationImagePreview, editingIdeaId, carouselSubMode, slideLength, photoDescription, isLinkedInCarousel]);

  // Filet anti-perte : pendant le streaming, sauvegarder le texte déjà reçu
  // (throttle ~1,5 s). Sans ça, un reload/fermeture mi-génération repartait à
  // l'étape format et JETAIT le texte — crédit déjà débité (QA compte neuf 04/07).
  const lastStreamSaveRef = useRef(0);
  useEffect(() => {
    if (!streaming || !streamingContent) return;
    const now = Date.now();
    if (now - lastStreamSaveRef.current < 1500) return;
    lastStreamSaveRef.current = now;
    saveFlowState({
      step: "result",
      pendingStream: { text: streamingContent, format: selectedFormat || "post", ts: now },
    });
  }, [streaming, streamingContent, selectedFormat]);

  // Une fois le résultat en place (stream terminé ou restauration), purger le
  // texte partiel : il ne doit resservir qu'en cas d'interruption réelle.
  useEffect(() => {
    if (result) saveFlowState({ pendingStream: null });
  }, [result]);

  // Pre-fill from URL/state & auto-advance (only when URL params are present)
  const initDone = useRef(false);
  // L'effet dépend de location.search : notre propre nettoyage des paramètres
  // (plus bas) le re-déclenche une fois. Ce drapeau absorbe cet écho — sans
  // lui, le re-run voyait sujet/format vides et pouvait renvoyer à l'étape
  // idée alors que l'init venait de lancer le parcours.
  const justStrippedRef = useRef(false);
  useEffect(() => {
    // Conflit brouillon vs nouvelle demande : on ne touche à rien tant que
    // l'utilisatrice n'a pas tranché (voir DraftConflictDialog).
    if (conflictPending) return;
    if (justStrippedRef.current) {
      justStrippedRef.current = false;
      return;
    }
    // If we restored from persistence, skip URL-based init
    if (ps && !hasUrlParams) {
      initDone.current = true;
      return;
    }
    // Prevent re-running on subsequent location.search changes after first init
    if (initDone.current && !hasUrlParams) return;
    initDone.current = true;

    const subject = paramSujet || locState.sujet || locState.subject || "";
    const obj = paramObjectif || locState.objectif || locState.objective || null;

    if (subject) setIdeaText(subject);
    if (obj) setObjective(normalizeObjective(obj) ?? obj);
    if (locState?.existingContent) setExistingCalendarContent(locState.existingContent);

    // Newsjacking context arriving from "Créer depuis cette actu" (IdeaDetailSheet)
    // — preserves the actu block so the generated content stays a real newsjacking.
    if (locState?.context && typeof locState.context === "string" && locState.context.trim()) {
      setNewsjackingContext(locState.context.trim().slice(0, 3800));
    }

    const fmtRaw = paramFormat || locState?.format;
    const paramCarouselSubMode = searchParams.get("carouselSubMode") as "text" | "photo" | "mix" | "pure_photo" | "user_slides" | null;

    // Mapping vers les formats canoniques de CreerUnifie/use-content-generator
    // Couvre les valeurs venues du calendrier ET de saved_ideas (boîte à idées).
    const FORMAT_MAP: Record<string, string> = {
      "post_photo": "post",
      "post_texte": "post",
      "post_carrousel": "carousel",
      "carrousel": "carousel",
      "story_serie": "story",
    };
    const SUPPORTED_FORMATS = new Set([
      "post", "carousel", "reel", "story", "linkedin",
      "newsletter", "pinterest", "pinterest_visual", "pinterest_inspiration", "pinterest_photo",
    ]);
    const fmtMapped = fmtRaw ? (FORMAT_MAP[fmtRaw] || fmtRaw) : null;
    const fmt = fmtMapped && SUPPORTED_FORMATS.has(fmtMapped) ? fmtMapped : null;

    if (fmt) setSelectedFormat(fmt);
    if (paramCarouselSubMode) setCarouselSubMode(paramCarouselSubMode);

    // « Créer à partir de ce brief » (boîte à idées) : on réutilise les questions
    // et réponses déjà saisies et on atterrit directement sur l'étape questions
    // pré-remplie, au lieu de tout recommencer.
    if (locState?.fromBrief && Array.isArray(locState.questions) && locState.questions.length > 0) {
      const briefAngle = locState?.angle || paramAngle || undefined;
      if (briefAngle) setEditorialAngle(briefAngle);
      setQuestions(locState.questions as any);
      if (locState.answers && typeof locState.answers === "object") {
        setBriefPrefillAnswers(locState.answers as Record<string, string>);
      }
      if (locState.briefId) setIncomingBriefId(locState.briefId as string);
      setStep("questions");
      if (location.state) {
        window.history.replaceState({}, "", window.location.href);
      }
      return;
    }

    if (fmt && subject.trim()) {
      // Build enriched subject directly from locState to avoid race condition
      // (setExistingCalendarContent is async and not yet available)
      const calendarContent = locState?.existingContent || null;
      const enrichedSubject = calendarContent
        ? subject + "\n\n[Contenu existant à approfondir]\n" + calendarContent
        : subject;
      const calendarAngle = locState?.angle || paramAngle || undefined;
      if (calendarAngle) setEditorialAngle(calendarAngle);

      // Si un angle est déjà choisi (depuis la boîte à idées ou le calendrier),
      // on saute l'étape "format" et on enchaîne directement sur les questions.
      // Sinon, pour carousel/post on passe par l'étape format pour permettre
      // le sous-choix (carrousel texte/photo, toggle photo).
      if ((fmt === "carousel" || fmt === "post") && !locState?.fromCalendar && !paramAngle && !paramAuto) {
        setStep("format");
      } else {
        // auto=1 : on saute l'étape format → questions directement (l'IA choisit l'angle)
        handleFormatNext(fmt, calendarAngle, { overrideSubject: enrichedSubject });
      }
    } else if (locState?.fromCalendar && subject) {
      // Calendar fallback path (already handled above with FORMAT_MAP)
      if (locState.angle) setEditorialAngle(locState.angle);
      setStep("format");
    } else if (subject.trim()) {
      // Sujet présent mais format absent ou non-supporté (ex : coach « Surprise »
      // qui renvoie recommended_format="auto") → ouvrir l'étape format pour
      // choisir canal + format, au lieu de retomber sur l'étape « idée ».
      setStep("format");
    } else if (fmt) {
      setStep("format");
    } else if (!ps) {
      setStep("idea");
    }
    // Clean up location.state after reading it to prevent re-init on tab switch
    if (location.state) {
      window.history.replaceState({}, '', window.location.href);
    }

    // ── Paramètres « à usage unique » : consommés = retirés ──
    // ?sujet/?format/?auto/… sont des ORDRES de démarrage, pas un état d'URL.
    // Laissés collés, chaque remontage de la page (reload, onglet recyclé,
    // retour de veille) REJOUAIT toute cette init : questions régénérées,
    // résultat effacé par resetGenerator, retour au récap — vécu le 13/08 sur
    // le 1er contenu post-onboarding (« ça a sauté, revenu au début »). La
    // reprise après reload passe désormais par la persistance du flux
    // (use-flow-persistence), comme pour ?new=1. ?canal/?from/?mode restent :
    // ils ne déclenchent pas d'auto-avancée destructrice.
    // Exception : en ?mode=transform, ?format pré-coche le sous-mode Recycler
    // (CreerTransformTab le lit dans l'URL) — on ne touche à rien sur ce chemin.
    const ONE_SHOT_PARAMS = ["sujet", "subject", "format", "objectif", "objective", "auto", "angle", "carouselSubMode"];
    if (paramMode !== "transform" && ONE_SHOT_PARAMS.some((k) => searchParams.has(k))) {
      const cleaned = new URLSearchParams(searchParams);
      ONE_SHOT_PARAMS.forEach((k) => cleaned.delete(k));
      justStrippedRef.current = true;
      setSearchParams(cleaned, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, conflictPending]);

  // ── Library photos → preload as if uploaded (chemin /photos → /creer) ──
  // Capturé une seule fois au mount pour survivre au cleanup replaceState.
  const libraryPhotoIdsRef = useRef<string[]>(
    Array.isArray(locState?.libraryPhotoIds)
      ? locState.libraryPhotoIds.filter((x: unknown): x is string => typeof x === "string")
      : [],
  );
  const libraryLoadedRef = useRef(false);
  useEffect(() => {
    if (libraryLoadedRef.current) return;
    const ids = libraryPhotoIdsRef.current;
    if (ids.length === 0) return;
    if (!workspaceId) return; // attend que le workspace soit prêt
    libraryLoadedRef.current = true;

    (async () => {
      setIsLoadingLibraryPhotos(true);
      setStep("format");
      try {
        const { data, error: qErr } = await supabase
          .from("user_photos")
          .select("*")
          .in("id", ids)
          .eq("workspace_id", workspaceId)
          .eq("status", "ready");
        if (qErr) throw qErr;
        if (!data || data.length === 0) throw new Error("Photo introuvable dans ta photothèque.");

        const ordered = ids
          .map((id) => data.find((p) => p.id === id))
          .filter(Boolean) as UserPhotoRow[];

        const results = await Promise.allSettled(ordered.map((p) => userPhotoToBase64(p)));
        const items: PhotoItem[] = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            items.push({
              id: crypto.randomUUID(),
              base64: r.value.base64,
              preview: r.value.base64,
              name: r.value.name,
              mimeType: r.value.mimeType,
              context: "",
              userPhotoId: ordered[i].id,
            });
          }
        });
        if (items.length === 0) throw new Error("Impossible de charger la photo.");
        setUploadedPhotos(items);
        if (items.length > 0) savePhotos(items);

        // Préremplir ideaText avec photo.name si descriptif
        const first = ordered[0];
        const candidate = (first?.name ?? "").trim();
        const looksLikeFilename = /^(img|dsc|dscn|photo|p)[\W_]?\d+/i.test(candidate);
        if (!ideaText && candidate.length >= 8 && !looksLikeFilename) {
          setIdeaText(candidate);
        }
      } catch (e: any) {
        toast.error(e?.message || "Impossible de charger la photo de la photothèque.");
        setStep("idea");
      } finally {
        setIsLoadingLibraryPhotos(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);


  // ── Rehydrate les photos après restauration du flux (recyclage d'onglet,
  // refresh). Base64 local depuis IndexedDB + originaux photothèque re-
  // téléchargés depuis le serveur. Voir use-flow-persistence (hybride). ──
  const photosRehydratedRef = useRef(false);
  useEffect(() => {
    if (photosRehydratedRef.current) return;
    if (!shouldRestore) return;
    // Le chemin "Partir de la photothèque" (locState.libraryPhotoIds) gère
    // déjà son propre chargement — ne pas le doubler.
    if (libraryPhotoIdsRef.current.length > 0) return;
    const manifest = loadPhotos();
    if (manifest.length === 0) { photosRehydratedRef.current = true; return; }
    if (uploadedPhotos.length > 0) { photosRehydratedRef.current = true; return; }
    // Les originaux photothèque ont besoin du workspace pour le refetch.
    const needsWorkspace = manifest.some((m) => m.local === false);
    if (needsWorkspace && !workspaceId) return; // attend que le workspace soit prêt

    photosRehydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const local = await loadPhotosLocal();
        const needFetch = local.filter((p: any) => p.needsLibraryFetch && p.userPhotoId);
        const byUserPhotoId: Record<string, { base64: string; mimeType?: string; name?: string }> = {};
        if (needFetch.length > 0 && workspaceId) {
          const ids = needFetch.map((p: any) => p.userPhotoId as string);
          const { data } = await supabase
            .from("user_photos")
            .select("*")
            .in("id", ids)
            .eq("workspace_id", workspaceId)
            .eq("status", "ready");
          const rows = (data || []) as UserPhotoRow[];
          const results = await Promise.allSettled(rows.map((r) => userPhotoToBase64(r)));
          results.forEach((res, i) => {
            if (res.status === "fulfilled") {
              byUserPhotoId[rows[i].id] = {
                base64: res.value.base64,
                mimeType: res.value.mimeType,
                name: res.value.name,
              };
            }
          });
        }
        const merged = local
          .map((p: any) => {
            if (!p.needsLibraryFetch) return p;
            const lib = p.userPhotoId ? byUserPhotoId[p.userPhotoId] : undefined;
            if (!lib) return null; // refetch impossible → photo perdue
            return {
              ...p,
              base64: lib.base64,
              preview: lib.base64,
              mimeType: p.mimeType || lib.mimeType,
              name: p.name || lib.name,
              needsLibraryFetch: undefined,
            };
          })
          .filter(Boolean) as PhotoItem[];
        if (cancelled) return;
        if (merged.length === 0) {
          // Toutes les photos perdues (base64 local évincé + refetch impossible) :
          // on le DIT au lieu de repartir en silence sur un carrousel sans photos.
          if (manifest.length > 0) {
            toast.warning("Tes photos n'ont pas pu être rechargées. Ré-ajoute-les avant de régénérer les visuels.");
          }
          return;
        }
        setUploadedPhotos((prev) => (prev.length > 0 ? prev : merged));
        setGeneratedWithPhotos((prev) => (prev.length > 0 ? prev : merged));
        if (merged.length < manifest.length) {
          toast.warning("Certaines photos n'ont pas pu être rechargées.");
        }
      } catch (e) {
        console.warn("[creer] rehydrate photos failed", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Show error
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // Snapshot défensif : sync uploadedPhotos -> generatedWithPhotos dès qu'on a
  // des photos. Évite la perte si le state UI est reset entre l'upload et la
  // génération du visuel (changement d'onglet, re-render, etc.).
  useEffect(() => {
    carouselPhotoCountRef.current = uploadedPhotos.length;
    if (uploadedPhotos.length > 0) {
      // Compare le CONTENU, pas juste la longueur : un swap de photo à cardinalité
      // constante doit aussi rafraîchir le snapshot (sinon repli sur d'anciennes photos).
      setGeneratedWithPhotos((prev) =>
        prev.length === uploadedPhotos.length && prev.every((p, i) => p === uploadedPhotos[i])
          ? prev
          : uploadedPhotos,
      );
      if (selectedFormat === "carousel" || photoMode) {
        savePhotos(uploadedPhotos);
      }
    }
  }, [uploadedPhotos, selectedFormat, photoMode]);

  // ── Step handlers ──

  const handleCoachingSelect = useCallback((data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" | "mix" | "pure_photo" | "user_slides"; editorialAngle?: string }) => {
    setAnswers({});
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

  const handleIdeaNext = (idea: string) => {
    setIdeaText(idea);
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
    if (subject && subject.trim()) {
      setIdeaText(subject.trim());
    }
    setSelectedFormat(null);
    setEditorialAngle(null);
    setCarouselSubMode(null);
    setPhotoMode(false);
    setPinterestData(null);
    setStep("format");
  };

  // ─── Lot 7 reels : étape de choix du hook ───
  // Appel GRATUIT (step "hooks" hors BILLED_STEPS côté edge). Jamais bloquant :
  // en cas d'échec, l'écran propose « Continuer sans choisir » (= hook auto,
  // comportement historique).
  const fetchReelHooks = async (ans: Record<string, string>, excludeHooks?: string[]) => {
    const isRefresh = !!excludeHooks?.length;
    if (isRefresh) setHooksRefreshing(true);
    else { setHooksLoading(true); setReelHooks([]); }
    setHooksError(null);
    try {
      // Ré-indexation par le TEXTE de la question (même logique que doGenerate) :
      // l'edge reçoit "vraie question → réponse", pas "q_0 → réponse".
      const textById = new Map(questions.map((q) => [q.id, q.question]));
      const answersArray = Object.entries(ans)
        .filter(([, v]) => v && v.trim())
        .map(([id, v]) => ({ question: textById.get(id) || id, answer: v }));
      const { data, error: fnError } = await invokeWithTimeout("creative-flow", {
        body: {
          step: "hooks",
          contentType: "reel",
          context: ideaText,
          objective: objective || null,
          face_cam: "oui",
          answers: answersArray.length > 0 ? answersArray : null,
          workspace_id: workspaceId && workspaceId !== session?.user?.id ? workspaceId : null,
          ...(excludeHooks?.length ? { exclude_hooks: excludeHooks.slice(0, 12) } : {}),
        },
      }, 60000);
      if (fnError) throw fnError;
      const hooks = Array.isArray((data as any)?.hooks) ? (data as any).hooks : [];
      if (hooks.length === 0) throw new Error("empty");
      setReelHooks(hooks.slice(0, 3));
    } catch (e) {
      console.error("[CreerUnifie] fetchReelHooks failed:", e);
      // Un refresh raté garde les cartes précédentes (toujours utilisables) —
      // mais il DOIT le dire. Sans message, l'écran affichait des angles et des
      // boutons qui semblaient ne rien faire, sans la moindre explication
      // (vécu live 03/08, sujet « brader mes savons »).
      const raw = (e as any)?.message;
      // "empty" = charge vide renvoyée en 200 par une edge pas encore
      // redéployée : message technique, jamais montré tel quel.
      const detail = typeof raw === "string" && raw.trim() && raw !== "empty" ? raw.trim() : null;
      setHooksError(
        isRefresh
          ? detail
            ? `Pas de nouveaux angles : ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`
            : "Je n'ai pas réussi à trouver 3 autres angles. Ceux-ci restent valables."
          : detail || "Je n'ai pas réussi à préparer les angles d'attaque.",
      );
    } finally {
      setHooksLoading(false);
      setHooksRefreshing(false);
    }
  };

  const handleHookSelect = async (hook: ReelHook) => {
    if (generating || streaming) return;
    setSelectedReelHook(hook);
    setStep("result");
    await doGenerate(pendingReelAnswersRef.current, hook);
  };

  const handleHookSkip = async () => {
    if (generating || streaming) return;
    setSelectedReelHook(null);
    setStep("result");
    await doGenerate(pendingReelAnswersRef.current);
  };

  const handleQuestionsNext = async (ans: Record<string, string>) => {
    if (generating || structureLoading || streaming) return; // garde anti double-clic (évite une 2e génération facturée)
    setAnswers(ans);

    // Sauvegarder le brief en base pour les futures créations
    // ⚠️ On n'enregistre PAS les briefs sans sujet : ils polluent l'historique
    // récent envoyé à l'IA et provoquent des questions hors-sujet.
    if (session?.user?.id && Object.keys(ans).length > 0 && ideaText.trim().length > 0) {
      try {
        if (incomingBriefId) {
          // Vient de « Créer à partir de ce brief » : on met à jour le brief
          // existant au lieu d'en créer un doublon.
          await supabase.from("content_briefs").update({
            objective: objective || null,
            format: selectedFormat || null,
            editorial_angle: editorialAngle || null,
            questions: questions.map(q => ({ id: q.id, question: q.question })),
            answers: ans,
          } as any).eq("id", incomingBriefId);
          setCurrentBriefId(incomingBriefId);
        } else {
          const { data: briefData } = await supabase.from("content_briefs").insert({
            user_id: session.user.id,
            workspace_id: workspaceId && workspaceId !== session.user.id ? workspaceId : null,
            subject: ideaText,
            objective: objective || null,
            format: selectedFormat || null,
            editorial_angle: editorialAngle || null,
            questions: questions.map(q => ({ id: q.id, question: q.question })),
            answers: ans,
          } as any).select("id").maybeSingle();
          if (briefData?.id) setCurrentBriefId(briefData.id);
        }
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
    await doGenerate(answers);
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
    setPendingAngleRegen(true);
  };
  useEffect(() => {
    if (!pendingAngleRegen) return;
    setPendingAngleRegen(false);
    doGenerate(answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAngleRegen, editorialAngle]);

  // ── LinkedIn carousel caption: appel dédié à linkedin-ai/caption-for-carousel ──
  const { captionLoading, regenerateCaption } = useLinkedInCarouselCaption({
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
  const purePhotoStrippedRef = useRef<any>(null);
  useEffect(() => {
    if (carouselSubMode !== "pure_photo") return;
    const r: any = (result as any)?.raw;
    if (!r?.slides || !Array.isArray(r.slides) || r.slides.length === 0) return;
    if (purePhotoStrippedRef.current === r) return;
    // Source de vérité : snapshot pris au moment de la génération, sinon état UI courant.
    const photoCount = generatedWithPhotos.length || uploadedPhotos.length;
    if (photoCount === 0) return;
    purePhotoStrippedRef.current = r;
    const baseSlides = r.slides.slice(0, photoCount);
    // Si l'IA a produit moins de slides que de photos, on complète avec des slides vides.
    while (baseSlides.length < photoCount) {
      baseSlides.push({ slide_number: baseSlides.length + 1, role: "body" });
    }
    // Liste blanche (pas de spread) : les champs des gabarits texte-sur-photo
    // (kicker, points, big_number, template, cta_label…) transportent du texte
    // qui serait re-composé sur la photo — ils ne doivent PAS survivre ici.
    const cleaned = baseSlides.map((s: any, i: number) => ({
      slide_number: i + 1,
      role: s.role || "body",
      slide_type: "photo_full",
      overlay_text: null,
      title: "",
      body: "",
      photo_index: i + 1,
    }));
    setResult((prev: any) => {
      if (!prev) return prev;
      const nextRaw = { ...(prev.raw || {}), slides: cleaned, no_overlay: true, carousel_type: "photo" };
      return { ...prev, raw: nextRaw };
    });
  }, [result, carouselSubMode, generatedWithPhotos.length, uploadedPhotos.length]);


  const handleConfirmStructure = async (
    confirmedSlides: SlideProposal[],
    proposalOverride?: StructureProposal,
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
    setLastNarrativeThread(narrativeThread || null);
    setStructureProposal(null);
    setStep("result");
    // Ré-indexe les réponses par le TEXTE de la question, comme le chemin direct
    // de doGenerate : keyées `q_0`/`q_1`, le modèle qui rédige perdrait tout le
    // cadrage des questions (il ne connaît pas les IDs).
    const rekeyedAnswers: Record<string, string> = (() => {
      const textById = new Map(questions.map((q) => [q.id, q.question]));
      const out: Record<string, string> = {};
      for (const [id, v] of Object.entries(answers)) {
        if (!v || !v.trim()) continue;
        out[textById.get(id) || id] = v;
      }
      return out;
    })();
    // Même repli que les visuels : si le state UI a été reset entre l'upload et
    // cette génération, le snapshot generatedWithPhotos tient encore les photos.
    const photosForText = pickNonEmpty(uploadedPhotos, generatedWithPhotos);
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
      ...(narrativeThread ? { narrativeThread } : {}),
      ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: photosForText.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription } : {}),
      ...(carouselSubMode === "mix"
        ? (isTextFirstMix
            ? { carouselType: "mix", textFirst: true, ...(textFirstCatalog.length > 0 ? { photoCatalog: textFirstCatalog } : {}) }
            : { carouselType: "mix", photos: photosForText.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription })
        : {}),
      ...(carouselSubMode === "pure_photo" ? { carouselType: "photo", photos: photosForText.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription } : {}),
      ...(photoMode ? { photoMode: true, photos: photosForText.length > 0 ? photosForText.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context, mimeType: p.mimeType, userPhotoId: p.userPhotoId })) : undefined, photoDescription } : {}),
      ...(qualityMax ? { qualityMax: true } : {}),
      ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
    });
  };

  const handleSkipStructure = async (slides: SlideProposal[]) => {
    await handleConfirmStructure(slides);
  };

  // ── Cœur de la génération de contenu (6 sous-flux selon format/sous-mode) ──
  const { doGenerate } = useDoGenerate({
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const handleEdit = () => {
    const r = result?.raw || result;
    let text = "";

    // Si une édition manuelle a déjà été sauvegardée, on la rouvre telle quelle.
    if (r?.edited_text?.trim()) {
      setEditContent(r.edited_text);
      setStep("edit");
      return;
    }

    if (!r) {
      // Pas de résultat IA — utiliser le contenu existant du calendrier ou le brouillon
      text = existingCalendarContent || "";
    } else if (selectedFormat === "carousel" && Array.isArray(r?.slides)) {
      const slidesText = (r.slides as any[])
        .map((s: any) => {
          const header = `--- SLIDE ${s.slide_number} (${s.role || ""}) ---`;
          const parts = [s.title, s.body].filter(Boolean);
          return `${header}\n${parts.join("\n")}`;
        })
        .join("\n\n");
      const captionParts: string[] = [];
      if (r.caption?.hook) captionParts.push(r.caption.hook);
      if (r.caption?.body) captionParts.push(r.caption.body);
      if (r.caption?.cta) captionParts.push(r.caption.cta);
      const captionText = captionParts.length > 0
        ? `\n\n--- CAPTION ---\n${captionParts.join("\n\n")}`
        : "";
      const hashtagsText = r.caption?.hashtags?.length > 0
        ? `\n\n${(r.caption.hashtags as string[]).map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}`
        : "";
      text = slidesText + captionText + hashtagsText;

    } else if (selectedFormat === "reel" && Array.isArray(r?.sections)) {
      text = (r.sections as any[])
        .map((s: any) => {
          const header = `--- ${s.label || s.section_label || `Section ${s.section_number || ""}`} (${s.timing || ""}) ---`;
          const parts = [s.texte_parle, s.texte_overlay, s.action].filter(Boolean);
          return `${header}\n${parts.join("\n")}`;
        })
        .join("\n\n");

    } else if (selectedFormat === "story" && (Array.isArray(r?.stories) || Array.isArray(r?.sequences) || Array.isArray(r?.slides))) {
      const stories = (Array.isArray(r.stories) && r.stories) || (Array.isArray(r.sequences) && r.sequences) || (Array.isArray(r.slides) && r.slides) || [];
      text = (stories as any[])
        .map((s: any, i: number) => {
          const header = `--- STORY ${s.number || i + 1} (${s.type || s.format || ""}) ---`;
          const content = s.text || s.texte || s.content || s.instruction || "";
          const sticker = s.sticker ? `\n🏷️ Sticker : ${s.sticker}` : "";
          return `${header}\n${content}${sticker}`;
        })
        .join("\n\n");

    } else if (selectedFormat === "linkedin" && (r?.hook || r?.full_text)) {
      if (r.full_text) {
        text = r.full_text;
      } else {
        text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
      }
      if (Array.isArray(r.hashtags) && r.hashtags.length > 0) {
        text += `\n\n${(r.hashtags as string[]).join(" ")}`;
      }

    } else if (selectedFormat === "pinterest_visual" && (r?.title || r?.description)) {
      text = `📌 TITRE :\n${r.title || ""}\n\n📝 DESCRIPTION :\n${r.description || ""}`;

    } else if (selectedFormat === "pinterest_photo" && (r?.title || r?.photo_brief)) {
      text = `📌 TITRE :\n${r.title || ""}\n\n📝 DESCRIPTION :\n${r.description || ""}\n\n📷 BRIEF PHOTO :\n• Sujet : ${r?.photo_brief?.what || ""}\n• Cadrage : ${r?.photo_brief?.framing || ""}\n• Lumière : ${r?.photo_brief?.lighting || ""}\n• Accessoires : ${(r?.photo_brief?.props || []).join(", ")}\n• Couleurs : ${r?.photo_brief?.colors || ""}\n• Ambiance : ${r?.photo_brief?.mood || ""}`;

    } else if (r?.content) {
      text = r.content;
    } else if (r?.post) {
      text = r.post;
    } else if (r?.text) {
      text = r.text;
    } else if (r?.hook && r?.body) {
      text = [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    } else if (typeof r === "string") {
      text = r;
    } else {
      text = JSON.stringify(r, null, 2);
    }

    // Fallback: si texte vide ou juste "null", utiliser le contenu existant
    if ((!text || text === "null" || !text.trim()) && existingCalendarContent) {
      text = existingCalendarContent;
    }

    setEditContent(text);
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
    setVisualSlides([]);
    setPinterestPinHtml(null);
    setCarouselSubMode(null);
    setIsLinkedInCarousel(false);
    setUploadedPhotos([]);
    setPhotoDescription("");
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
    setEditingIdeaId(null);
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
    if (!session?.user?.id || !result?.raw || saving) return;
    const r = result.raw;
    if (selectedFormat === "carousel" && r?.slides) {
      setSaving(true);
      try {
        // Slide 1 quel que soit le format (texte=title, mixte/photo=overlay_text).
        const hookText = slideText(r.slides?.[0]);
        const captionText = [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n\n");
        const { data } = await supabase.from("generated_carousels" as any).insert({
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
        if (data) setSavedId((data as any).id);
      } catch (e: any) {
        console.warn("generated_carousels insert failed:", e?.message);
        toast.error("La sauvegarde du carrousel a échoué. Réessaie.");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSave = async () => {
    await persistCarousel();
    // Ouvrir le dialog SaveToIdeasDialog (insertion réelle dans saved_ideas)
    setSaveIdeaDialogOpen(true);
  };

  const handleAddToCalendar = async () => {
    if (!session?.user?.id || !result?.raw) return;
    // Auto-save carousel if not already saved
    if (selectedFormat === "carousel" && !savedId && result?.raw?.slides) {
      await persistCarousel();
    }
    // If coming from calendar, save directly back
    if (fromCalendar) {
      await handleSaveBackToCalendar();
      return;
    }
    setPublishDialogOpen(true);
  };

  // Remplacement de la photo d'une slide de carrousel (depuis CarouselPhotoResult).
  // Ajoute la photo choisie au set du carrousel si elle est nouvelle (ou retrouve son
  // index si elle y est déjà) et renvoie son index 1-based. Les visuels seront
  // régénérés ensuite par l'utilisatrice via la bannière « Mettre à jour les visuels ».
  const handleAddCarouselPhoto = useCallback(
    (photo: PhotoItem): number => {
      const matches = (p: any) =>
        (photo.id && p.id === photo.id) || (p.base64 && p.base64 === photo.base64);
      const existingIdx = uploadedPhotos.findIndex(matches);
      if (existingIdx >= 0) return existingIdx + 1;
      // Deux ajouts avant re-render voient la même longueur closurée : le compteur
      // ref garantit des index distincts (sinon deux slides pointent la même photo).
      const newIndex = Math.max(uploadedPhotos.length, carouselPhotoCountRef.current) + 1;
      carouselPhotoCountRef.current = newIndex;
      setUploadedPhotos((prev) => (prev.some(matches) ? prev : [...prev, photo]));
      return newIndex;
    },
    [uploadedPhotos],
  );

  // ── Génération des visuels du carrousel (+ pré-génération en arrière-plan) ──
  const { handleGenerateVisuals } = useGenerateVisuals({
    result,
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
  });

  // ═══ Casting automatique bibliothèque (régime texte d'abord) ═══
  // L'edge renvoie library_photo_index quand une photo de la bibliothèque matche
  // strictement la directive d'une slide. On charge ces photos (URL signée → base64),
  // on les ajoute au set du carrousel et on pose photo_index — la slide arrive
  // « pré-castée » (badge via cast_source). Les slides sans match restent à caster.
  const autoCastRef = useRef<any>(null);
  useEffect(() => {
    const rawSlides = result?.raw?.slides;
    if (!Array.isArray(rawSlides)) return;
    if (autoCastRef.current === result) return;
    const toCast = rawSlides.filter(
      (s: any) => Number.isInteger(s?.library_photo_index) && !Number.isInteger(s?.photo_index),
    );
    if (toCast.length === 0) return;
    autoCastRef.current = result;
    const rows = textFirstRowsSnapshotRef.current;
    (async () => {
      const resolved = new Map<number, PhotoItem>();
      for (const s of toCast) {
        const li = s.library_photo_index as number;
        if (resolved.has(li)) continue;
        const row = rows[li - 1];
        if (!row) continue;
        try {
          const { base64, mimeType, name } = await userPhotoToBase64(row);
          resolved.set(li, {
            id: row.id,
            userPhotoId: row.id,
            base64,
            preview: base64,
            name,
            mimeType,
            context: "",
          });
        } catch (e) {
          console.warn("[casting] photo bibliothèque illisible, slide laissée à caster", e);
        }
      }
      if (resolved.size === 0) return;
      const prev = uploadedPhotosLiveRef.current || [];
      const next = [...prev];
      const indexByLibrary = new Map<number, number>();
      for (const [li, item] of resolved) {
        const existing = next.findIndex((p: any) => p.userPhotoId && p.userPhotoId === item.userPhotoId);
        if (existing >= 0) indexByLibrary.set(li, existing + 1);
        else {
          next.push(item);
          indexByLibrary.set(li, next.length);
        }
      }
      setUploadedPhotos(next);
      savePhotos(next);
      setResult((prevR: any) => {
        if (!prevR?.raw?.slides) return prevR;
        const nextSlides = prevR.raw.slides.map((s: any) => {
          const li = s?.library_photo_index;
          if (Number.isInteger(li) && indexByLibrary.has(li) && !Number.isInteger(s?.photo_index)) {
            return { ...s, photo_index: indexByLibrary.get(li), cast_source: "library_auto" };
          }
          return s;
        });
        return { ...prevR, raw: { ...prevR.raw, slides: nextSlides } };
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

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
  const { isConnected: isSocialConnected, getTokenExpiry } = useSocialConnections();

  const publishableImageUrl = findPublishableImageUrl(result?.raw || result, uploadedPhotos?.[0]?.preview);
  // Reel monté : URL durable (bucket `calendar-media`) remontée par ReelResult.
  // Vaut `null` tant qu'aucune vidéo n'est rattachable — voir `archiveReelMp4`.
  const [reelMp4Url, setReelMp4Url] = useState<string | null>(null);

  // ── Sauvegarde dans le calendrier (nouveau post + mise à jour d'un post existant) ──
  const { savingToCalendar, handleConfirmCalendar, handleSaveBackToCalendar, uploadVisualsToStorage } = useCalendarSave({
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
    reelMp4Url,
    publishableImageUrl,
    calendarPostId,
    calendarPostDate,
    setPublishDialogOpen,
    persistCarousel,
  });

  // ── Ajout d'image depuis la fenêtre « Publier ou programmer » (post sans visuel) ──
  // L'image part dans le bucket public `calendar-media` (même chemin que les visuels
  // du calendrier) puis est rattachée au résultat (raw.image_url) : publication
  // immédiate, programmation (media_urls) et aperçu du feed la retrouvent tous là.
  const publishImageInputRef = useRef<HTMLInputElement>(null);
  const [addingPublishImage, setAddingPublishImage] = useState(false);
  const handlePublishImageSelected = async (file: File | null) => {
    if (!file) return;
    if (!session?.user) {
      toast.error("Tu dois être connectée.");
      return;
    }
    const sizeErr = uxSizeError(file, UX_UPLOAD_LIMITS.media);
    if (sizeErr) {
      toast.error(sizeErr);
      return;
    }
    setAddingPublishImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("calendar-media").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
      if (!data?.publicUrl) throw new Error("L'image a été envoyée mais son adresse est introuvable.");
      setResult((prev: any) => (prev ? { ...prev, raw: { ...(prev.raw || {}), image_url: data.publicUrl } } : prev));
      toast.success("Image ajoutée à ton post !");
    } catch (err: any) {
      toast.error("L'image n'a pas pu être ajoutée", { description: err?.message || "Réessaie dans un instant." });
    } finally {
      setAddingPublishImage(false);
    }
  };

  const isCarouselPublish = selectedFormat === "carousel";
  // L'option « Maintenant/Programmer » (Instagram) n'apparaît que pour un contenu du canal
  // Instagram : un post LinkedIn, un carrousel LinkedIn, une épingle Pinterest ou
  // une newsletter ne doivent pas le proposer, même désactivé.
  const showInstagramPublish = isInstagramPublishTarget({ selectedFormat, isLinkedInCarousel });
  const publishInstagramDisabledReason =
    instagramPublishDisabledReason({
      selectedFormat,
      isCarousel: isCarouselPublish,
      visualSlidesCount: visualSlides.length,
      publishableImageUrl,
      isLinkedInCarousel,
    }) ||
    // Visuels périmés : ne pas publier une version qui ne reflète plus les éditions.
    (isCarouselPublish && carouselVisualsStale
      ? "Tu as modifié des slides depuis le dernier rendu. Mets à jour les visuels avant de publier."
      : undefined);

  const handlePublishInstagram = async () => {
    if (!session?.user) {
      toast.error("Tu dois être connecté.");
      return;
    }
    if (publishInstagramDisabledReason) {
      toast.error(publishInstagramDisabledReason);
      return;
    }
    const caption: string = extractInstagramCaption(result?.raw || result);

    setPublishingInstagram(true);
    try {
      let permalink: string | undefined;
      if (isCarouselPublish) {
        const { getIncludeLogoPref } = await import("@/lib/export-logo");
        const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
        toast.info("Préparation du carrousel… (rendu des visuels en images)");
        const res = await publishRenderedCarouselToInstagram({
          caption,
          visualSlides,
          logoUrl,
          workspaceId,
          userId: session.user.id,
        });
        permalink = res.permalink;
      } else {
        const res = await publishImageToInstagram({
          caption,
          imageUrl: publishableImageUrl!,
          workspaceId,
          userId: session.user.id,
        });
        permalink = res.permalink;
      }
      toast.success(
        permalink
          ? "Publié sur Instagram ! Ouvre ton profil pour le voir."
          : "Publié sur Instagram !",
        permalink ? { action: { label: "Voir sur Instagram", onClick: () => window.open(permalink, "_blank") } } : undefined,
      );
    } catch (e: any) {
      const msg = e?.message || "Échec de la publication Instagram.";
      if (msg.toLowerCase().includes("aucun compte instagram")) {
        toast.error(msg, { action: { label: "Connecter", onClick: () => versConnexions(navigate) } });
      } else {
        toast.error(msg);
      }
    } finally {
      setPublishingInstagram(false);
    }
  };

  // ═══ Publication directe LinkedIn (post texte) ═══
  // Disponible pour un post LinkedIn texte (hors carrousel LinkedIn, qui est visuel).
  const isLinkedInTextPost = selectedFormat === "linkedin" && !isLinkedInCarousel;
  const publishLinkedInDisabledReason = linkedInPublishDisabledReason({
    isLinkedInTextPost,
    raw: result?.raw || result,
  });

  const handlePublishLinkedIn = async () => {
    if (!session?.user) {
      toast.error("Tu dois être connecté.");
      return;
    }
    if (publishLinkedInDisabledReason) {
      toast.error(publishLinkedInDisabledReason);
      return;
    }
    const text: string = extractLinkedInText(result?.raw || result);

    setPublishingLinkedIn(true);
    try {
      const res = await publishTextToLinkedIn({
        text,
        workspaceId,
        userId: session.user.id,
      });
      toast.success(
        res.permalink
          ? "Publié sur LinkedIn ! Ouvre ton profil pour le voir."
          : "Publié sur LinkedIn !",
        res.permalink ? { action: { label: "Voir sur LinkedIn", onClick: () => window.open(res.permalink, "_blank") } } : undefined,
      );
    } catch (e: any) {
      const msg = e?.message || "Échec de la publication LinkedIn.";
      if (isLinkedInNotConnectedError(msg)) {
        toast.error(msg, { action: { label: "Connecter", onClick: () => versConnexions(navigate) } });
      } else {
        toast.error(msg);
      }
    } finally {
      setPublishingLinkedIn(false);
    }
  };

  // ═══ Fenêtre « Publier ou programmer » ═══
  // Canal de publication automatique du contenu affiché (null = brouillon seulement).
  const publishChannel: "instagram" | "linkedin" | null =
    isLinkedInTextPost ? "linkedin" : showInstagramPublish ? "instagram" : null;
  const publishDialogDisabledReason =
    publishChannel === "linkedin" ? publishLinkedInDisabledReason : publishInstagramDisabledReason;

  const handlePublishNowFromDialog = async () => {
    if (publishChannel === "linkedin") await handlePublishLinkedIn();
    else await handlePublishInstagram();
    setPublishDialogOpen(false);
  };

  // Connexion OAuth déclenchée DEPUIS la fenêtre de publication : avant, un
  // compte non connecté renvoyait un message texte vers Paramètres → Connexions
  // sans aucun bouton — la cliente devait quitter /creer de son propre chef, sans
  // garantie de retour, et le contenu généré restait en plan. `startSocialConnect`
  // mémorise ce chemin AVANT de partir (+ `reopenPublish=1`, un paramètre à usage
  // unique comme les autres ci-dessus) ; le retour est automatique une fois
  // connectée (`SocialConnectionsCard`, `lireRetour`), contenu préservé par
  // `use-flow-persistence` (2h), et la fenêtre se rouvre TOUTE SEULE ci-dessous.
  const [connectingPublishChannel, setConnectingPublishChannel] = useState(false);
  const handleConnectFromDialog = async () => {
    if (!publishChannel) return;
    setConnectingPublishChannel(true);
    const depuis = `${location.pathname}${location.search}${location.search ? "&" : "?"}reopenPublish=1`;
    const { error } = await startSocialConnect(publishChannel, workspaceId, {
      quoi: "ton contenu prêt à publier",
      depuis,
    });
    if (error) {
      toast.error(error);
      setConnectingPublishChannel(false);
    }
    // Pas de else : en cas de succès, window.location.assign() quitte la page.
  };

  useEffect(() => {
    if (searchParams.get("reopenPublish") !== "1") return;
    // Le flow restauré (result) peut arriver après ce premier passage — ne
    // consommer le paramètre qu'UNE FOIS le contenu là, sinon un run précoce le
    // strippe pour rien et l'ouverture automatique n'a plus jamais lieu.
    if (!result) return;
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("reopenPublish");
    setSearchParams(cleaned, { replace: true });
    setPublishDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Programme la publication : mêmes gardes que la publication immédiate + compte
  // connecté + date future, puis délègue à handleConfirmCalendar (insert + uploads
  // + auto_publish). Le cron social-publish-scheduled publie à l'heure dite.
  const handleScheduleFromDialog = async (input: string) => {
    const reseau = publishChannel === "linkedin" ? "LinkedIn" : "Instagram";
    const guard = checkScheduleGuards({
      publishChannel,
      disabledReason: publishDialogDisabledReason,
      isChannelConnected: publishChannel ? isSocialConnected(publishChannel) : false,
      input,
    });
    if (guard.blocked) {
      if (guard.reason === "no_channel") return;
      if (guard.reason === "not_connected") {
        toast.error(guard.message, {
          description: guard.description,
          action: { label: "Connecter", onClick: () => versConnexions(navigate) },
        });
        return;
      }
      toast.error(guard.message);
      return;
    }
    const when = new Date(input);
    const tokenExpiry = getTokenExpiry(publishChannel!);
    const scheduled = await handleConfirmCalendar({ date: input.split("T")[0], scheduleAt: when });
    if (scheduled && tokenExpiresBeforeSchedule(tokenExpiry, when)) {
      // Programmé, mais le jeton OAuth sera expiré à l'heure dite → prévenir MAINTENANT
      // plutôt que laisser la publication échouer en silence (même garde que le calendrier).
      toast.warning("Programmé : mais reconnecte ton compte d'ici là ⚠️", {
        duration: 12000,
        description: `Ta connexion ${reseau} expire le ${new Date(tokenExpiry!).toLocaleDateString("fr-FR")}, avant la date choisie. Sans reconnexion, la publication échouera.`,
        action: { label: "Reconnecter", onClick: () => versConnexions(navigate) },
      });
    }
  };

  const handleExportPptx = async () => {
    if (!result?.raw?.slides) return;
    try {
      const { exportCarouselPptx } = await import("@/lib/export-carousel-pptx");
      const { resolvePhotoIndexes } = await import("@/lib/resolve-photo-index");
      const photosForExport = uploadedPhotos.length > 0 ? uploadedPhotos : undefined;
      // Filet déterministe : évite "une seule photo sur tous les slides" si l'IA a mal
      // (ou pas) renseigné photo_index. Couvre aussi les carrousels déjà sauvegardés.
      // « Mes slides » : association photo↔slide choisie par l'utilisatrice → pas de filet.
      const normalizedSlides = carouselSubMode === "user_slides"
        ? result.raw.slides
        : resolvePhotoIndexes(result.raw.slides, photosForExport?.length ?? 0);
      await exportCarouselPptx(
        normalizedSlides as any,
        ideaText || "carrousel",
        visualSlides.length > 0 ? visualSlides : undefined,
        charterData,
        photosForExport,
      );
      toast.success("PPTX éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportVisualPng = async () => {
    if (visualSlides.length === 0) return;
    if (isCarouselPublish && carouselVisualsStale) {
      toast.warning("Les visuels ne reflètent pas tes dernières éditions. Mets-les à jour pour un export fidèle.");
    }
    try {
      toast.info("Export PNG en cours…");
      const { exportCarouselPng } = await import("@/lib/export-carousel-png");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      const res = await exportCarouselPng(visualSlides, ideaText || "carrousel", logoUrl);
      if (res.failed.length > 0) {
        // Avant : slides ratées supprimées du ZIP en silence. On le dit.
        toast.warning(
          `${res.exported}/${res.total} slides exportées. La slide ${res.failed.join(", ")} n'a pas pu être rendue — régénère les visuels puis réessaie.`,
        );
      } else {
        toast.success(visualSlides.length > 1 ? "ZIP des images téléchargé !" : "PNG téléchargé !");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportHybridPptx = async () => {
    if (visualSlides.length === 0) return;
    if (isCarouselPublish && carouselVisualsStale) {
      toast.warning("Les visuels ne reflètent pas tes dernières éditions. Mets-les à jour pour un export fidèle.");
    }
    try {
      toast.info("Export PowerPoint éditable en cours…");
      const { exportCarouselHybridPptx } = await import("@/lib/export-carousel-hybrid-pptx");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      await exportCarouselHybridPptx(
        visualSlides,
        result?.raw?.slides || null,
        charterData || null,
        ideaText || "carrousel-editable",
        pickNonEmpty(generatedWithPhotos, uploadedPhotos),
        logoUrl,
      );
      toast.success("PowerPoint éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  // Pont Canva : exporte le carrousel en PPTX hybride, le dépose côté serveur
  // (edge `social-canva-import`), l'importe dans le Canva connecté et ouvre
  // l'URL d'édition. Logique partagée avec le calendrier via `useOpenInCanva`.
  const { openInCanva, openingCanva } = useOpenInCanva();
  const handleOpenInCanva = () => {
    if (visualSlides.length === 0) return;
    return openInCanva(
      async (onProgress) => {
        const { exportCarouselHybridPptx } = await import("@/lib/export-carousel-hybrid-pptx");
        const { getIncludeLogoPref } = await import("@/lib/export-logo");
        const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
        return (await exportCarouselHybridPptx(
          visualSlides,
          result?.raw?.slides || null,
          charterData || null,
          ideaText || "carrousel",
          pickNonEmpty(generatedWithPhotos, uploadedPhotos),
          logoUrl,
          { returnBlob: true, onProgress },
        )) as Blob;
      },
      ideaText || "Carrousel Nowadays",
      { etapes: visualSlides.length },
    );
  };

  const handleExportPinterestPng = async () => {
    if (!pinterestPinHtml) return;
    try {
      toast.info("Export PNG en cours...");
      const { exportPinterestVisualPng } = await import("@/lib/export-pinterest-visual-pptx");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      await exportPinterestVisualPng(pinterestPinHtml, ideaText || "epingle-pinterest", logoUrl);
      toast.success("PNG téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportPhotoBriefPng = async () => {
    if (!photoBriefOverlayHtml) return;
    try {
      toast.info("Export PNG en cours...");
      const { exportPinterestVisualPng } = await import("@/lib/export-pinterest-visual-pptx");
      const { getIncludeLogoPref } = await import("@/lib/export-logo");
      const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
      await exportPinterestVisualPng(photoBriefOverlayHtml, ideaText || "overlay-pinterest", logoUrl);
      toast.success("PNG téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportPinterestEditablePptx = async () => {
    const pinData = result?.raw?.pin_data;
    if (!pinData) {
      toast.error("Données structurées non disponibles. Utilise l'export PNG ou PPTX image.");
      return;
    }
    try {
      toast.info("Export PPTX éditable en cours...");
      const { exportPinterestEditablePptx } = await import("@/lib/export-pinterest-editable-pptx");
      await exportPinterestEditablePptx(
        pinData,
        result?.raw?.title || "",
        result?.raw?.description || "",
        ideaText || "epingle-pinterest",
        charterData
      );
      toast.success("PPTX éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  // ── Launch sequence (5 chapters) ──

  const handleLaunchSequence = async (format: string, angle: string) => {
    if (launchGenerating) return; // garde anti double-clic (chaque chapitre est facturé)
    const structureId = getStructureForCombo(format, angle);
    const structure = CONTENT_STRUCTURES[structureId];
    if (!structure) return;

    setLaunchGenerating(true);
    setLaunchResults([]);
    const chapters = 5;
    const results: any[] = [];

    try {
      for (let i = 0; i < chapters; i++) {
        setLaunchIndex(i);
        const chapterSubject = `${ideaText} — Chapitre ${i + 1}/${chapters}`;
        const res = await generate({
          format: format as any,
          subject: chapterSubject,
          objective: objective || undefined,
          editorialAngle: angle,
        });
        results.push(res);
      }
      setLaunchResults(results);
    } catch (e: any) {
      // Sans ce filet, une erreur au chapitre N laissait le spinner tourner à l'infini.
      if (results.length > 0) setLaunchResults(results); // garde les chapitres déjà générés
      toast.error(e?.message || "Erreur pendant la génération de la séquence. Réessaie.");
    } finally {
      setLaunchGenerating(false);
    }
  };

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

  const isLaunchMode = editorialAngle === "lancement" && step === "result";

  // Demo mode: replace action handlers with toast notifications
  const demoToast = () => toast("Cette action est disponible dans l'outil complet. Crée ton compte gratuit !");
  const effectiveHandleSave = isDemoMode ? demoToast : handleSave;
  const effectiveHandleAddToCalendar = isDemoMode ? demoToast : handleAddToCalendar;
  const effectiveHandleExportPptx = isDemoMode ? demoToast : handleExportPptx;
  const effectiveHandleExportVisualPng = isDemoMode ? demoToast : handleExportVisualPng;
  const effectiveHandleExportHybridPptx = isDemoMode ? demoToast : handleExportHybridPptx;

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
        <BrandReviewGate />
      </div>
    );
  }
  // À partir d'ici le flux de création est affiché : verrouillé pour la durée
  // de vie du composant (cf. commentaire à la déclaration de flowShownRef).
  flowShownRef.current = true;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {conflictPending && draftConflict && (
        <DraftConflictDialog
          open
          draft={draftConflict.draft}
          newSubject={draftConflict.newSubject}
          onResume={() => {
            // On repart proprement du brouillon persisté : rechargement sans
            // location.state ni paramètres de démarrage.
            window.location.replace(location.pathname);
          }}
          onStartNew={() => {
            clearFlowState();
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



      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
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
        {/* Levier A : sur le 1er contenu (auto=1, juste après le diagnostic), on masque
            la bannière « remplis ton identité de marque » — contradictoire avec le diagnostic
            qu'on vient de finir. Elle reste sur les créations suivantes. */}
        {!autoFlow && <BrandingStatusBanner />}

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
              // Allow jumping back only — never forward
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
                onStepClick={handleStepClick}
                rightSlot={credits}
                verbOverride={autoFlow && stepperKey === "brief" ? "Ton premier contenu" : undefined}
              />
            );
          })()}

            {/* Steps */}
            {step === "idea" && (
              <>
                <LowCreditsBanner remaining={remainingWithBonus()} plan={plan} />
                <CreerStepIdea onNext={handleIdeaNext} onCoachingSelect={handleCoachingSelect} onNewsjackingSelect={handleNewsjackingSelect} onPhotosNext={handlePhotosNext} workspaceId={workspaceId} initialIdea={ideaText} autoOpenTransform={autoOpenTransform} initialPhotos={uploadedPhotos.length > 0 ? uploadedPhotos : undefined} initialPhotoDescription={photoDescription || undefined} initialPhotoSubject={ideaText || undefined} />
              </>
            )}

            <Suspense fallback={<div className="py-12 flex justify-center"><Spinner className="h-8 w-8" /></div>}>
            {step === "format" && (
              <CreerStepFormat
                idea={ideaText}
                objective={objective || undefined}
                forcedChannel={forcedChannel}
                initialFormat={selectedFormat || undefined}
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
                  handleFormatNext(fmt, angle, { carouselSubMode: sub, photos, photoDescription: desc, photoMode: pm, linkedinCarousel: !!linkedinCar, photoDump, textFirstMix, slideLength: slideLen });
                }}
                onSelectionChange={({ format, carouselSubMode: sub }) => {
                  // Persiste les choix en cours pour les restaurer au reload (avant « Suivant »).
                  setSelectedFormat((prev) => (prev === format ? prev : format));
                  setCarouselSubMode((prev) => (prev === sub ? prev : sub));
                }}
                onBack={() => { setStep("idea"); setNewsjackingContext(null); }}
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
                autoFirstContent={autoFlow}
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
                  <p className="text-sm font-medium text-foreground">Je compose ta séquence photo dump…</p>
                  <p className="text-xs text-muted-foreground">Tes vraies photos d'abord, l'IA pour le reste.</p>
                </div>
              )
            )}

            {step === "result" && structureLoading && (
              <CarouselStructureLoader hasPhotos={uploadedPhotos.length > 0} />
            )}

            {step === "result" && !isLaunchMode && !generating && !demoGenerating && !streaming && !pinterestVisualGenerating && !structureLoading && !photoDumpResolving && !result && (
              <div className="py-12 text-center space-y-4 animate-fade-in">
                {/* Quota épuisé pendant la génération : dire la vérité (les crédits),
                    pas « Session expirée » — et pas de Réessayer qui ne peut que re-échouer. */}
                {quotaExhausted ? (
                  <p className="text-sm font-medium text-foreground">{quotaExhausted}</p>
                ) : error ? (
                  <p className="text-destructive font-medium">{error}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Session expirée ou contenu indisponible.</p>
                )}
                <div className="flex gap-3 justify-center">
                  {quotaExhausted ? (
                    <button
                      onClick={() => navigate("/pricing")}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
                    >
                      Voir les plans →
                    </button>
                  ) : (
                    <button
                      onClick={handleRegenerate}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
                    >
                      <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Réessayer
                    </button>
                  )}
                  <button
                    onClick={requestReset}
                    className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition"
                  >
                    ← Recommencer
                  </button>
                </div>
              </div>
            )}

            {step === "result" && !isLaunchMode && (generating || demoGenerating || streaming || pinterestVisualGenerating || result) && (
              <CreerStepResult
                result={result?.raw || result}
                format={selectedFormat || "post"}
                generating={generating || demoGenerating || streaming || pinterestVisualGenerating}
                generationStage={generationStage || streamStage}
                streamingContent={streaming ? streamingContent : undefined}
                step2of2={selectedFormat === "carousel" && !!lastConfirmedStructure && (carouselSubMode === "photo" || carouselSubMode === "mix")}
                qualityMax={qualityMax}
                photos={(carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo" || carouselSubMode === "user_slides" || (photoMode && uploadedPhotos.length > 0)) ? uploadedPhotos : undefined}
                usedPhotoCount={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos.length : undefined}
                onEdit={handleEdit}
                onReset={requestReset}
                onRegenerate={handleRegenerate}
                onCopy={handleCopy}
                onSave={effectiveHandleSave}
                onReelMp4Change={setReelMp4Url}
                onPublishOrSchedule={effectiveHandleAddToCalendar}
                publishOrScheduleLabel={fromCalendar ? "Sauvegarder dans le calendrier" : undefined}
                onGenerateVisuals={selectedFormat === "carousel" ? handleGenerateVisuals : undefined}
                visualLoading={visualLoading}
                visualsAutoError={visualsAutoError}
                visualChunkProgress={visualChunkProgress}
                visualSlides={visualSlides.length > 0 ? visualSlides : undefined}
                onVisualSlidesUpdate={setVisualSlides}
                onExportPptx={selectedFormat === "carousel" ? effectiveHandleExportPptx : undefined}
                onExportVisualPng={selectedFormat === "carousel" && visualSlides.length > 0 ? effectiveHandleExportVisualPng : undefined}
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
                    const nextRaw = { ...prev.raw, slides };
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
                  if (result?.raw) {
                    if (result.raw.stories) result.raw.stories = stories;
                    else if (result.raw.sequences) result.raw.sequences = stories;
                    else if (result.raw.slides) result.raw.slides = stories;
                  }
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

            {/* Transform LinkedIn text to carousel */}
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
              <div className="space-y-4 animate-fade-in">
                {launchGenerating ? (
                  <div className="py-12 text-center space-y-3">
                    <Spinner className="h-8 w-8 mx-auto" />
                    <p className="text-sm font-medium text-foreground">
                      Génération du chapitre {launchIndex + 1}/5…
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ce format génère une séquence de 5 posts (un par chapitre).
                    </p>
                  </div>
                ) : (
                  <Tabs defaultValue="0">
                    <TabsList className="w-full flex-wrap h-auto gap-1">
                      {launchResults.map((_, i) => (
                        <TabsTrigger key={i} value={String(i)} className="text-xs">
                          Chapitre {i + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {launchResults.map((res, i) => (
                      <TabsContent key={i} value={String(i)}>
                        <CreerStepResult
                          result={res?.raw || res}
                          format={selectedFormat || "post"}
                          generating={false}
                          onEdit={handleEdit}
                          onReset={requestReset}
                          onRegenerate={handleRegenerate}
                          onCopy={handleCopy}
                          usedPhotoCount={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos.length : undefined}
                          photos={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
                          sourceIdea={ideaText}
                          sourceObjective={objective}
                          sourceAngle={editorialAngle}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </div>
            )}

            {step === "edit" && (
              <CreerStepEdit
                content={editContent}
                format={selectedFormat || "post"}
                onSave={(edited) => {
                  setEditContent(edited);
                  // Persiste le texte édité DANS le résultat (auto-scopé : remplacé à chaque
                  // nouvelle génération). Les chemins de sauvegarde (calendrier/idées) le
                  // préfèrent à la version IA d'origine — sinon l'édition était perdue.
                  setResult((prev) => (prev ? { ...prev, raw: { ...(prev.raw || {}), edited_text: edited } } : prev));
                  toast.success("Contenu sauvegardé !");
                }}
                onBack={() => setStep("result")}
                onCopy={() => {
                  navigator.clipboard.writeText(editContent);
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
            : null
        }
        channelConnected={publishChannel ? isSocialConnected(publishChannel) : false}
        onConnectChannel={handleConnectFromDialog}
        connectingChannel={connectingPublishChannel}
        publishing={publishingInstagram || publishingLinkedIn}
        onPublishNow={handlePublishNowFromDialog}
        scheduling={savingToCalendar}
        onSchedule={handleScheduleFromDialog}
        onDraft={(d) => handleConfirmCalendar({ date: d })}
        defaultDraftDate={paramCalendarDate || undefined}
        theme={ideaText}
        canal={publishChannel || "instagram"}
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

      {/* Dialog "photos manquantes" : remplace le downgrade silencieux des
          carrousels mix/photo générés sans photos uploadées (cas typique :
          entrée par le coaching, qui ne propose pas d'upload). */}
      <AlertDialog
        open={photoMissingDialog.open}
        onOpenChange={(open) => {
          if (!open) setPhotoMissingDialog({ open: false, rawType: null });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ce carrousel gagnerait à avoir des photos</AlertDialogTitle>
            <AlertDialogDescription>
              L'IA a structuré un carrousel{" "}
              <strong>{photoMissingDialog.rawType === "mix" ? "mixte (texte + photos)" : "photo"}</strong>,
              mais aucune photo n'a été uploadée. Tu peux en ajouter maintenant
              ou continuer en mode texte uniquement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel
              onClick={() => setPhotoMissingDialog({ open: false, rawType: null })}
            >
              Annuler
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                // Continuer en texte : relance la génération avec forceText.
                setPhotoMissingDialog({ open: false, rawType: null });
                handleGenerateVisuals({ forceText: true });
              }}
            >
              Continuer en texte
            </Button>
            <AlertDialogAction
              onClick={() => {
                // Ajouter des photos : retour à l'étape format, on force le
                // sub-mode mix pour exposer la zone d'upload. Le contexte
                // (sujet, angle, réponses, format) est préservé.
                setCarouselSubMode("mix");
                setPhotoMissingDialog({ open: false, rawType: null });
                setStep("format");
              }}
            >
              Ajouter des photos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Garde anti-perte : confirmation avant "Nouveau contenu" quand un
          travail est en cours (texte généré et/ou photos uploadées). Évite
          d'effacer photos + contenu par un clic réflexe. */}
      <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repartir de zéro ?</AlertDialogTitle>
            <AlertDialogDescription>
              {uploadedPhotos.length > 0 ? (
                <>
                  Tu as un contenu en cours avec{" "}
                  <strong>
                    {uploadedPhotos.length} photo{uploadedPhotos.length > 1 ? "s" : ""}
                  </strong>
                  . « Nouveau contenu » efface le texte généré et retire les
                  photos. Cette action est irréversible.
                </>
              ) : (
                <>
                  Tu as un contenu en cours. « Nouveau contenu » efface le texte
                  généré et repart d'une page blanche. Cette action est
                  irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setConfirmResetOpen(false)}>
              Garder mon contenu
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmResetOpen(false);
                handleReset();
              }}
            >
              Repartir de zéro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SaveToIdeasDialog
        open={saveIdeaDialogOpen}
        onOpenChange={setSaveIdeaDialogOpen}
        contentType={mapFormatToContentType(selectedFormat)}
        subject={ideaText}
        contentData={result?.raw}
        sourceModule="creer"
        format={selectedFormat || undefined}
        objectif={objective || undefined}
        visualSlides={selectedFormat === "carousel" && visualSlides.length > 0 ? visualSlides : undefined}
        onUploadVisuals={selectedFormat === "carousel" ? uploadVisualsToStorage : undefined}
        editingIdeaId={editingIdeaId}
      />
    </div>
  );
}
