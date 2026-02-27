import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMergedProfile, useBrandProfile } from "@/hooks/use-profile";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Pencil, Sparkles, ClipboardList, RefreshCw, Loader2, LayoutGrid, ListOrdered, CheckCircle2, AlertTriangle, Zap, Download } from "lucide-react";
import { exportMirrorPDF } from "@/lib/mirror-pdf-export";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { supabase } from "@/integrations/supabase/client";
import { usePersona, useBrandProposition, useStorytelling } from "@/hooks/use-branding";
import { useQueryClient } from "@tanstack/react-query";
import BrandingSynthesisSheet from "@/components/branding/BrandingSynthesisSheet";
import GuidedTimeline from "@/components/branding/GuidedTimeline";
import BrandingIdentityCard from "@/components/branding/BrandingIdentityCard";
import AuditRecommendationBanner from "@/components/AuditRecommendationBanner";
import BrandingImportBlock from "@/components/branding/BrandingImportBlock";
import BrandingImport from "@/components/branding/BrandingImport";
import BrandingAnalysisLoader from "@/components/branding/BrandingAnalysisLoader";
import BrandingImportReview from "@/components/branding/BrandingImportReview";
import BrandingReview, { type AnalysisResult } from "@/components/branding/BrandingReview";
import CoachingFlow from "@/components/CoachingFlow";
import type { BrandingExtraction } from "@/lib/branding-import-types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useDemoContext } from "@/contexts/DemoContext";
import { DEMO_DATA } from "@/lib/demo-data";
import { DEMO_AUTOFILL_RESULT } from "@/lib/demo-autofill-data";
import { toast } from "sonner";
import { SkeletonCard } from "@/components/ui/skeleton-card";

interface BrandingCard {
  emoji: string;
  title: string;
  description: string;
  stepperRoute: string;
  recapRoute: string;
  scoreKey: keyof Omit<BrandingCompletion, "total">;
}

const CARDS: BrandingCard[] = [
  { emoji: "📖", title: "Mon histoire", description: "Raconte ton projet en quelques lignes, l'IA structure tout.", stepperRoute: "/branding/simple/story", recapRoute: "/branding/section?section=story", scoreKey: "storytelling" },
  { emoji: "👩‍💻", title: "Mon client·e idéal·e", description: "3 questions simples et l'IA crée ta fiche persona.", stepperRoute: "/branding/simple/persona", recapRoute: "/branding/section?section=persona", scoreKey: "persona" },
  { emoji: "❤️", title: "Ma proposition de valeur", description: "Dis ce que tu fais, l'IA formule ta proposition.", stepperRoute: "/branding/simple/proposition", recapRoute: "/branding/section?section=value_proposition", scoreKey: "proposition" },
  { emoji: "🎨", title: "Ma voix & mes combats", description: "Choisis ta vibe, l'IA définit ton ton.", stepperRoute: "/branding/simple/tone", recapRoute: "/branding/section?section=tone_style", scoreKey: "tone" },
  { emoji: "🍒", title: "Ma ligne éditoriale", description: "Générée automatiquement à partir de ton branding.", stepperRoute: "/branding/simple/strategy", recapRoute: "/branding/section?section=content_strategy", scoreKey: "strategy" },
  { emoji: "🎁", title: "Mes offres", description: "Décris tes offres simplement, l'IA les structure.", stepperRoute: "/branding/simple/offers", recapRoute: "/branding/offres", scoreKey: "charter" },
  { emoji: "🎨", title: "Ma charte graphique", description: "Tes couleurs, typos, logo et style visuel.", stepperRoute: "/branding/charter", recapRoute: "/branding/charter", scoreKey: "charter" },
];

const RECOMMENDATIONS: Record<string, { low: string; mid: string; high: string; done: string }> = {
  storytelling: { low: "Commence par raconter ton moment déclic. 5 minutes suffisent.", mid: "Ton histoire prend forme ! Il te manque le texte final poli.", high: "Presque terminé. Laisse l'IA t'aider à peaufiner ton récit.", done: "Ton histoire est prête. Tu peux en faire un post ou un carousel." },
  persona: { low: "Décris les frustrations de ta cliente idéale pour démarrer.", mid: "Bon début ! Creuse sa transformation rêvée pour compléter.", high: "Il te manque les détails esthétiques et ses premières actions.", done: "Ta cliente idéale est définie. Utilise-la dans tes contenus." },
  proposition: { low: "Commence par répondre : qu'est-ce que tu fais, pour qui, et pourquoi ?", mid: "Tu as les bases. Il te manque ta phrase de positionnement finale.", high: "Presque ! Finalise ta version courte et ton one-liner.", done: "Ta proposition de valeur est claire. Parfait pour ta bio et tes pitchs." },
  tone: { low: "Définis comment tu parles : plutôt tutoiement ou vouvoiement ? Direct ou doux ?", mid: "Ton registre est posé. Ajoute tes combats et ce que tu refuses.", high: "Il te manque tes expressions clés et ce qu'on évite.", done: "Ta voix est définie. L'IA l'utilisera dans tous tes contenus." },
  strategy: { low: "Choisis tes 3 grands sujets de contenu pour commencer.", mid: "Tes piliers sont là. Ajoute ton concept créatif.", high: "Presque ! Affine tes facettes cachées pour te démarquer.", done: "Ta stratégie est solide. Lance-toi dans la création !" },
  charter: { low: "Commence par uploader ton logo ou choisir tes couleurs.", mid: "Ta charte prend forme ! Ajoute tes typos et ton style visuel.", high: "Presque ! Il te manque ton style photo ou tes mots-clés visuels.", done: "Ta charte graphique est complète. Ton identité visuelle est posée." },
};

function getRecommendation(scoreKey: string, pValue: number): string {
  const rec = RECOMMENDATIONS[scoreKey];
  if (!rec) return "";
  if (pValue === 100) return rec.done;
  if (pValue >= 50) return rec.high;
  if (pValue > 0) return rec.mid;
  return rec.low;
}

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { profile: hookProfile, brandProfile: hookBrandProfile } = useMergedProfile();
  const { data: personaHook } = usePersona();
  const { data: propositionHook } = useBrandProposition();
  const { data: storytellingHook } = useStorytelling();
  const queryClient = useQueryClient();
  const [completion, setCompletion] = useState<BrandingCompletion>({ storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, charter: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [primaryStoryId, setPrimaryStoryId] = useState<string | null>(null);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [importPhase, setImportPhase] = useState<'idle' | 'reviewing'>('idle');
  const [importExtraction, setImportExtraction] = useState<BrandingExtraction | null>(null);
  const [showImportBlock, setShowImportBlock] = useState(false);
  const [skipImport, setSkipImport] = useState(() => {
    try { return localStorage.getItem("branding_skip_import") === "true"; } catch { return false; }
  });
  const [importAnalyzing, setImportAnalyzing] = useState(false);
  const [lastAudit, setLastAudit] = useState<any>(null);
  const [importPhaseNew, setImportPhaseNew] = useState<"form" | "analyzing" | "error" | "reviewing">("form");
  const [analysisSources, setAnalysisSources] = useState<{ website?: string; instagram?: string; linkedin?: string; hasDocuments?: boolean }>({});
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastImportData, setLastImportData] = useState<{ website?: string; instagram?: string; linkedin?: string; files: File[] } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [hasEnoughData, setHasEnoughData] = useState(false);
  const [hasProposition, setHasProposition] = useState(false);
  const [generatingProp, setGeneratingProp] = useState(false);
  const [viewMode, setViewMode] = useState<"free" | "guided">(() => {
    try { return (localStorage.getItem("branding_mode") as "free" | "guided") || "free"; } catch { return "free"; }
  });
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [mirrorData, setMirrorData] = useState<any>(null);
  // Reanalyze mode
  const [reanalyzeMode, setReanalyzeMode] = useState(false);
  const [reanalyzeUrls, setReanalyzeUrls] = useState<{ website?: string; instagram?: string; linkedin?: string }>({});
  // Pre-filled sections detection
  const [preFilledSections, setPreFilledSections] = useState<Set<string>>(new Set());
  const [sectionSummaries, setSectionSummaries] = useState<any>({});

  const canShowMirror = completion.tone > 0 && !!lastAudit;

  // Analytics logging helper
  const logEvent = useCallback(async (eventType: string) => {
    if (!user?.id || isDemoMode) return;
    try {
      await supabase.from("ai_usage").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : null,
        action_type: eventType,
        category: "autofill",
        model_used: null,
        tokens_used: null,
      } as any);
    } catch { /* silent */ }
  }, [user?.id, workspaceId, isDemoMode]);

  const runMirror = async () => {
    setMirrorOpen(true);
    if (mirrorData) return;
    setMirrorLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("branding-mirror");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMirrorData(data);
      const wsId = workspaceId !== user?.id ? workspaceId : undefined;
      await supabase.from("branding_mirror_results").upsert({
        user_id: user?.id ?? "",
        workspace_id: wsId || null,
        coherence_score: data.coherence_score,
        summary: data.summary,
        alignments: data.alignments,
        gaps: data.gaps,
        quick_wins: data.quick_wins,
      }, { onConflict: "user_id" }).then(({ error: saveErr }) => {
        if (saveErr) console.error("Mirror save error:", saveErr);
      });
    } catch (e: any) {
      console.error("Mirror error:", e);
      const { friendlyError } = await import("@/lib/error-messages");
      toast.error(friendlyError(e));
      setMirrorOpen(false);
    } finally {
      setMirrorLoading(false);
    }
  };

  const fromAudit = searchParams.get("from") === "audit";
  const coachingModule = searchParams.get("module");
  const coachingRecId = searchParams.get("rec_id") || undefined;
  const [coachingActive, setCoachingActive] = useState(fromAudit && !!coachingModule);

  useEffect(() => {
    if (isDemoMode) {
      setCompletion({ storytelling: 100, persona: 100, proposition: 100, tone: 80, strategy: 70, charter: 0, total: DEMO_DATA.branding.completion });
      setPrimaryStoryId("demo-story");
      setHasEnoughData(true);
      setHasProposition(true);
      setLastAudit({ id: "demo-audit", created_at: new Date().toISOString(), score_global: DEMO_DATA.audit.score, points_forts: DEMO_DATA.audit.points_forts, points_faibles: DEMO_DATA.audit.points_faibles });
      setLoading(false);
      return;
    }
    if (!user) return;
    const load = async () => {
      const data = await fetchBrandingData({ column, value });
      const comp = calculateBrandingCompletion(data);
      setCompletion(comp);

      // Detect pre-filled sections
      const filled = new Set<string>();
      if (comp.storytelling > 0) filled.add("story");
      if (comp.persona > 0) filled.add("persona");
      if (comp.proposition > 0) filled.add("value_proposition");
      if (comp.tone > 0) filled.add("tone_style");
      if (comp.strategy > 0) filled.add("content_strategy");
      setPreFilledSections(filled);

      const enough = !!(data.persona?.step_1_frustrations && data.storytellingList && data.storytellingList.length > 0);
      setHasEnoughData(enough);
      setHasProposition(!!(data.proposition?.version_pitch_naturel));

      if (data.storytellingList && data.storytellingList.length > 0) {
        const primary = data.storytellingList.find((s: any) => s.is_primary);
        setPrimaryStoryId(primary?.id || data.storytellingList[0].id);
      }

      // Build section summaries for identity card
      const [personaFullRes, storyFullRes, stratFullRes, toneFullRes] = await Promise.all([
        (supabase.from("persona") as any).select("portrait_prenom, description, pitch_short").eq(column, value).maybeSingle(),
        data.storytellingList && data.storytellingList.length > 0
          ? (supabase.from("storytelling") as any).select("step_7_polished, imported_text, step_1_raw").eq("id", (data.storytellingList.find((s: any) => s.is_primary) || data.storytellingList[0]).id).maybeSingle()
          : Promise.resolve({ data: null }),
        (supabase.from("brand_strategy") as any).select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3").eq(column, value).maybeSingle(),
        (supabase.from("brand_profile") as any).select("tone_register, tone_level, tone_style, tone_humor, tone_engagement").eq(column, value).maybeSingle(),
      ]);

      const storyText = storyFullRes.data?.step_7_polished || storyFullRes.data?.imported_text || storyFullRes.data?.step_1_raw || "";
      const toneKw = toneFullRes.data ? [toneFullRes.data.tone_register, toneFullRes.data.tone_style, toneFullRes.data.tone_humor, toneFullRes.data.tone_level].filter(Boolean) : [];
      const pillars = stratFullRes.data ? [stratFullRes.data.pillar_major, stratFullRes.data.pillar_minor_1, stratFullRes.data.pillar_minor_2, stratFullRes.data.pillar_minor_3].filter(Boolean) : [];
      const charterParts: string[] = [];
      if (data.charter?.color_primary) charterParts.push("Couleurs");
      if (data.charter?.font_title) charterParts.push("Typos");
      if (data.charter?.logo_url) charterParts.push("Logo");

      setSectionSummaries({
        storytelling: { firstLine: storyText.split(/[.\n]/)[0]?.trim() || "" },
        persona: { prenom: personaFullRes.data?.portrait_prenom || "", age: "", job: personaFullRes.data?.description?.split(",")[0]?.trim() || "" },
        proposition: { phrase: data.proposition?.version_pitch_naturel || data.proposition?.version_final || "" },
        tone: { keywords: toneKw },
        strategy: { pillars },
        charter: { summary: charterParts.length > 0 ? charterParts.join(" · ") : "" },
      });

      const { data: auditData } = await (supabase.from("branding_audits") as any)
        .select("id, created_at, score_global, points_forts, points_faibles")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(1);
      if (auditData && auditData.length > 0) setLastAudit(auditData[0]);

      // Check for pending autofill review
      const { data: pendingAutofill } = await (supabase.from("branding_autofill") as any)
        .select("analysis_result, sources_used, sources_failed, website_url, instagram_handle, linkedin_url")
        .eq("user_id", user.id)
        .eq("autofill_status", "pending_review")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingAutofill?.analysis_result) {
        setAnalysisResult(pendingAutofill.analysis_result as AnalysisResult);
        setImportPhaseNew("reviewing");
        setReanalyzeUrls({
          website: pendingAutofill.website_url || "",
          instagram: pendingAutofill.instagram_handle || "",
          linkedin: pendingAutofill.linkedin_url || "",
        });
      }

      setLoading(false);
    };
    load();
  }, [user?.id, isDemoMode]);

  const generateProposition = async () => {
    if (!user) return;
    setGeneratingProp(true);
    try {
      const storyRes = { data: storytellingHook || null };
      const personaRes = { data: personaHook || null };
      const profileRes = { data: hookBrandProfile || null };
      const profiles = { data: hookProfile || null };

      if (!profiles.data) {
        toast.error("Complète ton profil d'abord — va dans Onboarding pour renseigner tes infos.");
        setGeneratingProp(false);
        return;
      }

      const syntheticData = {
        step_1_what: profiles.data?.activite || "",
        step_2a_process: storyRes.data?.step_3_action || "",
        step_2b_values: profileRes.data?.combat_cause || "",
        step_2c_feedback: personaRes.data?.step_2_transformation || "",
        step_2d_refuse: profileRes.data?.combat_refusals || "",
        step_3_for_whom: personaRes.data?.step_1_frustrations || "",
      };

      const { data: fn, error } = await supabase.functions.invoke("proposition-ai", {
        body: { type: "generate-versions", proposition_data: syntheticData, persona: personaRes.data, storytelling: storyRes.data, tone: profileRes.data, profile: profiles.data },
      });
      if (error) throw error;

      const raw = fn?.content || fn?.response || (typeof fn === "string" ? fn : JSON.stringify(fn));
      const cleaned = typeof raw === "string" ? raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim() : raw;
      const parsed = typeof cleaned === "string" ? JSON.parse(cleaned) : cleaned;

      const payload = {
        ...syntheticData,
        version_pitch_naturel: parsed.pitch_naturel || "",
        version_bio: parsed.bio || "",
        version_networking: parsed.networking || "",
        version_site_web: parsed.site_web || "",
        version_engagee: parsed.engagee || "",
        version_one_liner: parsed.one_liner || "",
        completed: true,
        current_step: 4,
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      };

      const { data: existing } = await (supabase.from("brand_proposition") as any).select("id").eq(column, value).maybeSingle();
      if (existing) {
        await supabase.from("brand_proposition").update(payload as any).eq("id", existing.id);
      } else {
        await supabase.from("brand_proposition").insert(payload as any);
      }
      queryClient.invalidateQueries({ queryKey: ["brand-proposition"] });
      toast.success("✨ Tes 6 propositions de valeur sont prêtes !");
      navigate("/branding/proposition/recap");
    } catch (e: any) {
      console.error("[BrandingPage] Proposition generation error:", e);
      const { friendlyError } = await import("@/lib/error-messages");
      toast.error(friendlyError(e));
    } finally {
      setGeneratingProp(false);
    }
  };

  const reloadCompletion = async () => {
    if (!user) return;
    const data = await fetchBrandingData({ column, value });
    setCompletion(calculateBrandingCompletion(data));
    if (data.storytellingList && data.storytellingList.length > 0) {
      const primary = data.storytellingList.find((s: any) => s.is_primary);
      setPrimaryStoryId(primary?.id || data.storytellingList[0].id);
    }
  };

  const handleImportResult = (extraction: BrandingExtraction) => {
    setImportExtraction(extraction);
    setImportPhase('reviewing');
  };

  const handleImportDone = async () => {
    setImportPhase('idle');
    setImportExtraction(null);
    await reloadCompletion();
  };

  const handleStartAnalysis = async (data: { website?: string; instagram?: string; linkedin?: string; files: File[] }) => {
    // Demo mode: simulate analysis
    if (isDemoMode) {
      setLastImportData(data);
      setImportAnalyzing(true);
      setAnalysisSources({ website: data.website, instagram: data.instagram, linkedin: data.linkedin, hasDocuments: data.files.length > 0 });
      setTimeout(() => setImportPhaseNew("analyzing"), 500);
      // Simulate 3-second delay
      setTimeout(() => {
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

    setTimeout(() => setImportPhaseNew("analyzing"), 1000);

    try {
      const { data: result, error } = await supabase.functions.invoke("analyze-brand", {
        body: {
          userId: user?.id,
          websiteUrl: data.website || null,
          instagramHandle: data.instagram || null,
          linkedinUrl: data.linkedin || null,
          documentIds: [],
        },
      });

      if (error) throw error;
      if (!result?.success) throw new Error(result?.error || "Analyse échouée");

      // Save autofill status
      if (result.id) {
        await (supabase.from("branding_autofill") as any).update({ autofill_status: "pending_review" }).eq("id", result.id);
      }

      // Log completion
      logEvent("autofill_completed");

      setAnalysisResult(result.analysis);
      setImportAnalyzing(false);
      setImportPhaseNew("reviewing");
    } catch (e: any) {
      console.error("Analysis error:", e);
      setImportAnalyzing(false);
      setAnalysisError(e.message || "Erreur inconnue");
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
    if (reanalyzeMode) {
      setReanalyzeMode(false);
      setImportPhaseNew("form");
      return;
    }
    setSkipImport(true);
    localStorage.setItem("branding_skip_import", "true");
    logEvent("autofill_abandoned");
  };

  const handleStartReanalyze = () => {
    setReanalyzeMode(true);
    setImportPhaseNew("form");
    setAnalysisResult(null);
  };

  const globalMessage =
    completion.total > 80
      ? "Ton branding est solide. L'IA te connaît bien."
      : completion.total >= 50
        ? "Tu avances bien ! Quelques sections à compléter."
        : "Continue à remplir pour débloquer tout le potentiel de l'outil.";

  const getRecapRoute = (card: BrandingCard) => {
    if (card.scoreKey === "storytelling" && primaryStoryId) {
      return card.recapRoute.replace("__PRIMARY__", primaryStoryId);
    }
    return card.recapRoute;
  };

  const filledSections = (["storytelling", "persona", "proposition", "tone", "strategy", "charter"] as const)
    .filter((k) => completion[k] > 0).length;
  const showNewImport = (filledSections < 2 && !skipImport && !isDemoMode && !coachingActive) || reanalyzeMode;
  const showNewImportDemo = isDemoMode && filledSections < 2 && !skipImport && !coachingActive;

  // Determine which top-level view to show: "loading" | "import" | "review" | "identity"
  const topView: "loading" | "import" | "review" | "identity" = loading
    ? "loading"
    : (importPhaseNew === "reviewing" && analysisResult)
      ? "review"
      : (showNewImport || showNewImportDemo)
        ? "import"
        : "identity";

  return (
    <div className="min-h-screen bg-[hsl(var(--rose-pale))]">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        <AnimatePresence mode="wait">
          {/* === LOADING === */}
          {topView === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
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

          {/* === IMPORT === */}
          {topView === "import" && importPhaseNew === "form" && (
            <motion.div key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              <BrandingImport
                loading={importAnalyzing}
                onAnalyze={handleStartAnalysis}
                onSkip={handleSkipImport}
                initialWebsite={reanalyzeUrls.website}
                initialInstagram={reanalyzeUrls.instagram}
                initialLinkedin={reanalyzeUrls.linkedin}
                reanalyzeWarning={reanalyzeMode}
              />
            </motion.div>
          )}
          {topView === "import" && (importPhaseNew === "analyzing" || importPhaseNew === "error") && (
            <motion.div key="loader" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <BrandingAnalysisLoader
                sources={analysisSources}
                error={importPhaseNew === "error" ? analysisError : null}
                done={false}
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

          {/* === REVIEW === */}
          {topView === "review" && analysisResult && (
            <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}>
              <BrandingReview
                analysis={analysisResult}
                sourcesUsed={analysisResult.sources_used || []}
                sourcesFailed={analysisResult.sources_failed || []}
                preFilledSections={preFilledSections}
                onReanalyzeWithBio={handleReanalyzeWithBio}
                onDone={async () => {
                  if (user?.id && !isDemoMode) {
                    await (supabase.from("branding_autofill") as any)
                      .update({ autofill_status: "completed", autofill_pending_review: false })
                      .eq("user_id", user.id)
                      .eq("autofill_status", "pending_review");
                  }
                  setImportPhaseNew("form");
                  setAnalysisResult(null);
                  setSkipImport(true);
                  setReanalyzeMode(false);
                  localStorage.setItem("branding_skip_import", "true");
                  await reloadCompletion();
                }}
              />
            </motion.div>
          )}

          {/* === IDENTITY === */}
          {topView === "identity" && (
            <motion.div key="identity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
              <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Retour au hub
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
                <BrandingSynthesisSheet onClose={() => setShowSynthesis(false)} />
              ) : importPhase === 'reviewing' && importExtraction ? (
                <BrandingImportReview
                  extraction={importExtraction}
                  onDone={handleImportDone}
                  onCancel={() => { setImportPhase('idle'); setImportExtraction(null); }}
                />
              ) : viewMode === "guided" ? (
                <>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
                    <h1 className="font-display text-[26px] font-bold text-foreground">Mon Branding</h1>
                    <div className="flex items-center gap-2">
                      {!isDemoMode && completion.total > 0 && (
                        <button onClick={handleStartReanalyze} className="font-mono-ui text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">🔄 Réanalyser mes liens</button>
                      )}
                      <div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 p-0.5">
                        <button onClick={() => { setViewMode("free"); localStorage.setItem("branding_mode", "free"); }} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all text-muted-foreground hover:text-foreground">
                          <LayoutGrid className="h-3.5 w-3.5" /> Mode libre
                        </button>
                        <button onClick={() => { setViewMode("guided"); localStorage.setItem("branding_mode", "guided"); }} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all bg-card text-foreground shadow-sm">
                          <ListOrdered className="h-3.5 w-3.5" /> Guidé (7 jours)
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-[15px] text-muted-foreground mb-6">Suis le parcours jour par jour pour construire ton branding pas à pas.</p>
                  <GuidedTimeline completion={completion} navigate={navigate} onShowSynthesis={() => setShowSynthesis(true)} />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-6 justify-end">
                    <div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 p-0.5">
                      <button onClick={() => { setViewMode("free"); localStorage.setItem("branding_mode", "free"); }} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all bg-card text-foreground shadow-sm">
                        <LayoutGrid className="h-3.5 w-3.5" /> Fiche d'identité
                      </button>
                      <button onClick={() => { setViewMode("guided"); localStorage.setItem("branding_mode", "guided"); }} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all text-muted-foreground hover:text-foreground">
                        <ListOrdered className="h-3.5 w-3.5" /> Guidé (7 jours)
                      </button>
                    </div>
                  </div>

                  <BrandingIdentityCard
                    completion={completion}
                    summaries={sectionSummaries}
                    onReanalyze={!isDemoMode && completion.total > 0 ? handleStartReanalyze : undefined}
                  />

                  <div className="mt-6 flex flex-col sm:flex-row gap-2">
                    {completion.total >= 10 && (
                      <Button variant="outline" className="flex-1 gap-2 text-sm" onClick={() => setShowSynthesis(true)}>
                        <ClipboardList className="h-4 w-4" /> 📋 Générer ma fiche de synthèse
                      </Button>
                    )}
                    {canShowMirror && (
                      <Button variant="outline" className="gap-2 text-sm sm:w-auto" onClick={runMirror}>🪞 Mon Branding Mirror</Button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Sheet open={mirrorOpen} onOpenChange={setMirrorOpen}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-lg font-display">🪞 Branding Mirror</SheetTitle>
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
                  <div className="space-y-2">{mirrorData.gaps.map((g: any, i: number) => <div key={i} className="rounded-lg bg-chart-4/10 border border-chart-4/20 p-3 space-y-1"><p className="text-xs font-semibold text-foreground">{g.aspect}</p><p className="text-xs text-muted-foreground"><span className="font-medium">Déclaré :</span> {g.declared}</p><p className="text-xs text-muted-foreground"><span className="font-medium">Réalité :</span> {g.actual}</p><p className="text-xs text-primary font-medium mt-1">💡 {g.suggestion}</p></div>)}</div>
                </div>
              )}
              {mirrorData.quick_wins?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Zap className="h-4 w-4 text-primary" /> 3 quick wins</h4>
                  <div className="space-y-1.5">{mirrorData.quick_wins.map((qw: string, i: number) => <div key={i} className="flex gap-2 text-xs text-foreground"><span className="text-primary font-bold shrink-0">{i + 1}.</span><span>{qw}</span></div>)}</div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={() => { setMirrorData(null); runMirror(); }}><RefreshCw className="h-3.5 w-3.5" /> Refaire l'analyse</Button>
                <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={() => exportMirrorPDF(mirrorData)}><Download className="h-3.5 w-3.5" /> Exporter PDF</Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
