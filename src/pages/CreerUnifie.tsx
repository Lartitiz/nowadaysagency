import { useState, useEffect, useCallback, useRef } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarDays, Palette } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import BrandingStatusBanner from "@/components/content/BrandingStatusBanner";
import CreerStepIdea from "@/components/creer/CreerStepIdea";
import CreerStepFormat from "@/components/creer/CreerStepFormat";
import CreerStepQuestions from "@/components/creer/CreerStepQuestions";
import CreerStepResult from "@/components/creer/CreerStepResult";
import CreerStepEdit from "@/components/creer/CreerStepEdit";
import CreerStepper, { type StepperKey } from "@/components/creer/CreerStepper";
import PinterestInspirationStep from "@/components/creer/PinterestInspirationStep";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";
import StructureReviewStep from "@/components/creer/StructureReviewStep";
import type { SlideProposal, StructureProposal } from "@/components/creer/StructureReviewStep";

import { useContentGenerator } from "@/hooks/use-content-generator";
import { normalizeFormat } from "@/lib/format-normalizer";
import { CONTENT_STRUCTURES, EDITORIAL_ANGLES, LINKEDIN_EDITORIAL_ANGLES, PINTEREST_EDITORIAL_ANGLES, PINTEREST_VISUAL_ANGLES, getStructureForCombo } from "@/lib/content-structures";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
// DEMO_DATA n'est plus importé directement — on utilise demoData du context
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useBrandCharter } from "@/hooks/use-branding";
import { useActivityExamples } from "@/hooks/use-activity-examples";
import { supabase } from "@/integrations/supabase/client";
import { loadFlowState, saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import { isAurianaDemoEmail, AURIANA_DEMO_SUBJECT, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";
import { useFormPersist } from "@/hooks/use-form-persist";
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
    <div className="mb-4 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0">✨</span>
        <p className="text-sm text-orange-800">
          <span className="font-medium">Plus que {remaining} crédit{remaining > 1 ? "s" : ""}</span> ce mois-ci.
          {" "}Utilise-les pour ce qui compte le plus pour toi.
        </p>
      </div>
      <a
        href="/mon-plan"
        onClick={() => posthog.capture("low_credits_banner_cta_clicked", { remaining, plan })}
        className="shrink-0 text-xs font-medium text-orange-600 hover:text-orange-800 underline underline-offset-2 transition-colors"
      >
        Découvrir le Premium
      </a>
    </div>
  );
}

type Step = "idea" | "format" | "questions" | "structure_review" | "inspiration_proposals" | "result" | "edit";


export default function CreerUnifie() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const workspaceId = useWorkspaceId();
  const { data: charterData } = useBrandCharter();
  const { activityText } = useActivityExamples();
  const { remainingTotal, loading: planLoading, plan, usage } = useUserPlan();

  // URL params
  const paramFormat = searchParams.get("format");
  const paramSujet = searchParams.get("sujet") || searchParams.get("subject") || "";
  const paramObjectif = searchParams.get("objectif") || searchParams.get("objective") || "";
  const paramMode = searchParams.get("mode");
  const paramFrom = searchParams.get("from");
  const paramAngle = searchParams.get("angle");

  // Location state (from calendar, etc.)
  const locState = (location.state as any) || {};

  // Check if we have URL params that should override persisted state
  const paramCanal = searchParams.get("canal");
  const hasUrlParams = !!(paramFormat || paramCanal || paramSujet || paramObjectif || locState.fromCalendar);

  // Restore persisted state if:
  // 1. We have URL params / location state (coming back from calendar, etc.)
  // 2. OR there is a recent session in storage (survives HMR / tab refresh)
  const hasSomeContext = hasUrlParams || !!location.state;
  const existingFlowState = loadFlowState();
  const aurianaDemoActive = locState?.demoScenario === "auriana-carousel" || existingFlowState?.demoScenario === "auriana-carousel";
  const shouldRestore = hasSomeContext || aurianaDemoActive || (existingFlowState !== null && existingFlowState.step !== "idea");
  const persistedState = useRef(shouldRestore ? (existingFlowState || null) : null);

  // Core state — restore from sessionStorage if available
  const ps = persistedState.current;
  const autoOpenTransform = paramMode === "transform";
  // Restore step — allow "result" and "edit" if their data is available
  const safeStep = (() => {
    if (!ps?.step) return "idea";
    if (ps.step === "result" && ps.result) return "result";
    if (ps.step === "edit" && ps.editContent) return "edit";
    if (["result", "edit", "inspiration_proposals", "structure_review"].includes(ps.step)) return "idea";
    return ps.step as Step;
  })();
  const [step, setStep] = useState<Step>(safeStep);
  
  const [ideaText, setIdeaText] = useState(ps?.ideaText || paramSujet || locState.sujet || locState.subject || "");
  const [objective, setObjective] = useState<string | null>(
    ps?.objective || paramObjectif || locState.objectif || locState.objective || null
  );
  const [selectedFormat, setSelectedFormat] = useState<string | null>(ps?.selectedFormat || paramFormat || null);
  const [editorialAngle, setEditorialAngle] = useState<string | null>(ps?.editorialAngle || null);
  const [answers, setAnswers] = useState<Record<string, string>>(ps?.answers || {});
  const [editContent, setEditContent] = useState(ps?.editContent || "");
  const [existingCalendarContent, setExistingCalendarContent] = useState<string | null>(null);
  const [calendarPostId] = useState<string | null>(locState?.calendarPostId || null);
  const [calendarPostDate] = useState<string | null>(locState?.postDate || null);
  const fromCalendar = !!(locState?.fromCalendar && calendarPostId);

  // Photo states (carousel photo + post photo)
  const [carouselSubMode, setCarouselSubMode] = useState<"text" | "photo" | "mix" | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<any[]>([]);
  // Snapshot des photos au moment de la génération du carrousel.
  // Sert de source de vérité pour handleGenerateVisuals si le state UI est reset.
  const [generatedWithPhotos, setGeneratedWithPhotos] = useState<any[]>([]);
  // Dialog "photos manquantes" : remplace le downgrade silencieux.
  const [photoMissingDialog, setPhotoMissingDialog] = useState<{
    open: boolean;
    rawType: "photo" | "mix" | null;
  }>({ open: false, rawType: null });
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoMode, setPhotoMode] = useState(false);
  const [demoGenerating, setDemoGenerating] = useState(false);
  const [pinterestData, setPinterestData] = useState<{ link?: string; boardId?: string; boardName?: string } | null>(null);
  const [isLinkedInCarousel, setIsLinkedInCarousel] = useState(false);
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
  const [briefsCount, setBriefsCount] = useState(0);
  const [photoBriefOverlayHtml, setPhotoBriefOverlayHtml] = useState<string | null>(null);
  const [structureProposal, setStructureProposal] = useState<StructureProposal | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [lastConfirmedStructure, setLastConfirmedStructure] = useState<SlideProposal[] | null>(null);
  const [newsjackingContext, setNewsjackingContext] = useState<string | null>(null);
  const [newsjackingSuggestedFormat, setNewsjackingSuggestedFormat] = useState<string | null>(null);

  const { restored: draftRestored, clearDraft } = useFormPersist(
    "creer-unifie-form",
    { step, ideaText, objective, selectedFormat, editorialAngle, answers },
    (saved) => {
      if (!shouldRestore) return; // Fresh navigation — don't restore
      if (searchParams.get("format") || searchParams.get("sujet")) return;
      if (saved.step && saved.step !== "idea") setStep(saved.step as Step);
      if (saved.ideaText) setIdeaText(saved.ideaText);
      if (saved.objective) setObjective(saved.objective);
      if (saved.selectedFormat) setSelectedFormat(saved.selectedFormat);
      if (saved.editorialAngle) setEditorialAngle(saved.editorialAngle);
      if (saved.answers && Object.keys(saved.answers).length) setAnswers(saved.answers);
    }
  );

  // When arriving at /creer without params AND no persisted in-progress flow, clear state
  // This distinguishes "fresh sidebar click" from "page reload mid-flow"
  useEffect(() => {
    if (!hasSomeContext && !shouldRestore) {
      clearFlowState();
      clearDraft();
      sessionStorage.removeItem("creer_unifie_result");
      setStep("idea");
      setSelectedFormat(null);
      setEditorialAngle(null);
      setIdeaText("");
      setObjective(null);
      setAnswers({});
      setEditContent("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If canal param is set, pre-select the format
  useEffect(() => {
    if (paramCanal && !selectedFormat) {
      if (paramCanal === "linkedin" || paramCanal === "pinterest" || paramCanal === "newsletter") {
        setSelectedFormat(paramCanal);
      }
    }
  }, [paramCanal]);

  // Charger le nombre de briefs existants quand on arrive sur les questions
  useEffect(() => {
    if (step !== "questions" || !session?.user?.id) return;
    supabase.from("content_briefs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .then(({ count }: any) => setBriefsCount(count || 0));
  }, [step, session?.user?.id]);

  const [launchResults, setLaunchResults] = useState<any[]>([]);
  const [launchIndex, setLaunchIndex] = useState(0);
  const [launchGenerating, setLaunchGenerating] = useState(false);

  // Post-generation states
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(ps?.savedId || null);
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState("");
  const [savingToCalendar, setSavingToCalendar] = useState(false);

  // Visual states (carousel only)
  const [visualSlides, setVisualSlides] = useState<{ slide_number: number; html: string }[]>(ps?.visualSlides || []);
  const [visualLoading, setVisualLoading] = useState(false);
  

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
      if (saved.visualSlides?.length) setVisualSlides(saved.visualSlides);
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
    result,
    setResult,
    error,
    reset: resetGenerator,
    generateQuestions,
    generateFollowUp,
    loadingQuestions,
    questions,
    setQuestions,
    generateStream,
    streamingContent,
    streaming,
    streamDone,
    streamError,
    streamReset,
  } = useContentGenerator();

  // Restore result from persisted state
  useEffect(() => {
    if (ps?.result && !result) {
      setResult(ps.result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn if AI forgot the carousel caption
  const warnedCaptionRef = useRef<any>(null);
  useEffect(() => {
    if (selectedFormat !== "carousel") return;
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
    setCarouselSubMode((demo.carousel_type as "text" | "photo" | "mix") || "text");
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
      });
    }
  }, [step, ideaText, objective, selectedFormat, editorialAngle, editContent, result, visualSlides?.length, savedId, questions, inspirationAnalysis, inspirationProposals, inspirationImagePreview]);

  // Pre-fill from URL/state & auto-advance (only when URL params are present)
  const initDone = useRef(false);
  useEffect(() => {
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
    if (obj) setObjective(obj);
    if (locState?.existingContent) setExistingCalendarContent(locState.existingContent);

    // Newsjacking context arriving from "Créer depuis cette actu" (IdeaDetailSheet)
    // — preserves the actu block so the generated content stays a real newsjacking.
    if (locState?.context && typeof locState.context === "string" && locState.context.trim()) {
      setNewsjackingContext(locState.context.trim().slice(0, 3800));
    }

    const fmtRaw = paramFormat || locState?.format;
    const paramCarouselSubMode = searchParams.get("carouselSubMode") as "text" | "photo" | "mix" | null;

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
      if ((fmt === "carousel" || fmt === "post") && !locState?.fromCalendar && !paramAngle) {
        setStep("format");
      } else {
        handleFormatNext(fmt, calendarAngle, { overrideSubject: enrichedSubject });
      }
    } else if (locState?.fromCalendar && subject) {
      // Calendar fallback path (already handled above with FORMAT_MAP)
      if (locState.angle) setEditorialAngle(locState.angle);
      setStep("format");
    } else if (fmt || (fmtRaw && subject.trim())) {
      // Format inconnu/non-supporté mais sujet présent → laisser choisir le format
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Show error
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // Snapshot défensif : sync uploadedPhotos -> generatedWithPhotos dès qu'on a
  // des photos. Évite la perte si le state UI est reset entre l'upload et la
  // génération du visuel (changement d'onglet, re-render, etc.).
  useEffect(() => {
    if (uploadedPhotos.length > 0) {
      setGeneratedWithPhotos((prev) => (prev.length === uploadedPhotos.length ? prev : uploadedPhotos));
    }
  }, [uploadedPhotos]);

  // ── Step handlers ──

  const handleCoachingSelect = useCallback((data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" | "mix" }) => {
    setAnswers({});
    setEditorialAngle(null);
    setEditContent("");
    setLaunchResults([]);

    setIdeaText(data.subject);
    if (data.objective) setObjective(data.objective);

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

    // Coaching dialog already handles sub-mode choice, go directly to questions
    setStep("questions");
    generateQuestions({
      format: safeFormat,
      subject: data.subject,
      editorialAngle: undefined,
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
    setPhotoDescription(description);
    if (subject && subject.trim()) {
      setIdeaText(subject.trim());
    }
    setNewsjackingContext(null);
    setNewsjackingSuggestedFormat(null);
    setSelectedFormat(null);
    setEditorialAngle(null);
    setCarouselSubMode(null);
    setPhotoMode(false);
    setPinterestData(null);
    setStep("format");
  };

  const handleFormatNext = async (format: string, angle?: string, options?: { carouselSubMode?: "text" | "photo" | "mix"; photos?: any[]; photoDescription?: string; photoMode?: boolean; overrideSubject?: string; linkedinCarousel?: boolean }) => {
    const { carouselSubMode: sub, photos, photoDescription: desc, photoMode: pm, overrideSubject, linkedinCarousel: linkedinCarLocal } = options || {};

    // Auriana demo account: let the flow continue through all steps (no bypass)

    // Demo mode: si le sujet correspond au pré-fill, afficher instantanément le résultat pré-généré.
    // Sinon, laisser le flow normal continuer vers la vraie génération IA.
    if (isDemoMode) {
      const demo = (demoData as any)?.carousel_photo_demo;
      const isPrefilledSubject = demo && ideaText === demo.subject;
      if (isPrefilledSubject && demo?.result) {
        setSelectedFormat(format);
        setEditorialAngle(angle || null);
        if (sub) setCarouselSubMode(sub);
        if (photos) setUploadedPhotos(photos);
        if (desc) setPhotoDescription(desc);
        if (pm !== undefined) setPhotoMode(pm);
        setStep("result");
        setDemoGenerating(true);
        setTimeout(() => {
          setResult({ type: "carousel", raw: demo.result, ...demo.result });
          setDemoGenerating(false);
        }, 2500);
        return;
      }
      // Sinon : ne PAS return, laisser le flow normal continuer (vraie génération IA)
    }

    setSelectedFormat(format);
    setEditorialAngle(angle || null);
    if (format !== "pinterest") setPinterestData(null);
    if (sub) setCarouselSubMode(sub);
    if (photos) setUploadedPhotos(photos);
    if (desc) setPhotoDescription(desc);
    if (pm !== undefined) setPhotoMode(pm);

    // Pinterest Inspiration: store image and trigger analysis instead of questions
    if (format === "pinterest_inspiration" && photos && photos.length > 0) {
      const imgBase64 = photos[0].base64;
      if (!imgBase64) {
        toast.error("Image invalide. Réessaie avec une autre capture d'écran.");
        return;
      }
      // Validate image size — cap at ~4MB base64 (≈3MB raw) for reliable API processing
      const base64Size = imgBase64.length;
      if (base64Size > 5_500_000) {
        toast.error("Image trop lourde. Essaie avec une capture d'écran plus petite ou recadrée.");
        return;
      }
      setInspirationImageBase64(imgBase64);
      setInspirationImagePreview(photos[0].preview || photos[0].base64 || null);
      // Launch analysis
      setStep("inspiration_proposals");
      setInspirationAnalysis(null);
      setInspirationProposals([]);
      setInspirationLoading(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-inspiration", {
          body: {
            image_base64: imgBase64,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 180000); // 180s — Claude Opus + vision is slow
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const analysis = data?.result?.analysis || null;
        const proposals = data?.result?.proposals || [];
        if (!analysis && proposals.length === 0) {
          throw new Error("L'IA n'a pas pu analyser cette image. Essaie avec une capture plus nette.");
        }
        setInspirationAnalysis(analysis);
        setInspirationProposals(proposals);
      } catch (e: any) {
        if (handleQuotaError(e)) { setStep("format"); return; }
        const msg = e?.message || "Erreur lors de l'analyse";
        const isTimeout = msg.includes("timeout") || msg.includes("Timeout") || msg.includes("dépassé");
        toast.error(isTimeout
          ? "L'analyse a pris trop de temps. Essaie avec une image plus légère ou réessaie."
          : msg
        );
        setStep("format");
      } finally {
        setInspirationLoading(false);
      }
      return;
    }

    const subjectToUse = overrideSubject || ideaText;
    const enrichedSubject = existingCalendarContent
      ? subjectToUse + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : subjectToUse;

    if (angle === "lancement") {
      setStep("result");
      await handleLaunchSequence(format, angle);
      return;
    }

    resetGenerator();
    setStep("questions");

    // Auriana demo: inject pre-built questions ONLY if user follows the scripted scenario
    // (carrousel texte, sujet pré-rempli, aucune photo). Sinon → vraie génération IA.
    const isAurianaScript = aurianaDemoActive
      && ideaText === AURIANA_DEMO_SUBJECT
      && (sub || carouselSubMode) === "text"
      && (!photos || photos.length === 0)
      && uploadedPhotos.length === 0;
    if (isAurianaScript) {
      setQuestions(AURIANA_DEMO_FLOW.questions);
      return;
    }

    const photosForQuestions = (photos && photos.length > 0 ? photos : uploadedPhotos);
    const descForQuestions = desc || photoDescription;
    const subModeForQuestions = sub || carouselSubMode;
    const photoModeForQuestions = pm !== undefined ? pm : photoMode;

    // Fallback subject: si l'utilisateur n'a pas tapé de sujet (flow photo),
    // on injecte la description ou un placeholder pour ne jamais envoyer "" à l'IA.
    const safeSubject = enrichedSubject?.trim()
      ? enrichedSubject
      : (descForQuestions?.trim()
          || (photosForQuestions && photosForQuestions.length > 0
                ? "Carrousel basé sur les photos uploadées"
                : ""));

    // Channel: calculé depuis les arguments locaux (pas le state, qui n'est pas
    // encore commit après setSelectedFormat / setIsLinkedInCarousel).
    const channelForQuestions = (format === "linkedin" || linkedinCarLocal || isLinkedInCarousel)
      ? "linkedin"
      : undefined;

    await generateQuestions({
      format,
      subject: safeSubject,
      editorialAngle: angle,
      objective: objective || undefined,
      channel: channelForQuestions,
      photos: photosForQuestions && photosForQuestions.length > 0
        ? photosForQuestions.map((p: any) => ({ base64: p.base64, context: p.context, mimeType: p.mimeType }))
        : undefined,
      photoDescription: descForQuestions || undefined,
      carouselSubMode: subModeForQuestions || undefined,
      photoMode: photoModeForQuestions || undefined,
      newsContext: newsjackingContext || undefined,
    });
  };

  const handleQuestionsNext = async (ans: Record<string, string>) => {
    setAnswers(ans);

    // Sauvegarder le brief en base pour les futures créations
    // ⚠️ On n'enregistre PAS les briefs sans sujet : ils polluent l'historique
    // récent envoyé à l'IA et provoquent des questions hors-sujet.
    if (session?.user?.id && Object.keys(ans).length > 0 && ideaText.trim().length > 0) {
      try {
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
      } catch (e) {
        console.error("[CreerUnifie] Failed to save content brief:", e);
      }
    }

    // On bascule TOUJOURS vers "result" pour afficher un loader pendant
    // que doGenerate tourne (pour les carrousels photo/mix, ce loader correspond
    // à l'écran "structureLoading"). Sinon l'écran questions reste figé 30-60s.
    setStep("result");
    await doGenerate(ans);
  };

  const handleSkipQuestions = async () => {
    setAnswers({});
    setStep("result");
    await doGenerate({});
  };

  const doGenerate = async (ans: Record<string, string>) => {
    if (!selectedFormat) return;

    // Auriana demo account: instant pre-built result ONLY if user followed the scripted path
    // (carrousel texte sur sujet pré-rempli, sans photos). Sinon → vraie génération IA.
    const isAurianaScript = aurianaDemoActive
      && ideaText === AURIANA_DEMO_SUBJECT
      && carouselSubMode === "text"
      && uploadedPhotos.length === 0;
    if (isAurianaScript) {
      setDemoGenerating(true);
      setStep("result");
      const { type: _t, ...demoRest } = AURIANA_DEMO_FLOW.result;
      setTimeout(() => {
        setResult({ type: "carousel" as const, raw: AURIANA_DEMO_FLOW.result, ...demoRest });
        setDemoGenerating(false);
      }, 2500);
      return;
    }

    // Demo mode: simulate generation with pre-built result
    if (isDemoMode) {
      const demo = (demoData as any)?.carousel_photo_demo;
      const isPrefilledSubject = demo && ideaText === demo.subject;

      // Si le sujet correspond au pré-fill → résultat pré-généré (rapide, zéro risque)
      if (isPrefilledSubject && demo?.result) {
        setDemoGenerating(true);
        setStep("result");
        setTimeout(() => {
          setResult({ type: "carousel", raw: demo.result, ...demo.result });
          setDemoGenerating(false);
        }, 2500);
        return;
      }

      // Si le sujet est personnalisé → laisser la génération IA se faire normalement
      // (nécessite une session Supabase active — fonctionne si l'admin est connecté en arrière-plan)
    }
    // Reset post-generation state on new generation
    setSavedId(null);
    setVisualSlides([]);
    setPinterestPinHtml(null);
    setPhotoBriefOverlayHtml(null);
    setPhotoBriefResult(null);
    let enrichedSubject = existingCalendarContent
      ? ideaText + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : ideaText;

    // Newsjacking : ne PAS injecter le bloc actu dans le subject (cap creative-flow.context = 8000).
    // Il voyage dans le champ dédié `newsContext` qui a son propre cap côté edge.

    // Formats texte : utiliser le streaming SSE
    const textFormats = ["post", "linkedin", "newsletter", "pinterest"];
    const isTextFormat = textFormats.includes(selectedFormat);

    if (isTextFormat) {
      streamReset();
      try {
        const generated = await generateStream({
          format: selectedFormat as "post" | "linkedin" | "newsletter" | "pinterest",
          subject: enrichedSubject,
          objective: objective || undefined,
          editorialAngle: editorialAngle || undefined,
          answers: ans,
          workspaceId: workspaceId !== session.user.id ? workspaceId : undefined,
          photoMode: photoMode || undefined,
          photos: photoMode && uploadedPhotos.length > 0 && uploadedPhotos[0]?.base64
            ? uploadedPhotos.slice(0, 10).map((p) => ({
                base64: p.base64,
                mimeType: (p as any).mimeType || "image/jpeg",
                context: p.context,
              }))
            : undefined,
          photoDescription: photoMode ? photoDescription : undefined,
          deepResearch: !!newsjackingContext,
          newsContext: newsjackingContext || undefined,
          pinterestLink: selectedFormat === "pinterest" ? pinterestData?.link : undefined,
          pinterestBoard: selectedFormat === "pinterest" ? pinterestData?.boardName : undefined,
        });

        // generateStream already handles quota errors silently and returns null.
        // If null + not streaming → likely an error or empty result we should surface.
        if (!generated && !streaming) {
          // Demo mode fallback parity with the previous inline behavior
          if (isDemoMode) {
            toast("La génération en direct nécessite un compte connecté. Le résultat pré-généré est disponible avec le sujet par défaut.");
            setStep("format");
            return;
          }
          toast.error(streamError || "La génération a échoué. Réessaie.");
          setStep("format");
          return;
        }
      } catch (e: any) {
        // Defensive — generateStream catches its own errors, but keep parity.
        if (e?._isQuota && handleQuotaError(e)) {
          setStep("format");
          return;
        }
        if (isDemoMode) {
          toast("La génération en direct nécessite un compte connecté. Le résultat pré-généré est disponible avec le sujet par défaut.");
          setStep("format");
          return;
        }
        toast.error(e?.message || "Erreur lors de la génération");
        return;
      }
      return;
    }

    // Épingle visuelle Pinterest : appel direct (comme carousel mais une seule slide)
    if (selectedFormat === "pinterest_visual") {
      setStep("result");
      setPinterestPinHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const pinType = chosenProposal?.pin_type || editorialAngle || "infographie";
        const { data, error: fnError } = await invokeWithTimeout("pinterest-visual", {
          body: {
            subject: enrichedSubject,
            pin_type: pinType,
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            ...(inspirationImageBase64 ? { reference_image_base64: inspirationImageBase64 } : {}),
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 120000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPinterestPinHtml(r?.pin_html || null);
        setResult({
          type: "pinterest_visual" as any,
          raw: {
            pin_html: r?.pin_html,
            title: r?.title,
            description: r?.description,
            pin_data: r?.pin_data,
          },
        });
      } catch (e: any) {
        if (!handleQuotaError(e)) toast.error(e?.message || "Erreur lors de la génération du visuel Pinterest");
      } finally {
        setPinterestVisualGenerating(false);
      }
      return;
    }

    // Brief photo Pinterest : appel direct
    if (selectedFormat === "pinterest_photo") {
      setStep("result");
      setPhotoBriefOverlayHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-photo-brief", {
          body: {
            subject: enrichedSubject,
            reference_image_base64: inspirationImageBase64 || "",
            pin_type: chosenProposal?.pin_type || "photo_lifestyle",
            brief_hint: chosenProposal?.brief || "",
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 120000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPhotoBriefOverlayHtml(r?.overlay_html || null);
        setPhotoBriefResult(r);
        setResult({
          type: "pinterest_photo" as any,
          raw: {
            overlay_html: r?.overlay_html,
            photo_brief: r?.photo_brief,
            title: r?.title,
            description: r?.description,
          },
        });
      } catch (e: any) {
        if (!handleQuotaError(e)) toast.error(e?.message || "Erreur lors de la génération du brief");
      } finally {
        setPinterestVisualGenerating(false);
      }
      return;
    }

    // Formats structurés : appel classique (pas de streaming)
    // Carrousels photo/mix : proposer la structure d'abord (sauf si déjà validée)
    // Les carrousels texte vont directement à la génération (pas de structure_review)
    const isPhotoOrMixCarousel = carouselSubMode === "photo" || carouselSubMode === "mix";
    if (selectedFormat === "carousel" && isPhotoOrMixCarousel && !structureProposal && !lastConfirmedStructure) {
      setStructureLoading(true);
      try {
        const structureBody: any = {
          type: "structure_proposal",
          subject: enrichedSubject,
          carousel_type: carouselSubMode || undefined,
          objective: objective || undefined,
          slide_count: 7,
          editorial_angle: editorialAngle || undefined,
          deepening_answers: Object.keys(ans).length > 0 ? ans : undefined,
          workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          photo_description: photoDescription || undefined,
          ...(newsjackingContext ? { news_context: newsjackingContext.slice(0, 3800) } : {}),
        };
        // En mode photo/mix, envoyer les photos pour analyse visuelle
        if ((carouselSubMode === "photo" || carouselSubMode === "mix") && uploadedPhotos.length > 0) {
          structureBody.photos = uploadedPhotos.map(p => ({ base64: p.base64, context: p.context }));
          // Snapshot pour handleGenerateVisuals (résiste aux resets de state UI)
          setGeneratedWithPhotos(uploadedPhotos);
        }
        const structureTimeout = (carouselSubMode === "photo" || carouselSubMode === "mix") && uploadedPhotos.length > 0 ? 60000 : 30000;
        const { data, error: fnError } = await invokeWithTimeout("carousel-ai", {
          body: structureBody,
        }, structureTimeout);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        if (data?.result) {
          setStructureProposal(data.result);
          setStep("structure_review");
        } else {
          throw new Error("Structure non reçue");
        }
      } catch (e: any) {
        if (isDemoMode) {
          toast("La génération en direct nécessite un compte connecté. Le résultat pré-généré est disponible avec le sujet par défaut.");
          setStep("format");
          return;
        }
        if (!handleQuotaError(e)) {
          toast.error("Erreur lors de la proposition de structure. Génération directe...");
          await generate({
            format: selectedFormat as any,
            subject: enrichedSubject,
            objective: objective || undefined,
            editorialAngle: editorialAngle || undefined,
            answers: Object.keys(ans).length > 0 ? ans : undefined,
            channel: isLinkedInCarousel ? "linkedin" : undefined,
            ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
            ...(carouselSubMode === "mix" ? { carouselType: "mix", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
            ...(photoMode ? { photoMode: true, photos: uploadedPhotos.length > 0 ? uploadedPhotos.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context })) : undefined, photoDescription } : {}),
            ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
          });
        }
      } finally {
        setStructureLoading(false);
      }
      return;
    }

    // Régénération carrousel : réutiliser la dernière structure confirmée
    if (selectedFormat === "carousel" && lastConfirmedStructure) {
      setStep("result");
      await generate({
        format: "carousel",
        subject: enrichedSubject,
        objective: objective || undefined,
        editorialAngle: editorialAngle || undefined,
        answers: Object.keys(ans).length > 0 ? ans : undefined,
        channel: isLinkedInCarousel ? "linkedin" : undefined,
        confirmedStructure: lastConfirmedStructure,
        ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
        ...(carouselSubMode === "mix" ? { carouselType: "mix", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
        ...(photoMode ? { photoMode: true, photos: uploadedPhotos.length > 0 ? uploadedPhotos.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context })) : undefined, photoDescription } : {}),
        ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
      });
      return;
    }

    // Sécurité : s'assurer qu'on est bien sur l'étape result avant de lancer la génération
    setStep("result");

    await generate({
      format: selectedFormat as any,
      subject: enrichedSubject,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      answers: Object.keys(ans).length > 0 ? ans : undefined,
      channel: isLinkedInCarousel ? "linkedin" : undefined,
      ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
      ...(carouselSubMode === "mix" ? { carouselType: "mix", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
      ...(photoMode ? { photoMode: true, photos: uploadedPhotos.length > 0 ? uploadedPhotos.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context })) : undefined, photoDescription } : {}),
      ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
    });
  };

  const handleRegenerate = async () => {
    await doGenerate(answers);
  };

  // Drapeau qui force une régénération une fois que le nouveau editorialAngle a été commité dans le state.
  // (setState étant async, on ne peut pas appeler doGenerate juste après setEditorialAngle.)
  const [pendingAngleRegen, setPendingAngleRegen] = useState(false);
  const handleChangeAngle = (newAngle: string | null) => {
    setEditorialAngle(newAngle);
    setPendingAngleRegen(true);
  };
  useEffect(() => {
    if (!pendingAngleRegen) return;
    setPendingAngleRegen(false);
    doGenerate(answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAngleRegen, editorialAngle]);

  // ── LinkedIn carousel caption: appel dédié à linkedin-ai/caption-for-carousel ──
  // Le prompt carousel-ai (mix/photo) laisse volontairement la légende vide pour
  // qu'elle soit générée par ce prompt LinkedIn dédié (anti-broetry, hashtags pro).
  const [captionLoading, setCaptionLoading] = useState(false);
  const captionAutoTriggeredRef = useRef<any>(null);

  const generateLinkedInCarouselCaption = useCallback(async () => {
    const r: any = (result as any)?.raw;
    if (!r) return;
    if (!isLinkedInCarousel) return;
    if (carouselSubMode !== "mix" && carouselSubMode !== "photo") return;

    // Construire un résumé compact des slides (overlay_text + title + body), max ~1500 char
    const slidesArr: any[] = Array.isArray(r.slides) ? r.slides : [];
    const slidesSummary = slidesArr
      .map((s: any, i: number) => {
        const parts = [s.overlay_text, s.title, s.body].filter((x: any) => typeof x === "string" && x.trim());
        return `Slide ${s.slide_number ?? i + 1}: ${parts.join(" — ")}`;
      })
      .join("\n")
      .slice(0, 1500);

    setCaptionLoading(true);
    try {
      const { data, error: fnError } = await invokeWithTimeout("linkedin-ai", {
        body: {
          action: "caption-for-carousel",
          subject: ideaText,
          chosen_angle: typeof r.chosen_angle === "string"
            ? r.chosen_angle
            : (r.chosen_angle?.title || r.chosen_angle?.angle || (r.chosen_angle ? JSON.stringify(r.chosen_angle) : null)),
          slides_summary: slidesSummary,
          editorial_angle: editorialAngle || null,
          objective: objective || null,
          workspace_id: workspaceId !== session?.user?.id ? workspaceId : undefined,
        },
      }, 60000);
      if (fnError) throw new Error(fnError.message || "Erreur génération légende");
      if (data?.error) {
        if (handleQuotaError(data)) return;
        throw new Error(data.message || data.error);
      }
      const rawContent = data?.content ?? data;
      let parsed: any = rawContent;
      if (typeof rawContent === "string") {
        try {
          let cleaned = rawContent.trim();
          if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
          }
          parsed = JSON.parse(cleaned);
        } catch {
          const m = rawContent.match(/\{[\s\S]*\}/);
          if (m) {
            try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
          }
        }
      }
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Légende illisible");
      }

      // Merge dans result.raw.caption
      setResult((prev: any) => {
        if (!prev) return prev;
        const nextRaw = { ...(prev.raw || {}) };
        nextRaw.caption = {
          ...(nextRaw.caption || {}),
          hook: parsed.hook || nextRaw.caption?.hook || "",
          body: parsed.body || "",
          cta: parsed.cta || "",
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        };
        return { ...prev, raw: nextRaw };
      });
    } catch (e: any) {
      console.error("[linkedin-caption-for-carousel] failed:", e);
      toast.error(e?.message || "Impossible de générer la légende LinkedIn");
    } finally {
      setCaptionLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, isLinkedInCarousel, carouselSubMode, ideaText, editorialAngle, objective, workspaceId, session?.user?.id]);

  // Auto-trigger après une génération de carrousel LinkedIn mix/photo si la légende est vide
  useEffect(() => {
    if (!isLinkedInCarousel) return;
    if (carouselSubMode !== "mix" && carouselSubMode !== "photo") return;
    if (generating || captionLoading) return;
    const r: any = (result as any)?.raw;
    if (!r?.slides || !Array.isArray(r.slides) || r.slides.length === 0) return;
    if (captionAutoTriggeredRef.current === r) return;
    const c = r.caption || {};
    const bodyLen = typeof c.body === "string" ? c.body.trim().length : 0;
    const isEmpty = bodyLen < 200; // seuil — body doit faire 800-1500 ; <200 = bâclée/vide
    if (!isEmpty) return;
    captionAutoTriggeredRef.current = r;
    generateLinkedInCarouselCaption();
  }, [result, isLinkedInCarousel, carouselSubMode, generating, captionLoading, generateLinkedInCarouselCaption]);

  const handleConfirmStructure = async (confirmedSlides: SlideProposal[]) => {
    const enrichedSubject = existingCalendarContent
      ? ideaText + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : ideaText;
    setLastConfirmedStructure(confirmedSlides);
    setStructureProposal(null);
    setStep("result");
    // Snapshot des photos avant la génération finale (au cas où le state UI serait reset)
    if ((carouselSubMode === "photo" || carouselSubMode === "mix") && uploadedPhotos.length > 0) {
      setGeneratedWithPhotos(uploadedPhotos);
    }
    await generate({
      format: "carousel",
      subject: enrichedSubject,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      answers: Object.keys(answers).length > 0 ? answers : undefined,
      channel: isLinkedInCarousel ? "linkedin" : undefined,
      confirmedStructure: confirmedSlides,
      ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
      ...(carouselSubMode === "mix" ? { carouselType: "mix", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })), photoDescription } : {}),
      ...(photoMode ? { photoMode: true, photos: uploadedPhotos.length > 0 ? uploadedPhotos.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context })) : undefined, photoDescription } : {}),
      ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
    });
  };

  const handleSkipStructure = async (slides: SlideProposal[]) => {
    await handleConfirmStructure(slides);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  const handleEdit = () => {
    const r = result?.raw || result;
    let text = "";

    if (!r) {
      // Pas de résultat IA — utiliser le contenu existant du calendrier ou le brouillon
      text = existingCalendarContent || "";
    } else if (selectedFormat === "carousel" && r?.slides) {
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

    } else if (selectedFormat === "reel" && r?.sections) {
      text = (r.sections as any[])
        .map((s: any) => {
          const header = `--- ${s.label || s.section_label || `Section ${s.section_number || ""}`} (${s.timing || ""}) ---`;
          const parts = [s.texte_parle, s.texte_overlay, s.action].filter(Boolean);
          return `${header}\n${parts.join("\n")}`;
        })
        .join("\n\n");

    } else if (selectedFormat === "story" && (r?.stories || r?.sequences || r?.slides)) {
      const stories = r.stories || r.sequences || r.slides || [];
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
      if (r.hashtags?.length > 0) {
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

  const handleSelectInspirationProposal = async (proposal: any) => {
    setChosenProposal(proposal);

    if (proposal.recommended_output === "visual") {
      // CHEMIN A : génération visuelle (pinterest-visual avec référence)
      setStep("result");
      setPinterestPinHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-visual", {
          body: {
            subject: proposal.subject,
            pin_type: proposal.pin_type,
            reference_image_base64: inspirationImageBase64,
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 180000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPinterestPinHtml(r?.pin_html || null);
        setSelectedFormat("pinterest_visual");
        setResult({
          type: "pinterest_visual" as any,
          raw: {
            pin_html: r?.pin_html,
            title: r?.title,
            description: r?.description,
            pin_data: r?.pin_data,
          },
        });
        setIdeaText(proposal.subject);
      } catch (e: any) {
        if (!handleQuotaError(e)) toast.error(e?.message || "Erreur lors de la génération du visuel");
      } finally {
        setPinterestVisualGenerating(false);
      }

    } else {
      // CHEMIN B : brief photo + overlay
      setStep("result");
      setPhotoBriefOverlayHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-photo-brief", {
          body: {
            subject: proposal.subject,
            reference_image_base64: inspirationImageBase64,
            pin_type: proposal.pin_type,
            brief_hint: proposal.brief,
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 180000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPhotoBriefOverlayHtml(r?.overlay_html || null);
        setPhotoBriefResult(r);
        setSelectedFormat("pinterest_photo");
        setResult({
          type: "pinterest_photo" as any,
          raw: {
            overlay_html: r?.overlay_html,
            photo_brief: r?.photo_brief,
            title: r?.title,
            description: r?.description,
          },
        });
        setIdeaText(proposal.subject);
      } catch (e: any) {
        if (!handleQuotaError(e)) toast.error(e?.message || "Erreur lors de la génération du brief");
      } finally {
        setPinterestVisualGenerating(false);
      }
    }
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
    clearFlowState();
    clearDraft();
    sessionStorage.removeItem(CREER_RESULT_KEY);
  };


  const handleTransformToLinkedInCarousel = async () => {
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

  const handleSave = async () => {
    if (!session?.user?.id || !result?.raw || saving) return;
    setSaving(true);
    try {
      const r = result.raw;
      if (selectedFormat === "carousel" && r?.slides) {
        const hookText = r.slides?.[0]?.title || "";
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
      }
      toast.success("Contenu sauvegardé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Extract content draft from result for calendar save
  const extractContentForCalendar = () => {
    const r = result?.raw;
    if (!r) return { contentDraft: "", accroche: "", storyDetail: null as any };
    let contentDraft = "";
    let accroche = "";
    const fmt = selectedFormat || "post";

    if (selectedFormat === "carousel" && r?.carousel_type === "photo") {
      accroche = r.caption?.hook || "";
      contentDraft = (r.slides || []).map((s: any) => s.overlay_text ? `SLIDE ${s.slide_number}: ${s.overlay_text}` : `SLIDE ${s.slide_number}: (photo seule)`).join("\n") + "\n\n" + [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n");
      const storyDetail: any = { type: "carousel_photo", slides: r.slides, caption: r.caption, quality_check: r.quality_check };
      return { contentDraft, accroche, storyDetail };
    }

    if (selectedFormat === "carousel" && r?.carousel_type === "mix") {
      accroche = r.caption?.hook || "";
      contentDraft = (r.slides || []).map((s: any) => {
        const type = s.slide_type || "text_only";
        if (type === "photo_full") return `SLIDE ${s.slide_number} [📸]: ${s.overlay_text || "(photo seule)"}`;
        if (type === "photo_integrated") return `SLIDE ${s.slide_number} [📷+📝]: ${s.title || ""} — ${s.body || ""}`;
        return `SLIDE ${s.slide_number} [📝]: ${s.title || ""} — ${s.body || ""}`;
      }).join("\n") + "\n\n" + [r.caption?.hook, r.caption?.body, r.caption?.cta].filter(Boolean).join("\n");
      const storyDetail: any = { type: "carousel_mix", slides: r.slides, caption: r.caption, quality_check: r.quality_check };
      return { contentDraft, accroche, storyDetail };
    }

    if (selectedFormat === "carousel" && r?.slides) {
      accroche = r.caption?.hook || r.slides?.[0]?.title || "";
      const slidesText = r.slides?.map((s: any) => `${s.title}\n${s.body || ""}`).join("\n\n");
      const captionText = r.caption ? [r.caption.hook, r.caption.body, r.caption.cta].filter(Boolean).join("\n") : "";
      contentDraft = captionText ? `${captionText}\n\n───── SLIDES ─────\n\n${slidesText}` : slidesText;
    } else if (selectedFormat === "linkedin" && (r?.hook || r?.full_text)) {
      accroche = (r.hook || r.full_text?.split(/[.\n]/)[0] || "").trim().slice(0, 200);
      contentDraft = r.full_text || [r.hook, r.body, r.cta].filter(Boolean).join("\n\n");
    } else if (selectedFormat === "reel" && (r?.sections || r?.script)) {
      const reelSections = r.sections || r.script || [];
      accroche = reelSections[0]?.texte_parle || r.accroche || "";
      contentDraft = reelSections.map((s: any) => `[${s.timing || ""}] ${(s.label || s.section || "").toUpperCase()}\n${s.texte_parle || ""}${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}${s.format_visuel ? `\n📹 ${s.format_visuel}` : ""}`).join("\n\n");
    } else if (selectedFormat === "story" && r?.stories) {
      accroche = r.stories?.[0]?.text || "";
      contentDraft = r.stories?.map((s: any) => `STORY ${s.number || ""} (${s.timing || ""})\n${s.format_label || s.format || ""}\n${s.text || ""}${s.sticker ? `\n🎯 ${s.sticker.label || s.sticker.type || ""}` : ""}`).join("\n\n───\n\n");
    } else if (selectedFormat === "pinterest_visual" && (r?.title || r?.description)) {
      accroche = r.title || "";
      contentDraft = `📌 ${r.title || ""}\n\n${r.description || ""}`;
    } else if (selectedFormat === "pinterest_photo" && (r?.title || r?.photo_brief)) {
      accroche = r.title || "";
      const briefLines = r.photo_brief ? [
        "📷 BRIEF PHOTO :",
        `• Sujet : ${r.photo_brief.what || ""}`,
        `• Cadrage : ${r.photo_brief.framing || ""}`,
        `• Lumière : ${r.photo_brief.lighting || ""}`,
        `• Accessoires : ${(r.photo_brief.props || []).join(", ")}`,
        `• Couleurs : ${r.photo_brief.colors || ""}`,
        `• Ambiance : ${r.photo_brief.mood || ""}`,
      ].join("\n") : "";
      contentDraft = `📌 ${r.title || ""}\n\n${r.description || ""}\n\n${briefLines}`;
    } else {
      contentDraft = r.content || r.post || r.text || "";
      accroche = contentDraft.split("\n")[0] || "";
    }

    let storyDetail: any = null;
    if (selectedFormat === "carousel" && r?.slides) {
      storyDetail = {
        type: "carousel",
        carousel_type: r.carousel_type || "tips",
        slides: r.slides,
        caption: r.caption,
        quality_check: r.quality_check,
      };
    } else if (selectedFormat === "reel" && (r?.sections || r?.script)) {
      storyDetail = {
        type: "reel",
        format_type: r.format_type,
        format_label: r.format_label,
        duree_cible: r.duree_cible,
        script: r.sections || r.script,
        caption: r.caption,
        hashtags: r.hashtags,
        cover_text: r.cover_text,
        alt_text: r.alt_text,
        amplification_stories: r.amplification_stories,
      };
    } else if (selectedFormat === "story" && (r?.stories || r?.sequences)) {
      storyDetail = {
        type: "stories",
        stories: r.stories || r.sequences,
        structure_type: r.structure_type,
        structure_label: r.structure_label,
        narrative_angle: r.narrative_angle || null,
        stickers_used: r.stickers_used,
        garde_fou_alerte: r.garde_fou_alerte,
        personal_tip: r.personal_tip,
      };
    }

    return { contentDraft, accroche, storyDetail };
  };

  // Save back to existing calendar post (when coming from calendar)
  const handleSaveBackToCalendar = async () => {
    if (!session?.user?.id || !calendarPostId || !result?.raw) return;
    setSavingToCalendar(true);
    try {
      if (selectedFormat === "carousel" && !savedId && result?.raw?.slides) {
        await handleSave();
      }
      const { contentDraft, accroche, storyDetail } = extractContentForCalendar();
      const r = result?.raw;
      const { error } = await supabase.from("calendar_posts").update({
        content_draft: contentDraft,
        accroche: accroche || null,
        status: "drafting",
        format: selectedFormat === "story" ? "story_serie" : (selectedFormat || "post"),
        objectif: objective || null,
        angle: editorialAngle || null,
        ...(storyDetail ? { story_sequence_detail: storyDetail } : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", calendarPostId);
      if (error) throw error;

      // Upload visuels et photos dans Storage
      if (calendarPostId) {
        const storageUpdates: any = {};
        
        if ((carouselSubMode === "photo" || carouselSubMode === "mix") && uploadedPhotos.length > 0) {
          try {
            const photoUrls = await uploadPhotosToStorage(calendarPostId);
            if (photoUrls.length > 0) storageUpdates.photo_urls = photoUrls;
          } catch (err) {
            console.warn("Photo upload failed:", err);
          }
        }
        
        if (visualSlides.length > 0) {
          try {
            toast.info("Upload des visuels...");
            const visualUrls = await uploadVisualsToStorage(calendarPostId);
            if (visualUrls.length > 0) storageUpdates.visual_urls = visualUrls;
            // Persist source HTML to enable PowerPoint éditable from calendar
            storageUpdates.visual_html = visualSlides;
          } catch (err) {
            console.warn("Visual upload failed:", err);
          }
        }

        // Upload visuel Pinterest dans Storage
        if (selectedFormat === "pinterest_visual" && pinterestPinHtml) {
          try {
            toast.info("Upload du visuel Pinterest...");
            const pinVisualUrls = await uploadPinterestVisualToStorage(calendarPostId, pinterestPinHtml);
            if (pinVisualUrls.length > 0) storageUpdates.visual_urls = pinVisualUrls;
            storageUpdates.visual_html = [{ slide_number: 1, html: pinterestPinHtml }];
          } catch (err) {
            console.warn("Pinterest visual upload failed:", err);
          }
        }

        // Upload overlay Pinterest photo brief
        if (selectedFormat === "pinterest_photo" && photoBriefOverlayHtml) {
          try {
            toast.info("Upload de l'overlay...");
            const overlayUrls = await uploadPinterestVisualToStorage(calendarPostId, photoBriefOverlayHtml);
            if (overlayUrls.length > 0) storageUpdates.visual_urls = overlayUrls;
            storageUpdates.visual_html = [{ slide_number: 1, html: photoBriefOverlayHtml }];
          } catch (err) {
            console.warn("Overlay upload failed (non-blocking):", err);
          }
        }

        if (Object.keys(storageUpdates).length > 0) {
          const currentDetail = storyDetail || {};
          await supabase.from("calendar_posts").update({
            story_sequence_detail: { ...currentDetail, ...storageUpdates },
          }).eq("id", calendarPostId);
        }
      }

      // Lier le brief au post calendrier
      if (currentBriefId && calendarPostId) {
        await supabase.from("content_briefs").update({ calendar_post_id: calendarPostId } as any).eq("id", currentBriefId);
      }

      toast.success("Contenu sauvegardé dans ton calendrier !");
      clearFlowState();
      navigate(`/calendrier?date=${calendarPostDate || ""}&post=${calendarPostId}`);
    } catch (e: any) {
      toast.error(e?.message || "Erreur de sauvegarde");
    } finally {
      setSavingToCalendar(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!session?.user?.id || !result?.raw) return;
    // Auto-save carousel if not already saved
    if (selectedFormat === "carousel" && !savedId && result?.raw?.slides) {
      await handleSave();
    }
    // If coming from calendar, save directly back
    if (fromCalendar) {
      await handleSaveBackToCalendar();
      return;
    }
    setCalendarDialogOpen(true);
  };

  const uploadPhotosToStorage = async (postId: string): Promise<string[]> => {
    if (!session?.user?.id || uploadedPhotos.length === 0) return [];
    
    const urls: string[] = [];
    for (let i = 0; i < uploadedPhotos.length; i++) {
      const photo = uploadedPhotos[i];
      if (!photo.base64) continue;
      
      const raw = photo.base64.startsWith("data:") 
        ? photo.base64 
        : `data:image/jpeg;base64,${photo.base64}`;
      const response = await fetch(raw);
      const blob = await response.blob();
      
      const path = `${session.user.id}/${postId}/photos/photo-${i + 1}.jpg`;
      const { error } = await supabase.storage
        .from("calendar-visuals")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      
      if (error) {
        console.error(`Failed to upload photo ${i + 1}:`, error);
        continue;
      }
      
      const { data: urlData } = supabase.storage
        .from("calendar-visuals")
        .getPublicUrl(path);
      
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const uploadVisualsToStorage = async (postId: string): Promise<string[]> => {
    if (!session?.user?.id || visualSlides.length === 0) return [];
    
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1080px;height:1350px;overflow:hidden;z-index:-1;";
    document.body.appendChild(container);
    
    const urls: string[] = [];
    try {
      for (const vs of visualSlides) {
        container.innerHTML = vs.html;
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 400));
        
        const canvas = await (await import("html2canvas")).default(container, {
          width: 1080,
          height: 1350,
          scale: 1,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          logging: false,
        });
        
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), "image/png");
        });
        
        const path = `${session.user.id}/${postId}/slides/slide-${vs.slide_number}.png`;
        const { error } = await supabase.storage
          .from("calendar-visuals")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        
        if (error) {
          console.error(`Failed to upload slide ${vs.slide_number}:`, error);
          continue;
        }
        
        const { data: urlData } = supabase.storage
          .from("calendar-visuals")
          .getPublicUrl(path);
        
        urls.push(urlData.publicUrl);
      }
    } finally {
      document.body.removeChild(container);
    }
    return urls;
  };

  const uploadPinterestVisualToStorage = async (postId: string, pinHtml: string): Promise<string[]> => {
    if (!session?.user?.id || !pinHtml) return [];

    const container = document.createElement("div");
    container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1000px;height:1500px;overflow:hidden;z-index:-1;";
    document.body.appendChild(container);

    const urls: string[] = [];
    try {
      container.innerHTML = pinHtml;
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 400));

      const canvas = await (await import("html2canvas")).default(container, {
        width: 1000,
        height: 1500,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      const path = `${session.user.id}/${postId}/pinterest/pin-visual.png`;
      const { error } = await supabase.storage
        .from("calendar-visuals")
        .upload(path, blob, { contentType: "image/png", upsert: true });

      if (error) {
        console.error("Failed to upload pinterest visual:", error);
        return [];
      }

      const { data: urlData } = supabase.storage
        .from("calendar-visuals")
        .getPublicUrl(path);

      urls.push(urlData.publicUrl);
    } finally {
      document.body.removeChild(container);
    }
    return urls;
  };

  const handleConfirmCalendar = async () => {
    if (!session?.user?.id || !calendarDate || savingToCalendar) return;
    setSavingToCalendar(true);
    try {
      const { contentDraft, accroche, storyDetail } = extractContentForCalendar();
      const r = result?.raw;
      const fmt = selectedFormat === "story" ? "story_serie" : (selectedFormat || "post");
      const canal = selectedFormat === "linkedin" || isLinkedInCarousel ? "linkedin" : selectedFormat === "pinterest" || selectedFormat === "pinterest_visual" || selectedFormat === "pinterest_photo" ? "pinterest" : selectedFormat === "newsletter" ? "newsletter" : "instagram";

      // Calculate calendar notes for inspiration-based pins
      let calendarNotes = "";
      if ((selectedFormat === "pinterest_visual" || selectedFormat === "pinterest_photo") && chosenProposal && inspirationAnalysis) {
        calendarNotes = `🔍 Inspiré de : ${inspirationAnalysis.source_description || ""}\n📐 Angle : ${chosenProposal.angle || ""}`;
        if (selectedFormat === "pinterest_photo" && result?.raw?.photo_brief) {
          const b = result.raw.photo_brief;
          calendarNotes += `\n\n📷 BRIEF PHOTO :\n• Sujet : ${b.what || ""}\n• Cadrage : ${b.framing || ""}\n• Lumière : ${b.lighting || ""}\n• Accessoires : ${(b.props || []).join(", ")}\n• Ambiance : ${b.mood || ""}`;
        }
      }

      const { data: insertedPost, error: insertError } = await supabase.from("calendar_posts").insert({
        user_id: session.user.id,
        ...(workspaceId && workspaceId !== session.user.id ? { workspace_id: workspaceId } : {}),
        date: calendarDate,
        theme: ideaText,
        status: "drafting",
        canal,
        format: fmt,
        objectif: objective || null,
        angle: editorialAngle || null,
        content_draft: contentDraft,
        accroche,
        ...(calendarNotes ? { notes: calendarNotes } : {}),
        ...(storyDetail ? { story_sequence_detail: storyDetail } : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
      }).select("id").single();

      if (insertError) throw insertError;

      const postId = insertedPost?.id;

      if (postId) {
        const updates: any = {};
        
        // Upload photos originales dans Storage
        if ((carouselSubMode === "photo" || carouselSubMode === "mix" || photoMode) && uploadedPhotos.length > 0) {
          try {
            const photoUrls = await uploadPhotosToStorage(postId);
            if (photoUrls.length > 0) {
              updates.photo_urls = photoUrls;
            }
          } catch (err) {
            console.warn("Photo upload failed (non-blocking):", err);
          }
        }
        
        // Upload visuels PNG dans Storage
        if (visualSlides.length > 0) {
          try {
            toast.info("Upload des visuels...");
            const visualUrls = await uploadVisualsToStorage(postId);
            if (visualUrls.length > 0) {
              updates.visual_urls = visualUrls;
            }
            // Persist source HTML to enable PowerPoint éditable from calendar
            updates.visual_html = visualSlides;
          } catch (err) {
            console.warn("Visual upload failed (non-blocking):", err);
          }
        }

        // Upload visuel Pinterest dans Storage
        if (selectedFormat === "pinterest_visual" && pinterestPinHtml) {
          try {
            toast.info("Upload du visuel Pinterest...");
            const pinVisualUrls = await uploadPinterestVisualToStorage(postId, pinterestPinHtml);
            if (pinVisualUrls.length > 0) {
              updates.visual_urls = pinVisualUrls;
            }
            updates.visual_html = [{ slide_number: 1, html: pinterestPinHtml }];
          } catch (err) {
            console.warn("Pinterest visual upload failed (non-blocking):", err);
          }
        }

        // Upload overlay Pinterest photo brief
        if (selectedFormat === "pinterest_photo" && photoBriefOverlayHtml) {
          try {
            toast.info("Upload de l'overlay...");
            const overlayUrls = await uploadPinterestVisualToStorage(postId, photoBriefOverlayHtml);
            if (overlayUrls.length > 0) {
              updates.visual_urls = overlayUrls;
            }
            updates.visual_html = [{ slide_number: 1, html: photoBriefOverlayHtml }];
          } catch (err) {
            console.warn("Overlay upload failed (non-blocking):", err);
          }
        }
        
        if (Object.keys(updates).length > 0) {
          const currentDetail = storyDetail || {};
          await supabase.from("calendar_posts").update({
            story_sequence_detail: {
              ...currentDetail,
              ...updates,
            },
          }).eq("id", postId);
        }
      }

      // Lier le brief au post calendrier
      if (currentBriefId && postId) {
        await supabase.from("content_briefs").update({ calendar_post_id: postId } as any).eq("id", currentBriefId);
      }

      toast.success("Ajouté au calendrier !");
      setCalendarDialogOpen(false);
      clearFlowState();

      if (postId) {
        navigate(`/calendrier?date=${calendarDate}&post=${postId}`);
      } else {
        navigate(`/calendrier?date=${calendarDate}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    } finally {
      setSavingToCalendar(false);
    }
  };

  const handleGenerateVisuals = async (opts?: { forceText?: boolean }) => {
    if (!result?.raw?.slides || visualLoading) return;
    setVisualLoading(true);

    // ═══ Demo bypass: return pre-built visuals only when user follows the script ═══
    const isAurianaScript = aurianaDemoActive
      && ideaText === AURIANA_DEMO_SUBJECT
      && carouselSubMode === "text"
      && uploadedPhotos.length === 0;
    if (isAurianaScript) {
      const { getAurianaDemoVisualSlides } = await import("@/lib/demo-auriana-data");
      await new Promise(r => setTimeout(r, 1500));
      setVisualSlides(getAurianaDemoVisualSlides());
      setVisualLoading(false);
      toast.success("Visuels générés !");
      return;
    }

    try {
      // ═══ Diagnostic : vérifier la structure des slides ═══
      const rawSlides = result.raw.slides;
      console.log("[carousel-visual] raw slides type:", typeof rawSlides, "isArray:", Array.isArray(rawSlides), "length:", rawSlides?.length);
      
      if (!Array.isArray(rawSlides) || rawSlides.length === 0) {
        console.error("[carousel-visual] slides invalides:", JSON.stringify(rawSlides).slice(0, 500));
        posthog.capture("carousel_visual_invalid_slides", {
          raw_type: typeof rawSlides,
          raw_is_array: Array.isArray(rawSlides),
          raw_length: rawSlides?.length,
          raw_keys: typeof rawSlides === "object" && rawSlides ? Object.keys(rawSlides) : [],
          raw_preview: JSON.stringify(rawSlides).slice(0, 300),
          result_raw_keys: Object.keys(result?.raw || {}),
        });
        toast.error("Les slides ne sont pas dans un format valide. Essaie de régénérer le carrousel.");
        setVisualLoading(false);
        return;
      }

      const rawCarouselType = result.raw.carousel_type;
      // ═══ Source de vérité photos : snapshot pris au moment de la génération.
      // Si le state UI uploadedPhotos a été reset (changement d'onglet, etc.),
      // on retombe sur generatedWithPhotos pour ne pas perdre les photos.
      const photosForVisuals = uploadedPhotos.length > 0 ? uploadedPhotos : generatedWithPhotos;
      const hasActualPhotos = photosForVisuals.length > 0;
      console.log("[carousel-visual] photos source:", {
        ui_state: uploadedPhotos.length,
        snapshot: generatedWithPhotos.length,
        used: photosForVisuals.length,
      });
      // ═══ Downgrade EXPLICITE : si l'IA demande photo/mix mais qu'aucune photo
      // n'est disponible, on n'applique JAMAIS un downgrade silencieux. On ouvre
      // un dialog pour laisser l'utilisateur décider (ajouter des photos OU
      // continuer en texte). Si forceText === true, l'utilisateur a confirmé.
      let downgradeReason: "no_photos_at_generation" | "user_chose_text" | null = null;
      if ((rawCarouselType === "photo" || rawCarouselType === "mix") && !hasActualPhotos) {
        if (!opts?.forceText) {
          setPhotoMissingDialog({ open: true, rawType: rawCarouselType });
          setVisualLoading(false);
          return;
        }
        downgradeReason = "user_chose_text";
      }
      const effectiveCarouselType = (rawCarouselType === "photo" || rawCarouselType === "mix") && !hasActualPhotos
        ? "text"
        : rawCarouselType;

      const isPhotoCarousel = effectiveCarouselType === "photo";
      const isMixCarousel = effectiveCarouselType === "mix";
      const hasPhotos = isPhotoCarousel || isMixCarousel;

      // ═══ Construire le body et le valider avant envoi ═══
      // P0-2: auto-assign photo_index séquentiel si l'IA l'oublie sur photo_full / photo_integrated
      let autoPhotoCursor = 0;
      const totalPhotos = photosForVisuals.length;

      const mappedSlides = rawSlides.map((s: any, slideIdx: number) => {
        const slideType = hasPhotos
          ? (s.slide_type || (isPhotoCarousel ? "photo_full" : "text_only"))
          : "text_only";

        // Résolution photo_index : utilise celui fourni s'il est valide (1-based, dans la range),
        // sinon attribue séquentiellement la prochaine photo dispo et logge.
        let resolvedPhotoIndex: number | undefined;
        if (slideType === "photo_full" || slideType === "photo_integrated") {
          const provided = Number.isInteger(s.photo_index) ? s.photo_index : null;
          if (provided && provided >= 1 && provided <= totalPhotos) {
            resolvedPhotoIndex = provided;
          } else if (totalPhotos > 0) {
            resolvedPhotoIndex = (autoPhotoCursor % totalPhotos) + 1;
            console.warn(
              `[carousel] slide ${s.slide_number ?? slideIdx + 1} (${slideType}) sans photo_index valide (reçu: ${s.photo_index}). Auto-assigné à ${resolvedPhotoIndex}.`
            );
            autoPhotoCursor++;
          }
          if (provided && provided >= 1 && provided <= totalPhotos) {
            autoPhotoCursor = Math.max(autoPhotoCursor, provided);
          }
        }

        return {
          slide_number: s.slide_number,
          role: s.role,
          slide_type: slideType,
          ...(slideType === "photo_full" ? {
            overlay_text: s.overlay_text,
            overlay_position: s.overlay_position || "bottom_center",
            overlay_style: s.overlay_style || "sensoriel",
            note: s.note,
            photo_index: resolvedPhotoIndex,
          } : {}),
          ...(slideType === "photo_integrated" ? {
            photo_index: resolvedPhotoIndex,
            photo_layout: s.photo_layout || "top_photo",
            title: s.title || "",
            body: s.body || "",
            note: s.note,
          } : {}),
          ...(slideType === "text_only" ? {
            title: s.title || s.overlay_text || "",
            body: s.body || s.note || "",
            visual_suggestion: s.visual_suggestion,
            ...(s.visual_schema ? { visual_schema: s.visual_schema } : {}),
          } : {}),
        };
      });

      // P1-8 : Validation sequencing post-IA pour mix
      // - Slide 1 doit être visuelle (photo_full / photo_integrated) pour ouvrir fort
      // - Dernière slide doit être text_only (CTA)
      // On corrige silencieusement (log console) sans bloquer l'utilisateur.
      if (isMixCarousel && mappedSlides.length >= 2) {
        const first = mappedSlides[0];
        const last = mappedSlides[mappedSlides.length - 1];
        if (first.slide_type === "text_only") {
          console.warn(
            `[carousel] sequencing: slide 1 était text_only — conversion en photo_full pour ouvrir fort.`
          );
          const targetPhoto = totalPhotos > 0 ? 1 : undefined;
          mappedSlides[0] = {
            slide_number: first.slide_number,
            role: first.role,
            slide_type: "photo_full",
            overlay_text: (first as any).title || "",
            overlay_position: "bottom_center",
            overlay_style: "sensoriel",
            note: (first as any).note,
            photo_index: targetPhoto,
          };
        }
        if (
          last.slide_type !== "text_only" &&
          last.slide_type !== undefined &&
          last.role !== "cta"
        ) {
          console.warn(
            `[carousel] sequencing: dernière slide n'était pas text_only — conversion en CTA texte.`
          );
          // Mapping CTA propre : on supprime overlay_text/photo_index/photo_layout
          // pour ne garder que les champs pertinents pour une slide texte CTA.
          mappedSlides[mappedSlides.length - 1] = {
            slide_number: last.slide_number,
            role: "cta",
            slide_type: "text_only",
            title: (last as any).title || (last as any).overlay_text || "",
            body: (last as any).body || (last as any).note || "",
            ...((last as any).visual_suggestion ? { visual_suggestion: (last as any).visual_suggestion } : {}),
          };
        }
      }

      if (!mappedSlides || mappedSlides.length === 0) {
        console.error("[carousel-visual] mapping a produit 0 slides");
        toast.error("Erreur de préparation des slides. Régénère le carrousel.");
        setVisualLoading(false);
        return;
      }

      const requestBody: any = {
        slides: mappedSlides,
        ...(hasPhotos && hasActualPhotos ? {
          photos: photosForVisuals.map(p => ({ base64: p.base64 })),
          carousel_type: isMixCarousel ? "mix" : "photo",
        } : {
          template_style: null,
        }),
        workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
      };

      console.log("[carousel-visual] request body keys:", Object.keys(requestBody), "slides count:", requestBody.slides?.length);

      // ═══ Tracking automatique pour diagnostic à distance ═══
      const diagnosticPayload = {
        raw_keys: Object.keys(result.raw || {}),
        has_slides: !!result.raw?.slides,
        slides_type: typeof result.raw?.slides,
        slides_is_array: Array.isArray(result.raw?.slides),
        slides_count: rawSlides?.length || 0,
        mapped_slides_count: mappedSlides?.length || 0,
        body_keys: Object.keys(requestBody),
        body_has_slides: !!requestBody.slides,
        body_slides_count: requestBody.slides?.length || 0,
        carousel_type: rawCarouselType || "text",
        effective_type: effectiveCarouselType || "text",
        has_photos: hasActualPhotos,
        ui_state_count: uploadedPhotos.length,
        snapshot_count: generatedWithPhotos.length,
        downgrade_reason: downgradeReason,
        format: selectedFormat,
      };
      posthog.capture("carousel_visual_debug", diagnosticPayload);
      if (session?.user?.id) {
        supabase.from("frontend_debug_logs").insert({
          user_id: session.user.id,
          event: "carousel_visual_request",
          payload: diagnosticPayload,
        }).then(() => {}, () => {});
      }

      const { data, error: fnError } = await invokeWithTimeout("carousel-visual", {
        body: requestBody,
      }, 120000);
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setVisualSlides(data.result?.slides_html || []);
      if (downgradeReason === "user_chose_text") {
        toast.success("Carrousel généré en mode texte (aucune photo disponible).");
      } else {
        toast.success("Visuels générés !");
      }
    } catch (e: any) {
      posthog.capture("carousel_visual_error", {
        error_message: e?.message || "unknown",
        had_slides: !!result?.raw?.slides,
        slides_count: result?.raw?.slides?.length || 0,
      });
      toast.error(e?.message || "Erreur lors de la génération des visuels");
    } finally {
      setVisualLoading(false);
    }
  };

  const handleExportPptx = async () => {
    if (!result?.raw?.slides) return;
    try {
      const { exportCarouselPptx } = await import("@/lib/export-carousel-pptx");
      await exportCarouselPptx(
        result.raw.slides,
        ideaText || "carrousel",
        visualSlides.length > 0 ? visualSlides : undefined,
        charterData,
        uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
      );
      toast.success("PPTX éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportVisualPng = async () => {
    if (visualSlides.length === 0) return;
    try {
      toast.info("Export PNG en cours…");
      const { exportCarouselPng } = await import("@/lib/export-carousel-png");
      await exportCarouselPng(visualSlides, ideaText || "carrousel");
      toast.success(visualSlides.length > 1 ? "ZIP des images téléchargé !" : "PNG téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportHybridPptx = async () => {
    if (visualSlides.length === 0) return;
    try {
      toast.info("Export PowerPoint éditable en cours…");
      const { exportCarouselHybridPptx } = await import("@/lib/export-carousel-hybrid-pptx");
      await exportCarouselHybridPptx(
        visualSlides,
        result?.raw?.slides || null,
        charterData || null,
        ideaText || "carrousel-editable",
        generatedWithPhotos.length > 0 ? generatedWithPhotos : uploadedPhotos,
      );
      toast.success("PowerPoint éditable téléchargé !");
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'export");
    }
  };

  const handleExportPinterestPng = async () => {
    if (!pinterestPinHtml) return;
    try {
      toast.info("Export PNG en cours...");
      const { exportPinterestVisualPng } = await import("@/lib/export-pinterest-visual-pptx");
      await exportPinterestVisualPng(pinterestPinHtml, ideaText || "epingle-pinterest");
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
      await exportPinterestVisualPng(photoBriefOverlayHtml, ideaText || "overlay-pinterest");
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
    const structureId = getStructureForCombo(format, angle);
    const structure = CONTENT_STRUCTURES[structureId];
    if (!structure) return;

    setLaunchGenerating(true);
    setLaunchResults([]);
    const chapters = 5;
    const results: any[] = [];

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
    setLaunchGenerating(false);
  };

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

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
        <BrandingStatusBanner />

        <div className="mt-4">
          {/* Unified stepper — visible from step 1, hidden on result/edit screens to give content full focus */}
          {(() => {
            const stepperKey: StepperKey | null = (() => {
              if (step === "idea") return "idea";
              if (step === "format") return "format";
              if (step === "questions" || step === "structure_review" || step === "inspiration_proposals") return "brief";
              if (step === "result" || step === "edit") return "result";
              return null;
            })();
            if (!stepperKey) return null;
            const handleStepClick = (key: StepperKey) => {
              // Allow jumping back only — never forward
              if (key === "idea") setStep("idea");
              else if (key === "format" && step !== "idea") setStep("format");
              else if (key === "brief" && (step === "result" || step === "edit")) setStep("questions");
            };
            const credits =
              !planLoading && remainingTotal() < 9000 ? (
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  ✨ {remainingTotal()} restantes
                </span>
              ) : null;
            return (
              <CreerStepper
                current={stepperKey}
                onStepClick={handleStepClick}
                rightSlot={credits}
              />
            );
          })()}

            {/* Steps */}
            {step === "idea" && (
              <>
                <LowCreditsBanner remaining={remainingTotal()} plan={plan} />
                <CreerStepIdea onNext={handleIdeaNext} onCoachingSelect={handleCoachingSelect} onNewsjackingSelect={handleNewsjackingSelect} onPhotosNext={handlePhotosNext} workspaceId={workspaceId} activite={activityText} initialIdea={ideaText} autoOpenTransform={autoOpenTransform} />
              </>
            )}

            {step === "format" && (
              <CreerStepFormat
                idea={ideaText}
                objective={objective || undefined}
                initialFormat={selectedFormat || undefined}
                suggestedFormat={newsjackingSuggestedFormat || undefined}
                initialPhotos={uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
                initialPhotoDescription={photoDescription || undefined}
                onNext={(fmt, angle, sub, photos, desc, pm, pintData, linkedinCar) => {
                  if (pintData) setPinterestData(pintData);
                  if (linkedinCar) setIsLinkedInCarousel(true);
                  else setIsLinkedInCarousel(false);
                  handleFormatNext(fmt, angle, { carouselSubMode: sub, photos, photoDescription: desc, photoMode: pm, linkedinCarousel: !!linkedinCar });
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
                onNext={handleQuestionsNext}
                onSkip={handleSkipQuestions}
                onBack={() => setStep("format")}
                previousBriefsCount={briefsCount}
                initialAnswers={aurianaDemoActive && ideaText === AURIANA_DEMO_SUBJECT && carouselSubMode === "text" && uploadedPhotos.length === 0 ? AURIANA_DEMO_FLOW.answers : undefined}
                onRequestFollowUp={async (currentAnswers) => {
                  return await generateFollowUp({
                    subject: ideaText,
                    answers: currentAnswers,
                    questions,
                    contentType: selectedFormat || "instagram_post",
                    objective: objective || undefined,
                    photos: photoMode && uploadedPhotos.length > 0
                      ? uploadedPhotos.slice(0, 10).map((p) => ({ base64: p.base64, mimeType: p.mimeType, context: p.context }))
                      : undefined,
                    photoMode: photoMode || undefined,
                    photoDescription: photoMode ? photoDescription : undefined,
                  });
                }}
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
                photos={(carouselSubMode === "photo" || carouselSubMode === "mix") ? uploadedPhotos : undefined}
                carouselSubMode={carouselSubMode || "text"}
              />
            )}

            {step === "inspiration_proposals" && (
              inspirationLoading ? (
                <div className="py-12 text-center space-y-3 animate-fade-in">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
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

            {step === "result" && structureLoading && (
              <div className="py-16 text-center space-y-4 animate-fade-in">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                <p className="text-sm font-medium text-foreground">Préparation de la structure de ton carrousel…</p>
                <p className="text-xs text-muted-foreground">L'IA organise tes idées en slides. Ça prend quelques secondes.</p>
              </div>
            )}

            {step === "result" && !isLaunchMode && !generating && !demoGenerating && !streaming && !pinterestVisualGenerating && !structureLoading && !result && (
              <div className="py-12 text-center space-y-4 animate-fade-in">
                {error ? (
                  <p className="text-destructive font-medium">{error}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Session expirée ou contenu indisponible.</p>
                )}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleRegenerate}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
                  >
                    🔄 Réessayer
                  </button>
                  <button
                    onClick={handleReset}
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
                streamingContent={streaming ? streamingContent : undefined}
                photos={(carouselSubMode === "photo" || carouselSubMode === "mix" || (photoMode && uploadedPhotos.length > 0)) ? uploadedPhotos : undefined}
                usedPhotoCount={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos.length : undefined}
                onEdit={handleEdit}
                onReset={handleReset}
                onRegenerate={handleRegenerate}
                onCopy={handleCopy}
                onSave={effectiveHandleSave}
                onCalendar={effectiveHandleAddToCalendar}
                calendarLabel={fromCalendar ? "Sauvegarder dans le calendrier" : undefined}
                onGenerateVisuals={selectedFormat === "carousel" ? handleGenerateVisuals : undefined}
                visualLoading={visualLoading}
                visualSlides={visualSlides.length > 0 ? visualSlides : undefined}
                onExportPptx={selectedFormat === "carousel" ? effectiveHandleExportPptx : undefined}
                onExportVisualPng={selectedFormat === "carousel" && visualSlides.length > 0 ? effectiveHandleExportVisualPng : undefined}
                onExportHybridPptx={selectedFormat === "carousel" && visualSlides.length > 0 ? effectiveHandleExportHybridPptx : undefined}
                pinterestPinHtml={pinterestPinHtml}
                onExportPinterestPng={selectedFormat === "pinterest_visual" ? handleExportPinterestPng : selectedFormat === "pinterest_photo" ? handleExportPhotoBriefPng : undefined}
                onExportPinterestEditablePptx={selectedFormat === "pinterest_visual" ? handleExportPinterestEditablePptx : undefined}
                onSlidesUpdate={selectedFormat === "carousel" ? (slides, caption) => {
                  if (result?.raw) {
                    result.raw.slides = slides;
                    if (result.raw.caption) result.raw.caption = caption;
                    else if (result.raw.carousel?.caption) result.raw.carousel.caption = caption;
                  }
                } : undefined}
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
                  isLinkedInCarousel && (carouselSubMode === "mix" || carouselSubMode === "photo")
                    ? () => { captionAutoTriggeredRef.current = null; generateLinkedInCarouselCaption(); }
                    : undefined
                }
                onChangeAngle={handleChangeAngle}
                currentAngle={editorialAngle}
                currentChannel={
                  selectedFormat === "linkedin" || isLinkedInCarousel ? "linkedin"
                  : selectedFormat?.startsWith("pinterest") ? "pinterest"
                  : "instagram"
                }
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
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
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
                          onReset={handleReset}
                          onRegenerate={handleRegenerate}
                          onCopy={handleCopy}
                          usedPhotoCount={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos.length : undefined}
                          photos={photoMode && uploadedPhotos.length > 0 ? uploadedPhotos : undefined}
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
                  toast.success("Contenu sauvegardé !");
                  setEditContent(edited);
                }}
                onBack={() => setStep("result")}
                onCopy={() => {
                  navigator.clipboard.writeText(editContent);
                  toast.success("Copié !");
                }}
              />
            )}
        </div>
      </div>

      {/* Calendar date dialog */}
      <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Planifier la publication
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Date de publication</label>
              <Input
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <Button
              onClick={handleConfirmCalendar}
              disabled={!calendarDate || savingToCalendar}
              className="w-full gap-2"
            >
              {savingToCalendar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarDays className="h-4 w-4" />
              )}
              {savingToCalendar ? "Ajout en cours..." : "Ajouter au calendrier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
