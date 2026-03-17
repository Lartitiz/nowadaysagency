import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import { RotateCcw, ArrowRight, ArrowLeft, Eye, HelpCircle, Upload, Camera, Loader2, Link as LinkIcon, Palette, ChevronDown, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import SiteAuditResult from "@/components/site/SiteAuditResult";
import SiteAuditAutoResult, { type AutoAuditResult } from "@/components/site/SiteAuditAutoResult";
import { friendlyError } from "@/lib/error-messages";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useDiagnosticCache } from "@/hooks/use-diagnostic-cache";
import DiagnosticCacheBanner from "@/components/audit/DiagnosticCacheBanner";
import QuotaExhaustedCard from "@/components/QuotaExhaustedCard";
import { useUserPlan } from "@/hooks/use-user-plan";

// ── Loading messages ──
const LOADING_MESSAGES = [
  { time: 0, text: "🔍 Connexion au site..." },
  { time: 5000, text: "📖 Lecture des pages..." },
  { time: 10000, text: "🧠 Analyse de la clarté, du copywriting, des CTA..." },
  { time: 20000, text: "📊 Calcul du score et des recommandations..." },
  { time: 30000, text: "⏳ Presque fini, l'IA peaufine les recommandations..." },
];

const MOTIVATIONAL_QUOTES = [
  "Un bon site, c'est pas un site parfait. C'est un site qui convertit.",
  "Tes visiteuses ne lisent pas : elles scannent. Chaque mot compte.",
  "Le meilleur investissement, c'est un message clair.",
  "Un CTA visible = une cliente en moins qui part sans agir.",
  "Ton site est ta vitrine 24h/24. Autant qu'il bosse pour toi.",
];

// ── Old audit types (kept for backward compat) ──
type AnswerValue = "oui" | "non" | "pas_sure" | null;
interface AuditQuestion { id: string; text: string; tooltip: string; }
interface AuditSection { id: string; emoji: string; title: string; questions: AuditQuestion[]; }

const GLOBAL_SECTIONS: AuditSection[] = [
  { id: "clarte", emoji: "🎯", title: "Clarté du message", questions: [
    { id: "q1", text: "Ton titre principal décrit un bénéfice concret pour ta cliente idéale ?", tooltip: "Un bon titre dit ce que ta cliente va obtenir." },
    { id: "q2", text: "On comprend ce que tu fais + pour qui en moins de 10 secondes ?", tooltip: "Demande à une amie de regarder ta page 10 secondes." },
    { id: "q3", text: "Ta page explique en quoi tu es différente des autres ?", tooltip: "Ce qui te rend unique n'est pas ton CV." },
    { id: "q4", text: "Ton visuel et tes textes racontent la même histoire ?", tooltip: "Si ton texte est chaleureux mais tes visuels sont froids, il y a un décalage." },
  ]},
  { id: "copywriting", emoji: "💬", title: "Copywriting", questions: [
    { id: "q5", text: "Tes titres parlent de ce que ta cliente va obtenir ?", tooltip: "'Reprends confiance dans ta com' fonctionne mieux." },
    { id: "q6", text: "Tu as un bouton d'action visible sans scroller ?", tooltip: "Si ta visiteuse doit scroller, tu perds 40% de conversions." },
    { id: "q7", text: "Le ton de tes textes correspond à ta cible ?", tooltip: "Parle comme ta cliente parle." },
    { id: "q8", text: "Tu as du micro-texte rassurant sous tes boutons ?", tooltip: "Un petit texte sous le bouton réduit l'anxiété." },
  ]},
  { id: "parcours", emoji: "🗺️", title: "Parcours utilisateur·ice", questions: [
    { id: "q9", text: "Ton menu a moins de 6 éléments ?", tooltip: "Plus de 6 = confusion." },
    { id: "q10", text: "Ta visiteuse peut passer à l'action en 3 clics max ?", tooltip: "Chaque clic supplémentaire fait perdre ~20%." },
    { id: "q11", text: "Chaque page a UN objectif principal clair ?", tooltip: "Une page = un objectif." },
    { id: "q12", text: "Tes pages ont toutes le même style ?", tooltip: "L'incohérence crée de la méfiance." },
  ]},
  { id: "confiance", emoji: "🛡️", title: "Confiance", questions: [
    { id: "q13", text: "Tu as au moins un témoignage visible sur ta page d'accueil ?", tooltip: "Les témoignages sont le levier n°1." },
    { id: "q14", text: "On sait combien ça coûte OU comment ça se passe ?", tooltip: "L'opacité sur le prix est le frein n°1." },
    { id: "q15", text: "Tu as une page À propos avec ta photo et ton histoire ?", tooltip: "Les gens achètent à des humains." },
  ]},
  { id: "mobile", emoji: "📱", title: "Mobile", questions: [
    { id: "q16", text: "Ton site s'affiche bien sur mobile ?", tooltip: "60-80% viennent du mobile." },
    { id: "q17", text: "Ton site charge en moins de 3 secondes ?", tooltip: "Au-delà de 3s, 53% quittent." },
    { id: "q18", text: "Tes boutons sont assez grands pour le pouce ?", tooltip: "Un bouton trop petit = frustration." },
  ]},
  { id: "visuel", emoji: "🎨", title: "Hiérarchie visuelle", questions: [
    { id: "q19", text: "Tes textes sont bien lisibles ?", tooltip: "Bon contraste = minimum 4.5:1." },
    { id: "q20", text: "Tes sections sont bien espacées ?", tooltip: "Le blanc, c'est de la respiration visuelle." },
  ]},
];

const PAGE_QUESTIONS: Record<string, AuditQuestion[]> = {};

const ANSWER_OPTIONS: { value: AnswerValue; label: string }[] = [
  { value: "oui", label: "Oui ✅" },
  { value: "non", label: "Non ❌" },
  { value: "pas_sure", label: "Pas sûr·e 🤷" },
];

// ── Additional page paths ──
const EXTRA_PAGES = [
  { path: "/a-propos", label: "À propos" },
  { path: "/offres", label: "Offres / Services" },
  { path: "/contact", label: "Contact" },
];

type AuditData = {
  id: string;
  audit_mode: string | null;
  answers: Record<string, unknown>;
  completed: boolean;
  score_global: number;
  scores: Record<string, unknown>;
  diagnostic: string | null;
  recommendations: unknown[];
  current_page: string | null;
  raw_result?: unknown;
  site_url?: string | null;
  is_latest?: boolean;
  created_at?: string;
};

type Step = "input" | "loading" | "auto-results" | "questionnaire" | "old-results" | "screenshot";

const SiteAuditPage = () => {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [searchParams] = useSearchParams();
  const { diagnosticData: diagCache, isRecent: diagIsRecent } = useDiagnosticCache();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<AuditData | null>(null);
  const [step, setStep] = useState<Step>("input");

  // Auto audit state
  const [siteUrl, setSiteUrl] = useState("");
  const [extraPages, setExtraPages] = useState<string[]>([]);
  const [customPath, setCustomPath] = useState("");
  const [showExtraPages, setShowExtraPages] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoAuditResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0].text);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingQuote] = useState(() => MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]);

  // Screenshot state (kept from old)
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [screenshotPageType, setScreenshotPageType] = useState("accueil");
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotResult, setScreenshotResult] = useState<any>(null);
  const [expandedProblem, setExpandedProblem] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Old questionnaire state (for legacy audits)
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [pbpAnswers, setPbpAnswers] = useState<Record<string, Record<string, AnswerValue>>>({});
  const [saving, setSaving] = useState(false);

  // Load existing audit (latest)
  const loadAudit = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase.from("website_audit") as any)
      .select("*")
      .eq(column, value)
      .eq("is_latest", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setExisting(data);
      if (data.site_url) setSiteUrl(data.site_url);
      if (data.audit_mode === "auto" && data.raw_result) {
        setAutoResult(data.raw_result as AutoAuditResult);
      }
      if (data.audit_mode === "global" && data.answers && typeof data.answers === "object") {
        setAnswers(data.answers as Record<string, AnswerValue>);
      }
      if (data.audit_mode === "page_by_page" && data.answers && typeof data.answers === "object") {
        setPbpAnswers(data.answers as Record<string, Record<string, AnswerValue>>);
      }
    } else {
      setExisting(null);
    }
    setLoading(false);
  }, [user, column, value]);

  useEffect(() => { loadAudit(); }, [loadAudit]);

  // Check if URL param wants screenshot mode
  useEffect(() => {
    if (searchParams.get("mode") === "screenshot") setStep("screenshot");
  }, [searchParams]);

  // Loading animation
  useEffect(() => {
    if (!analyzing) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Non-linear progress: fast start, slow end, cap at 95%
      const progress = Math.min(95, (1 - Math.exp(-elapsed / 15000)) * 100);
      setLoadingProgress(progress);

      // Update message based on elapsed time
      let msg = LOADING_MESSAGES[0].text;
      for (const lm of LOADING_MESSAGES) {
        if (elapsed >= lm.time) msg = lm.text;
      }
      setLoadingMsg(msg);
    }, 300);
    return () => clearInterval(interval);
  }, [analyzing]);

  // ── Auto audit launch ──
  const launchAutoAudit = async () => {
    if (!siteUrl.trim()) { toast.error("Entre l'URL de ton site"); return; }
    if (!user) return;

    setAnalyzing(true);
    setStep("loading");
    setLoadingProgress(0);

    try {
      const pages_to_audit: string[] = [...extraPages];
      if (customPath.trim() && customPath.trim().startsWith("/")) {
        pages_to_audit.push(customPath.trim());
      }

      const { data, error } = await invokeWithTimeout("audit-site-auto", {
        body: {
          site_url: siteUrl.trim(),
          pages_to_audit: pages_to_audit.length > 0 ? pages_to_audit : undefined,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        },
      }, 120000);

      if (error) throw error;
      if (data?.error === "site_inaccessible") {
        toast.error(data.message || "Site inaccessible", { duration: 8000 });
        setStep("input");
        return;
      }
      if (data?.error || data?.quota) {
        const { handleQuotaError } = await import("@/lib/quota-error-handler");
        if (handleQuotaError({ data, message: data.message || data.error })) {
          setStep("input");
          return;
        }
        toast.error(data.message || data.error, { duration: 8000 });
        setStep("input");
        return;
      }
      console.log("[audit-site-auto] Response:", JSON.stringify(data).slice(0, 500));

      const result = data as AutoAuditResult;
      setAutoResult(result);

      // Save to DB — mark old audits as not latest, always insert new
      await (supabase.from("website_audit") as any)
        .update({ is_latest: false })
        .eq(column, value)
        .eq("audit_mode", "auto")
        .eq("is_latest", true);

      const payload: Record<string, unknown> = {
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : null,
        audit_mode: "auto",
        answers: {},
        scores: result.piliers || {},
        score_global: result.score_global || 0,
        diagnostic: result.synthese || null,
        recommendations: result.plan_action || [],
        completed: true,
        raw_result: result,
        site_url: siteUrl.trim(),
        is_latest: true,
      };

      const { data: inserted } = await (supabase.from("website_audit") as any).insert(payload).select("id").single();
      if (inserted) setExisting({ ...payload, id: inserted.id, created_at: new Date().toISOString() } as any);

      setStep("auto-results");
    } catch (e: any) {
      console.error("[audit-site-auto] Error:", e);
      if (e?.isTimeout) toast.error("L'audit prend plus de temps que prévu. Réessaie.", { duration: 8000 });
      else toast.error(friendlyError(e), { duration: 8000 });
      setStep("input");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Reset ──
  const handleReset = () => {
    setAutoResult(null);
    setAnswers({});
    setPbpAnswers({});
    setCurrentSection(0);
    setExtraPages([]);
    setCustomPath("");
    setStep("input");
    localStorage.removeItem("site-audit-checklist");
  };

  // ── Re-run audit (keep old, start new) ──
  const handleRerun = () => {
    // Keep the existing URL pre-filled, go back to input to re-launch
    setAutoResult(null);
    setStep("input");
    localStorage.removeItem("site-audit-checklist");
  };

  // ── Screenshot handlers ──
  const handleScreenshotFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 Mo"); return; }
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) { toast.error("Format : PNG ou JPG"); return; }
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setScreenshotResult(null);
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleScreenshotFile(file); };

  const analyzeScreenshot = async () => {
    if (!screenshotFile) return;
    setScreenshotLoading(true);
    setScreenshotResult(null);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(screenshotFile);
      });
      const { data, error } = await supabase.functions.invoke("website-ai", {
        body: { action: "audit-screenshot", image_base64: base64, image_type: screenshotFile.type === "image/png" ? "png" : "jpg", site_url: screenshotUrl || undefined, page_type: screenshotPageType, workspace_id: workspaceId },
      });
      if (error) throw error;
      const raw = data?.content || data;
      let parsed;
      try { const str = typeof raw === "string" ? raw : JSON.stringify(raw); parsed = typeof raw === "object" && raw.first_impression ? raw : JSON.parse(str.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()); } catch { throw new Error("Format de réponse inattendu"); }
      setScreenshotResult(parsed);
    } catch (err) { toast.error(friendlyError(err)); } finally { setScreenshotLoading(false); }
  };

  const toggleExtraPage = (path: string) => {
    setExtraPages(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  const hasOldAudit = existing && (existing.audit_mode === "global" || existing.audit_mode === "page_by_page") && existing.completed;
  const hasAutoAudit = existing && existing.audit_mode === "auto" && existing.completed && autoResult;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Audit de conversion" />

        {/* ── STEP: Input (URL) ── */}
        {step === "input" && (
          <>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold font-display">🔍 Audit de ton site</h1>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Colle ton URL, l'IA fait le reste. En 30 secondes, tu sais exactement ce qui freine tes visiteuses.
              </p>
            </div>

            {!hasAutoAudit && !hasOldAudit && diagIsRecent && diagCache && diagCache.scores?.website != null && (
              <DiagnosticCacheBanner diagnosticData={diagCache} domain="website" onRelaunch={() => {}} />
            )}

            {/* Existing audit banners */}
            {hasAutoAudit && (
              <div className="rounded-2xl border border-primary bg-rose-pale p-5 space-y-3">
                <p className="font-display text-sm font-bold text-foreground">
                  ✅ Tu as un audit précédent (score : {existing?.score_global}/100)
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button size="sm" onClick={() => setStep("auto-results")} className="gap-2 rounded-pill">
                    <Eye className="h-4 w-4" /> Voir les résultats
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleReset} className="gap-2 rounded-pill">
                    <RotateCcw className="h-4 w-4" /> Nouvel audit
                  </Button>
                </div>
              </div>
            )}

            {hasOldAudit && !hasAutoAudit && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <p className="font-display text-sm font-bold text-foreground">
                  📝 Tu as un audit précédent ({existing?.audit_mode === "global" ? "mode global" : "page par page"}).
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" onClick={() => setStep("old-results")} className="gap-2 rounded-pill">
                    <Eye className="h-4 w-4" /> Voir les résultats
                  </Button>
                  <Button size="sm" className="gap-2 rounded-pill" onClick={handleReset}>
                    <Sparkles className="h-4 w-4" /> Lancer un nouvel audit automatique
                  </Button>
                </div>
              </div>
            )}

            {/* URL input */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">URL de ton site</Label>
                <Input
                  placeholder="https://monsite.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className="text-base"
                  type="url"
                />
              </div>

              {/* Extra pages */}
              <Collapsible open={showExtraPages} onOpenChange={setShowExtraPages}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <ChevronDown className={`h-4 w-4 transition-transform ${showExtraPages ? "rotate-180" : ""}`} />
                  📄 Pages supplémentaires à auditer (optionnel)
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <div className="space-y-2">
                    {EXTRA_PAGES.map(ep => (
                      <label key={ep.path} className="flex items-center gap-3 cursor-pointer group">
                        <Checkbox checked={extraPages.includes(ep.path)} onCheckedChange={() => toggleExtraPage(ep.path)} />
                        <span className="text-sm text-foreground group-hover:text-primary transition-colors">{ep.label}</span>
                        <span className="text-xs text-muted-foreground">{ep.path}</span>
                      </label>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Chemin personnalisé</Label>
                    <Input placeholder="/portfolio" value={customPath} onChange={(e) => setCustomPath(e.target.value)} className="max-w-xs" />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Button onClick={launchAutoAudit} disabled={!siteUrl.trim() || analyzing} className="gap-2 rounded-pill w-full sm:w-auto">
                <Sparkles className="h-4 w-4" /> Lancer l'audit
              </Button>

              <p className="text-xs text-muted-foreground text-center sm:text-left">~30 secondes · Analyse automatique</p>
            </div>

            {/* Secondary link to screenshot */}
            <p className="text-sm text-muted-foreground text-center">
              Tu préfères envoyer un screenshot ?{" "}
              <button onClick={() => setStep("screenshot")} className="text-primary hover:underline font-medium">
                Utilise l'audit visuel →
              </button>
            </p>
          </>
        )}

        {/* ── STEP: Loading ── */}
        {step === "loading" && (
          <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
            <div className="space-y-3">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground animate-pulse">{loadingMsg}</p>
                <span className="text-xs text-muted-foreground">{Math.round(loadingProgress)}%</span>
              </div>
            </div>

            <div className="rounded-xl bg-muted/50 border border-border p-4">
              <p className="text-sm text-muted-foreground italic text-center">
                « {loadingQuote} »
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: Auto Results ── */}
        {step === "auto-results" && autoResult && (
          <>
            <SiteAuditAutoResult
              result={autoResult}
              onReset={handleReset}
              onRerun={handleRerun}
              siteUrl={siteUrl}
              userId={user?.id}
              workspaceFilter={{ column, value }}
            />
            <div className="mt-6">
              <RedFlagsChecker
                content={[autoResult.synthese, ...autoResult.priorites?.map((p: any) => p.action || p.detail || "") || []].filter(Boolean).join("\n\n")}
                onFix={() => {}}
              />
            </div>
            <AiGeneratedMention />
          </>
        )}

        {/* ── STEP: Old Results (backward compat) ── */}
        {step === "old-results" && existing && (
          <SiteAuditResult
            auditId={existing.id}
            auditMode={existing.audit_mode as "global" | "page_by_page"}
            answers={existing.audit_mode === "global" ? answers : pbpAnswers}
            globalSections={GLOBAL_SECTIONS}
            pageQuestions={PAGE_QUESTIONS}
            onReset={handleReset}
          />
        )}

        {/* ── STEP: Screenshot ── */}
        {step === "screenshot" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => { setStep("input"); setScreenshotResult(null); setScreenshotFile(null); setScreenshotPreview(null); }} className="gap-2 rounded-pill">
                <ArrowLeft className="h-4 w-4" /> Retour
              </Button>
              <h2 className="font-display text-lg font-bold text-foreground">📸 Audit visuel par screenshot</h2>
            </div>

            {!screenshotResult && (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors space-y-3"
                >
                  {screenshotPreview ? (
                    <img src={screenshotPreview} alt="Preview" className="max-h-64 mx-auto rounded-lg object-contain" />
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Glisse ton screenshot ici ou clique pour sélectionner</p>
                      <p className="text-xs text-muted-foreground">PNG ou JPG, max 5 Mo</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleScreenshotFile(e.target.files[0]); }} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" /> URL du site (optionnel)
                  </Label>
                  <Input placeholder="https://monsite.com" value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Type de page</Label>
                  <div className="flex flex-wrap gap-2">
                    {[{ id: "accueil", label: "🏠 Accueil" }, { id: "a-propos", label: "👋 À propos" }, { id: "offres", label: "🎁 Offres" }, { id: "autre", label: "📄 Autre" }].map((pt) => (
                      <button key={pt.id} onClick={() => setScreenshotPageType(pt.id)} className={`text-xs font-semibold px-4 py-2 rounded-pill border-2 transition-colors ${screenshotPageType === pt.id ? "border-primary bg-rose-pale text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/50"}`}>
                        {pt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button onClick={analyzeScreenshot} disabled={!screenshotFile || screenshotLoading} className="gap-2 rounded-pill w-full sm:w-auto">
                  {screenshotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {screenshotLoading ? "Analyse en cours..." : "Analyser mon screenshot"}
                </Button>
              </div>
            )}

            {screenshotLoading && (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyse en cours...
                </div>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            )}

            {screenshotResult && !screenshotLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2">
                  {screenshotPreview && (
                    <div className="rounded-2xl border border-border overflow-hidden sticky top-4">
                      <img src={screenshotPreview} alt="Screenshot analysé" className="w-full object-contain" />
                    </div>
                  )}
                </div>
                <div className="lg:col-span-3 space-y-5">
                  <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
                    <div className={`text-3xl font-display font-bold ${screenshotResult.score_estime >= 75 ? "text-emerald-600" : screenshotResult.score_estime >= 50 ? "text-amber-500" : "text-red-500"}`}>
                      {screenshotResult.score_estime}/100
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">Score estimé</p>
                      <p className="text-xs text-muted-foreground">{screenshotResult.first_impression}</p>
                    </div>
                  </div>

                  {screenshotResult.points_forts?.length > 0 && (
                    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                      <h3 className="font-display text-sm font-bold text-foreground">✅ Points forts</h3>
                      <ul className="space-y-2">
                        {screenshotResult.points_forts.map((p: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="shrink-0 mt-0.5 text-emerald-500">●</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {screenshotResult.problemes?.length > 0 && (
                    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                      <h3 className="font-display text-sm font-bold text-foreground">⚠️ Problèmes identifiés</h3>
                      <div className="space-y-2">
                        {screenshotResult.problemes.map((prob: any, i: number) => {
                          const impactColors: Record<string, string> = { fort: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400", moyen: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", faible: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" };
                          const catEmojis: Record<string, string> = { visuel: "🎨", copy: "✍️", cta: "👆", confiance: "🛡️", navigation: "🗺️" };
                          return (
                            <button key={i} onClick={() => setExpandedProblem(expandedProblem === i ? null : i)} className="w-full text-left rounded-xl border border-border p-4 hover:border-primary/40 transition-all space-y-2">
                              <div className="flex items-start gap-2">
                                <span className="shrink-0">{catEmojis[prob.categorie] || "📌"}</span>
                                <p className="text-sm text-foreground flex-1">{prob.description}</p>
                                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-pill ${impactColors[prob.impact] || impactColors.moyen}`}>{prob.impact}</span>
                              </div>
                              {expandedProblem === i && (
                                <div className="ml-6 mt-2 p-3 rounded-lg bg-muted/50 border border-border">
                                  <p className="text-xs font-bold text-foreground mb-1">💡 Suggestion</p>
                                  <p className="text-xs text-muted-foreground">{prob.suggestion}</p>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {screenshotResult.suggestions_layout?.length > 0 && (
                    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                      <h3 className="font-display text-sm font-bold text-foreground">📐 Suggestions de mise en page</h3>
                      <ul className="space-y-2">
                        {screenshotResult.suggestions_layout.map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="shrink-0 mt-0.5 text-primary">→</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" size="sm" className="gap-2 rounded-pill" onClick={() => { setScreenshotResult(null); }}>
                      <RotateCcw className="h-4 w-4" /> Refaire avec un autre screenshot
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-2 rounded-pill" asChild>
                      <Link to="/site/inspirations"><Palette className="h-4 w-4" /> 🎨 Voir des inspirations</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default SiteAuditPage;
