import { readImportRows, importTarget, saveImportRow } from "@/lib/branding-import-persistence";
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { LocalErrorBoundary } from "@/components/LocalErrorBoundary";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId, useWorkspaceReady } from "@/hooks/use-workspace-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { creationReturnPath } from "@/lib/creation-navigation";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, RefreshCw, CheckCircle2, AlertTriangle, Zap, Download, Lightbulb } from "lucide-react";
import { useBrandingMirror } from "@/hooks/use-branding-mirror";
import { exportMirrorPDF } from "@/lib/mirror-pdf-export";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { resolveFirstContentDestination } from "@/lib/first-content-destination";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { loadIdentityOverview, type IdentityOverview } from "@/lib/identity-overview";
import { useQueryClient } from "@tanstack/react-query";
import BrandingSynthesisSheet from "@/components/branding/BrandingSynthesisSheet";
import BrandingIdentityCard from "@/components/branding/BrandingIdentityCard";
import BrandingDangerZone from "@/components/branding/BrandingDangerZone";
import AuditRecommendationBanner from "@/components/AuditRecommendationBanner";

import BrandingImport from "@/components/branding/BrandingImport";
import BrandEnrichmentWait from "@/components/branding/BrandEnrichmentWait";
import BrandingAnalysisLoader from "@/components/branding/BrandingAnalysisLoader";
import BrandingImportReview from "@/components/branding/BrandingImportReview";
import BrandingReview, { type AnalysisResult } from "@/components/branding/BrandingReview";
import CoachingFlow from "@/components/CoachingFlow";
import type { BrandingExtraction } from "@/lib/branding-import-types";
import { extractTextFromFile } from "@/lib/file-extractors";
import { useDemoContext } from "@/contexts/DemoContext";

import { DEMO_AUTOFILL_RESULT } from "@/lib/demo-autofill-data";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";

// Map completion keys to analysis section keys
const COMPLETION_TO_SECTION: Record<string, string> = {
  storytelling: "story",
  persona: "persona",
  proposition: "value_proposition",
  tone: "tone_style",
  strategy: "content_strategy",
};

export default function BrandingPage() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  if (!isDemoMode && (!ready || !user?.id || !value)) return <div role="status" className="p-8">Chargement de mon activité…</div>;
  return <ScopedBrandingPage key={`${user?.id}:${isDemoMode}:${column}:${value}`} />;
}

function ScopedBrandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const { loading: workspaceLoading } = useWorkspace();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const [completion, setCompletion] = useState<BrandingCompletion>({ storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, offers: 0, charter: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [overview, setOverview] = useState<IdentityOverview | null>(null);
  const [reviewDeferred, setReviewDeferred] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [importPhase, setImportPhase] = useState<'idle' | 'reviewing'>('idle');
  const [importExtraction, setImportExtraction] = useState<BrandingExtraction | null>(null);
  const [importAnalyzing, setImportAnalyzing] = useState(false);
  const [forceImport, setForceImport] = useState(false);
  const hiddenSuggestions = useRef(new Set<string>());
  const [auditSuggestions, setAuditSuggestions] = useState<Record<string, string>>({});
  const [importPhaseNew, setImportPhaseNew] = useState<"form" | "analyzing" | "error" | "reviewing">("form");
  const [analysisSources, setAnalysisSources] = useState<{ website?: string; instagram?: string; linkedin?: string; hasDocuments?: boolean }>({});
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastImportData, setLastImportData] = useState<{ website?: string; instagram?: string; linkedin?: string; files: File[] } | null>(null);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  // Onboarding : la fiche « à valider » est produite par l'IA lourde (Opus,
  // ~30-90s). Tant qu'elle n'est pas arrivée, on affiche un écran d'attente
  // plutôt que de retomber sur l'accueil marque vide.
  const [awaitingEnrichment, setAwaitingEnrichment] = useState(false);
  const { mirrorOpen, setMirrorOpen, mirrorLoading, mirrorData, refreshMirror } = useBrandingMirror();
  // Reanalyze mode
  const [reanalyzeMode, setReanalyzeMode] = useState(false);
  const [reanalyzeUrls, setReanalyzeUrls] = useState<{ website?: string; instagram?: string; linkedin?: string }>({});
  // Pre-filled sections detection
  const [preFilledSections, setPreFilledSections] = useState<Set<string>>(new Set());


  // Analytics logging helper — PostHog, PAS ai_usage : ai_usage est la table de
  // FACTURATION (checkQuota compte toutes ses lignes du mois dans le quota),
  // y écrire de la télémétrie brûlait des crédits gratuits à chaque autofill.
  const logEvent = useCallback(async (eventType: string) => {
    if (!user?.id || isDemoMode) return;
    try {
      posthog.capture(eventType, { source: "branding_autofill", workspace_id: workspaceId !== user.id ? workspaceId : null });
    } catch { /* silent */ }
  }, [user?.id, workspaceId, isDemoMode]);

  const fromAudit = searchParams.get("from") === "audit";
  const coachingModule = searchParams.get("module");
  const coachingRecId = searchParams.get("rec_id") || undefined;
  // Fin d'onboarding : on arrive ici pour RELIRE + VALIDER la marque captée par
  // le diagnostic (au lieu de sauter direct sur /creer). `next=creer` = une fois
  // validée, on enchaîne sur « générer mon 1er contenu ».
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const nextTarget = searchParams.get("next");
  const creationLocation = useLocation();
  const returnToCreation = creationReturnPath(searchParams.get("returnTo"));
  const creationReturnState = creationLocation.state?.creationReturnState;
  const [coachingActive, setCoachingActive] = useState(fromAudit && !!coachingModule);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        if (isDemoMode && demoData) {
          const d = demoData as any;
          const publicRow = { id: "demo-public", description: d.persona.metier };
          const data: IdentityOverview = {
            storytellingList: [{ id: "demo-story", step_7_polished: d.branding.story }],
            publics: [publicRow], persona: publicRow,
            proposition: { version_final: d.branding.positioning, step_2a_process: d.branding.unique_proposition },
            brandProfile: { voice_description: d.branding.tone.description }, strategy: null,
            offersList: d.offers, charter: null,
          };
          setOverview(data); setCompletion(calculateBrandingCompletion(data));
          return;
        }
        const scoped = (table: string, fields: string) => {
          let q = (supabase.from(table as any) as any).select(fields).eq(column, value);
          if (column === "user_id") q = q.is("workspace_id", null);
          return q;
        };
        const [data, audit, pending] = await Promise.all([
          loadIdentityOverview(column, value),
          scoped("branding_audits", "id, created_at, score_global, audit_detail").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          scoped("branding_autofill", "id, analysis_result, website_url, instagram_handle, linkedin_url").eq("autofill_status", "pending_review").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (cancelled) return;
        if (audit.error || pending.error) throw audit.error || pending.error;
        setOverview(data);
        const comp = calculateBrandingCompletion(data);
        setCompletion(comp);
        setPreFilledSections(new Set(Object.entries(COMPLETION_TO_SECTION).filter(([key]) => comp[key as keyof BrandingCompletion] > 0).map(([, section]) => section)));
        const auditToSection: Record<string, string> = { positionnement: "proposition", cible: "persona", ton_voix: "tone", offres: "offers", storytelling: "storytelling", contenu: "strategy" };
        const suggestions: Record<string, string> = {};
        for (const [key, pillar] of Object.entries(audit.data?.audit_detail || {})) {
          if (auditToSection[key] && !hiddenSuggestions.current.has(auditToSection[key]) && (pillar as any)?.suggestion_amelioration) suggestions[auditToSection[key]] = (pillar as any).suggestion_amelioration;
        }
        setAuditSuggestions(suggestions);
        if (pending.data?.analysis_result) {
          setPendingReviewId(pending.data.id);
          setAnalysisResult(pending.data.analysis_result);
          setImportPhaseNew("reviewing");
          setReanalyzeUrls({ website: pending.data.website_url || "", instagram: pending.data.instagram_handle || "", linkedin: pending.data.linkedin_url || "" });
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isDemoMode, demoData, column, value, retryKey]);

  // Onboarding → attente de la fiche « à valider ». L'enrichment (Opus) tourne
  // en fire-and-forget depuis la fin du diagnostic ; on poll `branding_autofill`
  // jusqu'à ce que la ligne pending_review apparaisse, puis on ouvre la review.
  // Filet de sécurité : au bout de ~90s sans résultat, on ne bloque pas — on
  // laisse créer quand même (fallback /creer).
  useEffect(() => {
    if (!fromOnboarding || isDemoMode || !user || workspaceLoading) return;
    if (analysisResult) return; // fiche déjà chargée (fast path via load())
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const MAX_ATTEMPTS = 45; // ~90s à 2s d'intervalle
    setAwaitingEnrichment(true);
    const tick = async () => {
      attempts += 1;
      let pendingQuery = (supabase.from("branding_autofill") as any)
        .select("id, analysis_result, sources_used, sources_failed, website_url, instagram_handle, linkedin_url")
        .eq(column, value);
      if (column === "user_id") pendingQuery = pendingQuery.is("workspace_id", null);
      const { data: pending } = await pendingQuery.eq("autofill_status", "pending_review")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (pending?.analysis_result) {
        setPendingReviewId(pending.id);
        setAnalysisResult(pending.analysis_result as AnalysisResult);
        setImportPhaseNew("reviewing");
        setReanalyzeUrls({
          website: pending.website_url || "",
          instagram: pending.instagram_handle || "",
          linkedin: pending.linkedin_url || "",
        });
        setAwaitingEnrichment(false);
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setAwaitingEnrichment(false);
        const dest = returnToCreation || await resolveFirstContentDestination({ column, value, userId: user.id });
        if (!cancelled) navigate(dest, { replace: true, state: creationReturnState });
        return;
      }
      timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [fromOnboarding, isDemoMode, user?.id, workspaceLoading, column, value, analysisResult, navigate]);

  const reloadCompletion = async () => {
    if (mounted.current) setRetryKey(key => key + 1);
  };

  const handleImportDone = async () => {
    setImportPhase('idle');
    setImportExtraction(null);
    await reloadCompletion();
  };

  const handleStartAnalysis = async (data: { website?: string; instagram?: string; linkedin?: string; files: File[] }) => {
    if (!mounted.current) return;
    // Demo mode: simulate analysis
    if (isDemoMode) {
      setLastImportData(data);
      setImportAnalyzing(true);
      setAnalysisSources({ website: data.website, instagram: data.instagram, linkedin: data.linkedin, hasDocuments: data.files.length > 0 });
      setTimeout(() => { if (mounted.current) setImportPhaseNew("analyzing"); }, 500);
      // Simulate 3-second delay
      setTimeout(() => {
        if (!mounted.current) return;
        setAnalysisResult(DEMO_AUTOFILL_RESULT);
        setImportAnalyzing(false);
        setImportPhaseNew("reviewing");
      }, 3500);
      return;
    }

    setLastImportData(data);
    setImportAnalyzing(true);
    setAnalysisError(null);
    setAnalysisSources({ website: data.website, instagram: data.instagram, linkedin: data.linkedin, hasDocuments: data.files.length > 0 });
    setReanalyzeUrls({ website: data.website, instagram: data.instagram, linkedin: data.linkedin });

    // Log event
    logEvent("autofill_started");

    try {
      // Validate at least one source is provided
      const hasSource = data.website?.trim() || data.instagram?.trim() || data.linkedin?.trim() || (data.files && data.files.length > 0);
      if (!hasSource) {
        toast.error("Ajoute au moins un lien (site web, Instagram ou LinkedIn) pour lancer l'analyse.");
        setImportAnalyzing(false);
        setImportPhaseNew("form");
        return;
      }

      // Normalize website URL
      let normalizedWebsite = data.website?.trim() || null;
      if (normalizedWebsite && !normalizedWebsite.startsWith("http://") && !normalizedWebsite.startsWith("https://")) {
        normalizedWebsite = `https://${normalizedWebsite}`;
      }
      if (normalizedWebsite) {
        try { new URL(normalizedWebsite); } catch {
          toast.error("URL invalide : vérifie l'adresse de ton site web.");
          setImportAnalyzing(false);
          setImportPhaseNew("form");
          return;
        }
      }

      // Extract text from uploaded files (client-side)
      let documentText: string | null = null;
      if (data.files && data.files.length > 0) {
        const parts: string[] = [];
        for (const file of data.files) {
          try {
            const text = await extractTextFromFile(file);
            if (text.trim().length > 0) parts.push(`[Document: ${file.name}]\n${text.trim()}`);
          } catch (err) {
            console.warn(`Impossible de lire ${file.name}:`, err);
          }
        }
        if (parts.length > 0) {
          documentText = parts.join("\n\n--- DOCUMENT SUIVANT ---\n\n");
          if (documentText.length > 100000) {
            documentText = documentText.slice(0, 100000);
          }
        } else if (!normalizedWebsite && !data.instagram && !data.linkedin) {
          toast.error("Impossible d'extraire le texte de tes fichiers. Vérifie qu'ils ne sont pas des scans (images) et qu'ils sont bien au format PDF, Word ou texte.", { duration: 8000 });
          setImportAnalyzing(false);
          setImportPhaseNew("form");
          return;
        }
      }

      // Bascule sur l'écran d'analyse UNIQUEMENT quand l'appel réel démarre
      // (après les validations). Évite qu'un minuteur parasite ré-écrase l'état
      // "error" quand l'analyse échoue en moins d'une seconde (spinner infini).
      if (!mounted.current) return;
      setImportPhaseNew("analyzing");

      const { data: result, error } = await invokeWithTimeout("analyze-brand", {
        body: {
          userId: user?.id,
          websiteUrl: normalizedWebsite,
          instagramHandle: data.instagram || null,
          linkedinUrl: data.linkedin || null,
          documentIds: [],
          documentText: documentText,
          workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
        },
      }, 120000);

      if (!mounted.current) return;
      if (error) {
        throw new Error(error.message);
      }
      if (!result?.success) throw new Error(result?.error || "Analyse échouée");

      // Save autofill status
      if (result.id) {
        const { error: statusError } = await (supabase.from("branding_autofill") as any).update({ autofill_status: "pending_review" }).eq("id", result.id);
        if (statusError) throw statusError;
      }

      if (!mounted.current) return;
      setReviewDeferred(false);
      // Log completion
      logEvent("autofill_completed");

      setPendingReviewId(result.id || null);
      setAnalysisResult(result.analysis);
      setImportAnalyzing(false);
      setImportPhaseNew("reviewing");
    } catch (e: any) {
      if (!mounted.current) return;
      console.error("Analysis error:", e);
      const errorMsg = e?.message || "Erreur inconnue";
      const userMsg = errorMsg.includes("Aucune source")
        ? "Aucune de tes sources n'a pu être analysée. Vérifie que tes liens sont accessibles publiquement et réessaie."
        : `L'analyse a échoué : ${errorMsg}`;
      toast.error(userMsg);
      setImportAnalyzing(false);
      setAnalysisError(userMsg);
      setImportPhaseNew("error");
    }
  };

  const handleReanalyzeWithBio = (bio: string) => {
    // Re-run analysis with bio as extra context
    const data = lastImportData || { files: [] };
    // We'll pass the bio via documentIds mechanism or as a note
    // For now, append bio to website text
    setImportPhaseNew("form");
    setTimeout(() => {
      handleStartAnalysis({
        ...data,
        // The bio will be used as additional context
        instagram: `${data.instagram || ""} [BIO: ${bio}]`,
        files: data.files || [],
      });
    }, 100);
  };

  const handleSkipImport = () => {
    setForceImport(false);
    if (reanalyzeMode) {
      setReanalyzeMode(false);
      setImportPhaseNew("form");
      return;
    }
    localStorage.setItem(`branding_skip_import_${workspaceId}`, "true");
    logEvent("autofill_abandoned");
  };

  const handleStartReanalyze = () => {
    setReanalyzeMode(true);
    setImportPhaseNew("form");
    setAnalysisResult(null);
  };

  // Import is an explicit action; an incomplete identity never replaces this page with onboarding.
  const showNewImport = reanalyzeMode || forceImport;

  // Determine which top-level view to show: "loading" | "error" | "awaiting" | "import" | "review" | "identity"
  const topView: "loading" | "error" | "awaiting" | "import" | "review" | "identity" = loading
    ? "loading"
    : loadError
      ? "error"
      : (importPhaseNew === "reviewing" && analysisResult && !reviewDeferred)
        ? "review"
        : awaitingEnrichment
          ? "awaiting"
          : showNewImport
            ? "import"
            : "identity";

  return (
    <div className="min-h-screen bg-background [--primary:330_50%_20%] dark:[--primary:338_72%_83%]">
      <AppHeader />
      <main className="mx-auto max-w-[1120px] px-6 py-8 max-md:px-4">
        {/* ⚠️ PAS d'AnimatePresence ici. La sortie animée du squelette de
            chargement ne se terminait jamais (onExitComplete jamais émis sous la
            charge de re-renders du live) → AnimatePresence churnait et REMONTAIT
            en boucle la vue active → son animation d'entrée restait figée à
            opacity 0 = écran « blanc » (même famille que l'onboarding #267, et
            #283 — retrait `mode="wait"` — était insuffisant). Sans AnimatePresence,
            chaque vue est un simple rendu conditionnel : montée une seule fois,
            son fade d'entrée se termine. */}
        <>
          {/* === LOADING === */}
          {topView === "loading" && (
            <motion.div key="loading" initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              <div className="space-y-4">
                <div className="h-6 w-52 rounded-lg bg-muted animate-pulse" />
                <div className="h-3 w-80 rounded bg-muted animate-pulse" />
                <div className="rounded-2xl border border-border bg-card/60 p-5 mt-4 animate-pulse">
                  <div className="h-4 w-64 rounded bg-muted mb-2" />
                  <div className="h-3 w-48 rounded bg-muted" />
                </div>
                <div className="space-y-3 mt-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3 animate-pulse">
                      <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-36 rounded bg-muted" />
                        <div className="h-3 w-56 rounded bg-muted" />
                      </div>
                      <div className="h-5 w-14 rounded-full bg-muted shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* === ERREUR DE CHARGEMENT === */}
          {topView === "error" && (
            <motion.div key="error" initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4 mt-8">
                <h2 className="text-xl font-semibold">Impossible de charger ton identité de marque</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Les informations ne sont pas disponibles pour le moment. Réessaie avant de les modifier.
                </p>
                <Button onClick={() => setRetryKey((k) => k + 1)}>Réessayer</Button>
              </div>
            </motion.div>
          )}

          {/* === IMPORT === */}
          {topView === "import" && importPhaseNew === "form" && (
            <motion.div key="form" initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <BrandingImport
                loading={importAnalyzing}
                onAnalyze={handleStartAnalysis}
                onSkip={handleSkipImport}
                initialWebsite={reanalyzeUrls.website}
                reanalyzeWarning={reanalyzeMode}
              />
            </motion.div>
          )}
          {topView === "import" && (importPhaseNew === "analyzing" || importPhaseNew === "error") && (
            <motion.div key="loader" initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <BrandingAnalysisLoader
                sources={analysisSources}
                error={importPhaseNew === "error" ? analysisError : null}
                onRetry={() => {
                  setImportPhaseNew("form");
                  setImportAnalyzing(false);
                  setAnalysisError(null);
                  if (lastImportData) {
                    setTimeout(() => handleStartAnalysis(lastImportData), 100);
                  }
                }}
                onSkip={handleSkipImport}
              />
            </motion.div>
          )}

          {/* === ATTENTE ENRICHMENT (onboarding) === */}
          {topView === "awaiting" && (
            <motion.div key="awaiting" initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              <BrandEnrichmentWait />
            </motion.div>
          )}

          {/* === REVIEW === */}
          {topView === "review" && analysisResult && (
            <motion.div key="review" initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <BrandingReview
                key={`${value}:${pendingReviewId || "new"}`}
                onProgress={async (sections) => {
                  if (isDemoMode) return;
                  if (!pendingReviewId || !user?.id) throw new Error("Import indisponible. Recharge la page.");
                  await saveImportRow("branding_autofill", { column, value, userId: user.id }, pendingReviewId, {
                    analysis_result: { ...analysisResult, reviewed_sections: sections },
                  });
                }}
                analysis={analysisResult}
                sourcesUsed={analysisResult.sources_used || []}
                sourcesFailed={analysisResult.sources_failed || []}
                preFilledSections={preFilledSections}
                onReanalyzeWithBio={handleReanalyzeWithBio}
                // Parcours d'inscription : valider sa fiche EST l'étape en cours.
                // On retire donc « finir plus tard » — la création attend la fiche.
                mandatory={fromOnboarding}
                onDone={async (complete = true) => {
                  if (complete && user?.id && !isDemoMode) {
                    try {
                      if (!pendingReviewId) throw new Error("Import indisponible");
                      await saveImportRow("branding_autofill", { column, value, userId: user.id }, pendingReviewId,
                        { autofill_status: "completed", autofill_pending_review: false });
                    } catch {
                      toast.error("Impossible d'enregistrer la validation de ta fiche. Réessaie.");
                      return;
                    }
                    // Idem : la garde de /creer doit relire la vérité tout de suite.
                    queryClient.invalidateQueries({ queryKey: ["pending-brand-review"] });
                  }
                  if (!mounted.current) return;
                  setReviewDeferred(!complete);
                  setImportPhaseNew(complete ? "form" : "reviewing");
                  if (complete) { setAnalysisResult(null); setPendingReviewId(null); }
                                setReanalyzeMode(false);
                  setForceImport(false);
                  localStorage.setItem(`branding_skip_import_${workspaceId}`, "true");
                  // Onboarding : la marque validée, on enchaîne sur « générer mon
                  // 1er contenu ». Le cas import (fromOnboarding=false) reste sur
                  // l'accueil marque comme avant.
                  if (complete && fromOnboarding && nextTarget === "creer") {
                    const dest = returnToCreation || await resolveFirstContentDestination({ column, value, userId: user?.id });
                    if (!mounted.current) return;
                    navigate(dest, { replace: true, state: creationReturnState });
                    return;
                  }
                  await reloadCompletion();
                }}
              />
            </motion.div>
          )}

          {/* === IDENTITY === */}
          {topView === "identity" && overview && (
            <motion.div key="identity" initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
              </Link>



              {!coachingActive && <AuditRecommendationBanner />}
              {coachingActive && coachingModule && (
                <div className="mb-6">
                  <CoachingFlow
                    module={coachingModule}
                    recId={coachingRecId}
                    onComplete={async () => { setCoachingActive(false); setSearchParams({}); await reloadCompletion(); }}
                    onSkip={() => { setCoachingActive(false); setSearchParams({}); }}
                  />
                </div>
              )}

              {showSynthesis ? (
                <LocalErrorBoundary fallbackMessage="Erreur lors du chargement de la synthèse.">
                  <BrandingSynthesisSheet onClose={() => setShowSynthesis(false)} />
                </LocalErrorBoundary>
              ) : importPhase === 'reviewing' && importExtraction ? (
                <BrandingImportReview
                  extraction={importExtraction}
                  onDone={handleImportDone}
                  onCancel={() => { setImportPhase('idle'); setImportExtraction(null); }}
                />
              ) : (
                <>
                  <BrandingIdentityCard
                    data={overview}
                    onReanalyze={!isDemoMode && completion.total > 0 ? handleStartReanalyze : undefined}
                    onImport={() => { setForceImport(true); setImportPhaseNew("form"); setImportAnalyzing(false); }}
                    onShowSynthesis={() => setShowSynthesis(true)}
                    pendingReview={!!analysisResult && reviewDeferred}
                    onReview={() => { setReviewDeferred(false); setImportPhaseNew("reviewing"); }}
                    auditSuggestions={auditSuggestions}
                    onApplySuggestion={async (sectionKey: string, suggestion: string) => {
                      const fCol = column;
                      const fVal = value;
                      if (!fVal) return;
                      try {
                        if (!user?.id) return;
                        const scope = { column: fCol, value: fVal, userId: user.id };
                        const mappings: Record<string, { table: string; field: string }> = {
                          proposition: { table: "brand_proposition", field: "version_final" },
                          persona: { table: "persona", field: "step_2_transformation" },
                          offers: { table: "brand_profile", field: "offer" },
                          tone: { table: "brand_profile", field: "voice_description" },
                          storytelling: { table: "storytelling", field: "step_7_polished" },
                          strategy: { table: "brand_profile", field: "content_editorial_line" },
                        };
                        const mapping = mappings[sectionKey];
                        if (!mapping) throw new Error("Suggestion non prise en charge.");
                        const rows = await readImportRows(mapping.table, scope);
                        if (!mounted.current) return;
                        // General recommendations cannot choose among several personal stories/publics.
                        const target = importTarget(rows);
                        await saveImportRow(mapping.table, scope, target?.id || null, { [mapping.field]: suggestion });
                        if (!mounted.current) return;
                      hiddenSuggestions.current.add(sectionKey);
                      setAuditSuggestions(prev => { const next = { ...prev }; delete next[sectionKey]; return next; });
                        toast.success(sectionKey === "offers" ? "Description générale des offres mise à jour. Les fiches individuelles sont conservées." : "✅ Suggestion appliquée !");
                        queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
                        queryClient.invalidateQueries({ queryKey: ["brand-proposition"] });
                        queryClient.invalidateQueries({ queryKey: ["persona"] });
                        queryClient.invalidateQueries({ queryKey: ["storytelling-primary"] });
                        queryClient.invalidateQueries({ queryKey: ["storytelling-list"] });
                        await reloadCompletion();
                      } catch (e) {
                        if (mounted.current) toast.error(e instanceof Error ? e.message : "Erreur lors de l'application");
                      }
                    }}
                    onDismissSuggestion={(sectionKey: string) => {
                      if (!mounted.current) return;
                      hiddenSuggestions.current.add(sectionKey);
                      setAuditSuggestions(prev => { const next = { ...prev }; delete next[sectionKey]; return next; });
                      toast("Suggestion ignorée");
                    }}
                  />
                  {!isDemoMode && completion.total > 0 && <BrandingDangerZone />}
                </>
              )}
            </motion.div>
          )}
        </>
      </main>

      <Sheet open={mirrorOpen} onOpenChange={setMirrorOpen}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-lg font-display flex items-center gap-2"><Eye className="h-5 w-5 text-primary" strokeWidth={1.75} /> Mirror</SheetTitle>
          </SheetHeader>
          {mirrorLoading ? (
            <div className="py-6"><AiLoadingIndicator context="branding" isLoading={mirrorLoading} /></div>
          ) : mirrorData ? (
            <div className="space-y-6 mt-4">
              <div className="text-center space-y-2">
                <p className="text-4xl font-bold font-display" style={{ color: mirrorData.coherence_score >= 70 ? 'hsl(var(--chart-2))' : mirrorData.coherence_score >= 40 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))' }}>{mirrorData.coherence_score}/100</p>
                <Progress value={mirrorData.coherence_score} className="h-2.5 mx-auto max-w-[200px]" />
                <p className="text-xs text-muted-foreground">Score de cohérence</p>
              </div>
              <p className="text-sm text-foreground leading-relaxed bg-muted/50 rounded-xl p-3 border border-border">{mirrorData.summary}</p>
              {mirrorData.alignments?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-chart-2" /> Ce qui est aligné</h4>
                  <div className="space-y-2">{mirrorData.alignments.map((a: any, i: number) => <div key={i} className="rounded-lg bg-chart-2/10 border border-chart-2/20 p-3"><p className="text-xs font-semibold text-foreground">{a.aspect}</p><p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p></div>)}</div>
                </div>
              )}
              {mirrorData.gaps?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-chart-4" /> Les écarts à ajuster</h4>
                  <div className="space-y-2">{mirrorData.gaps.map((g: any, i: number) => <div key={i} className="rounded-lg bg-chart-4/10 border border-chart-4/20 p-3 space-y-1"><p className="text-xs font-semibold text-foreground">{g.aspect}</p><p className="text-xs text-muted-foreground"><span className="font-medium">Déclaré :</span> {g.declared}</p><p className="text-xs text-muted-foreground"><span className="font-medium">Réalité :</span> {g.actual}</p><p className="text-xs text-primary font-medium mt-1"><Lightbulb className="inline h-3.5 w-3.5 mr-1 -mt-0.5" strokeWidth={1.75} />{g.suggestion}</p></div>)}</div>
                </div>
              )}
              {mirrorData.quick_wins?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Zap className="h-4 w-4 text-primary" /> 3 quick wins</h4>
                  <div className="space-y-1.5">{mirrorData.quick_wins.map((qw: string, i: number) => <div key={i} className="flex gap-2 text-xs text-foreground"><span className="text-primary font-bold shrink-0">{i + 1}.</span><span>{qw}</span></div>)}</div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={refreshMirror}><RefreshCw className="h-3.5 w-3.5" /> Refaire l'analyse</Button>
                <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={() => exportMirrorPDF(mirrorData)}><Download className="h-3.5 w-3.5" /> Exporter PDF</Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
