import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { UX_UPLOAD_LIMITS, uxSizeError } from "@/lib/upload-limits";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Sparkles, Upload, X, Loader2, ArrowRight, ChevronRight, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import { Link, useNavigate } from "react-router-dom";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import QuotaExhaustedCard from "@/components/QuotaExhaustedCard";
import { useUserPlan } from "@/hooks/use-user-plan";
import { friendlyError } from "@/lib/error-messages";

// ── Types ──
type ScreenshotType = "profile" | "about" | "feed" | "experience" | "other";
interface ScreenshotFile { file: File; preview: string; type: ScreenshotType; }

interface AuditElement { name: string; score: number; max_score: number; status: string; feedback: string; recommendation: string; }
interface AuditSection { score: number; elements: AuditElement[]; }
interface Priority { rank: number; title: string; impact: string; why: string; action_label: string; action_route: string; }
interface GranularCriterion { score: number; max: number; feedback: string; }
interface GranularSection { total: number; [key: string]: GranularCriterion | number; }
interface AuditResult {
  score_global: number;
  sections: { profil: AuditSection; contenu: AuditSection; strategie: AuditSection; reseau: AuditSection };
  top_5_priorities: Priority[];
  granular_scores?: { headline?: GranularSection; about?: GranularSection };
}

// ── Constants ──
// Écran unique : on ne demande QUE ce que ni l'app ni le profil public ne savent
// (vues, connexions, recommandations = données privées LinkedIn sans API analytics).
// Le reste (à propos, checklist profil, vrais posts) est récupéré automatiquement.
const OBJECTIVE_OPTIONS = [
  "Trouver des client·es (accompagnement)",
  "Trouver des client·es (services)",
  "Développer mon réseau pro",
  "Me positionner comme experte",
  "Trouver des partenariats / collabs",
  "Recruter / être recrutée",
];
const RHYTHM_OPTIONS = ["Jamais (ou presque)", "1-2 fois par mois", "1 fois par semaine", "2-3 fois par semaine", "Tous les jours"];
const VIEWS_OPTIONS = ["< 100 vues", "100-500 vues", "500-2 000 vues", "> 2 000 vues", "Je ne sais pas"];
const CONNECTIONS_OPTIONS = ["< 200", "200-500", "500-1 000", "1 000-3 000", "> 3 000"];
const RECO_OPTIONS = ["0", "1-3", "4-10", "Plus de 10"];

// Rythme déduit des posts LinkedIn créés dans l'app sur 30 j. On ne présume RIEN
// à zéro (elle publie peut-être hors de l'app) : pas de pré-sélection dans ce cas.
function deriveRhythm(count: number): string {
  if (count >= 12) return "Tous les jours";
  if (count >= 6) return "2-3 fois par semaine";
  if (count >= 3) return "1 fois par semaine";
  if (count >= 1) return "1-2 fois par mois";
  return "";
}

const UPLOAD_ZONES: { type: ScreenshotType; label: string; hint: string }[] = [
  { type: "profile", label: "Profil (haut de page)", hint: "Photo, bannière, titre" },
  { type: "about", label: "Section À propos", hint: "Le texte complet" },
  { type: "feed", label: "Feed / posts récents", hint: "Tes dernières publications" },
  { type: "experience", label: "Expériences & formation", hint: "Section parcours" },
  { type: "other", label: "Autre (stats, reco, sélection)", hint: "Tout ce qui peut aider" },
];

// ── Chip selector ──
function ChipSelect({ options, value, onChange, multi = false }: { options: string[]; value: string | string[]; onChange: (v: any) => void; multi?: boolean }) {
  const selected = multi ? (value as string[]) : [value as string];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const isSelected = selected.includes(o);
        return (
          <button
            key={o}
            onClick={() => {
              if (multi) {
                onChange(isSelected ? (value as string[]).filter((v) => v !== o) : [...(value as string[]), o]);
              } else {
                onChange(o);
              }
            }}
            className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${isSelected ? "border-primary bg-rose-pale text-primary" : "border-border bg-card text-foreground hover:border-primary/40"}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ── Score color ──
function getScoreInfo(score: number) {
  if (score >= 70) return { color: "text-success", bg: "bg-success-bg", emoji: "🟢" };
  if (score >= 40) return { color: "text-warning", bg: "bg-warning-bg", emoji: "🟡" };
  return { color: "text-error", bg: "bg-error-bg", emoji: "🔴" };
}

function impactEmoji(impact: string) {
  if (impact === "high") return "🔴";
  if (impact === "medium") return "🟡";
  return "🟢";
}

export default function LinkedInAudit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { plan } = useUserPlan();
  const [quotaExhausted, setQuotaExhausted] = useState<{ message?: string } | null>(null);

  // view : "form" (écran unique) ou "results"
  const [view, setView] = useState<"form" | "results">("form");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Les seules questions restantes (données privées LinkedIn, pas d'API)
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [showScreenshots, setShowScreenshots] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [objective, setObjective] = useState("");
  const [rhythm, setRhythm] = useState("");
  const [avgViews, setAvgViews] = useState("");
  const [connectionsCount, setConnectionsCount] = useState("");
  const [recommendationsCount, setRecommendationsCount] = useState("");

  // Données récupérées automatiquement (profil app + posts créés dans l'app)
  const [autoData, setAutoData] = useState<{
    aboutText: string;
    checklist: Record<string, unknown> | null;
    appPostsCount30d: number;
    recentPosts: { date: string; excerpt: string }[];
  } | null>(null);

  const fileInputRefs = useRef<Record<ScreenshotType, HTMLInputElement | null>>({} as any);

  // Pré-remplissage automatique : URL depuis le profil, à propos + checklist depuis
  // le module LinkedIn, rythme déduit des posts créés dans l'app sur 30 jours.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await (supabase.from("profiles") as any)
        .select("linkedin_url, linkedin_summary").eq(column, value).maybeSingle();
      if (prof?.linkedin_url) setProfileUrl((cur) => cur || prof.linkedin_url);

      const { data: lp } = await (supabase.from("linkedin_profile") as any)
        .select("title, title_done, url_done, photo_done, banner_done, featured_done, creator_mode_done, summary_final, resume_current")
        .eq(column, value).maybeSingle();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data: posts } = await (supabase.from("calendar_posts") as any)
        .select("date, content_draft, accroche")
        .eq(column, value).eq("canal", "linkedin").gte("date", thirtyDaysAgo)
        .order("date", { ascending: false }).limit(20);

      const appPosts = (posts || []) as any[];
      const aboutText = lp?.summary_final || lp?.resume_current || prof?.linkedin_summary || "";
      setAutoData({
        aboutText,
        checklist: lp ? {
          title: lp.title, title_done: lp.title_done, url_done: lp.url_done, photo_done: lp.photo_done,
          banner_done: lp.banner_done, featured_done: lp.featured_done, creator_mode_done: lp.creator_mode_done,
        } : null,
        appPostsCount30d: appPosts.length,
        recentPosts: appPosts
          .map((p) => ({ date: p.date || "", excerpt: (p.content_draft || p.accroche || "").slice(0, 400) }))
          .filter((p) => p.excerpt).slice(0, 3),
      });
      const derived = deriveRhythm(appPosts.length);
      if (derived) setRhythm((cur) => cur || derived);
    })();
  }, [user?.id, column, value]);

  // Load existing audit on mount
  useEffect(() => {
    if (!user) return;
    const loadExisting = async () => {
      const { data: audits } = await (supabase
        .from("linkedin_audit" as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(2) as any);

      if (audits && audits.length > 0) {
        const latest = audits[0];
        if (latest.audit_result) {
          setResult(latest.audit_result as unknown as AuditResult);
          setAuditDate(latest.created_at);
          setView("results");
        }
        if (audits.length > 1 && audits[1].score_global) {
          setPreviousScore(audits[1].score_global);
        }
      }
      setLoadingExisting(false);
    };
    loadExisting();
  }, [user?.id]);

  const sanitizeFileName = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    return `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  };

  const handleFileAdd = (type: ScreenshotType, fileList: FileList | null) => {
    if (!fileList) return;
    const all = Array.from(fileList);
    all.filter((f) => f.size > UX_UPLOAD_LIMITS.media).forEach((f) => toast.error(uxSizeError(f, UX_UPLOAD_LIMITS.media)!));
    const newFiles = all.filter((f) => f.size <= UX_UPLOAD_LIMITS.media).slice(0, 5);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setScreenshots((prev) => [...prev, { file, preview: e.target?.result as string, type }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeScreenshot = (idx: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadAllScreenshots = async () => {
    if (!user) throw new Error("Session expirée");
    const uploaded: { url: string; type: ScreenshotType }[] = [];
    for (const s of screenshots) {
      const safeName = sanitizeFileName(s.file.name);
      const path = `${user.id}/${s.type}-${safeName}`;
      const { error } = await supabase.storage.from("linkedin-audit-screenshots").upload(path, s.file, { contentType: s.file.type, upsert: false });
      if (error) throw error;
      // Bucket privé : URL signée (l'IA fetch l'image dans son TTL). getPublicUrl ne marchait pas sur ce bucket privé.
      const { data: signed, error: signErr } = await supabase.storage.from("linkedin-audit-screenshots").createSignedUrl(path, 3600);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Échec de la génération de l'URL signée");
      uploaded.push({ url: signed.signedUrl, type: s.type });
    }
    return uploaded;
  };

  const handleAnalyze = async () => {
    if (!user) return;
    setAnalyzing(true);
    setQuotaExhausted(null);
    try {
      const uploadedScreenshots = screenshots.length > 0 ? await uploadAllScreenshots() : [];

      const res = await invokeWithTimeout("linkedin-audit-ai", {
        body: {
          workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
          profileUrl,
          objective,
          currentRhythm: rhythm,
          avgViews,
          connectionsCount,
          recommendationsCount,
          screenshots: uploadedScreenshots,
          // Données récupérées automatiquement par l'app (remplacent l'ancien questionnaire)
          aboutText: autoData?.aboutText || undefined,
          profileChecklist: autoData?.checklist || undefined,
          appPostsCount30d: autoData?.appPostsCount30d,
          recentPosts: autoData?.recentPosts?.length ? autoData.recentPosts : undefined,
        },
      }, 120000);

      if (res.error) {
        const errorMsg = res.error.message || "";
        if (res.error.isRateLimit || /limit_reached|quota|limit/i.test(errorMsg)) {
          setQuotaExhausted({ message: errorMsg });
          return;
        }
        throw new Error(errorMsg);
      }

      let parsed: AuditResult;
      const content = res.data?.content || "";
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }

      setResult(parsed);

      // Save to DB
      await supabase.from("linkedin_audit").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        profile_url: profileUrl || null,
        objective,
        current_rhythm: rhythm,
        avg_views: avgViews,
        connections_count: connectionsCount,
        recommendations_count: recommendationsCount,
        screenshots: uploadedScreenshots,
        score_global: parsed.score_global,
        score_profil: parsed.sections?.profil?.score ?? 0,
        score_contenu: parsed.sections?.contenu?.score ?? 0,
        score_strategie: parsed.sections?.strategie?.score ?? 0,
        score_reseau: parsed.sections?.reseau?.score ?? 0,
        audit_result: parsed,
        top_priorities: parsed.top_5_priorities,
      } as any);

      setView("results");
      toast.success("Audit terminé ! 🎉");
    } catch (e: any) {
      const errStr = e?.message || String(e);
      if (/quota|crédit|limit_reached|limit/i.test(errStr)) {
        setQuotaExhausted({ message: "" });
      } else {
        toast.error("Erreur", { description: friendlyError(e) });
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Écran unique ──
  const autoFound: string[] = [];
  if (autoData?.aboutText) autoFound.push("ta section À propos");
  if (autoData?.checklist && Object.values(autoData.checklist).some((v) => v === true || typeof v === "string")) autoFound.push("ta checklist profil");
  if (autoData?.appPostsCount30d) autoFound.push(`tes ${autoData.appPostsCount30d} posts LinkedIn créés dans l'app (30 j)`);

  const renderForm = () => (
    <div className="space-y-6">
      {autoFound.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-rose-pale p-4">
          <p className="text-sm text-foreground">
            ✅ Déjà récupéré automatiquement : {autoFound.join(", ")}. L'audit s'appuie sur ces vraies données — plus rien à recopier.
          </p>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">🔗 URL de ton profil LinkedIn</label>
        <Input value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://linkedin.com/in/..." />
        <p className="text-xs text-muted-foreground mt-1 italic">On va lire ce que ta page publique montre.</p>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Ton objectif principal sur LinkedIn ?</label>
        <ChipSelect options={OBJECTIVE_OPTIONS} value={objective} onChange={setObjective} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">
          Ton rythme de publication ?
          {autoData?.appPostsCount30d ? <span className="text-xs text-muted-foreground font-normal"> (pré-rempli d'après tes posts créés dans l'app — corrige si tu publies aussi ailleurs)</span> : null}
        </label>
        <ChipSelect options={RHYTHM_OPTIONS} value={rhythm} onChange={setRhythm} />
      </div>

      {/* Les 3 données que LinkedIn ne laisse lire à personne (pas d'API analytics) */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tes 3 derniers posts ont eu combien de vues en moyenne ?</label>
        <ChipSelect options={VIEWS_OPTIONS} value={avgViews} onChange={setAvgViews} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Combien de connexions ?</label>
        <ChipSelect options={CONNECTIONS_OPTIONS} value={connectionsCount} onChange={setConnectionsCount} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu as des recommandations LinkedIn ?</label>
        <ChipSelect options={RECO_OPTIONS} value={recommendationsCount} onChange={setRecommendationsCount} />
      </div>

      {/* Captures facultatives, repliées : seul moyen de juger le visuel (photo, bannière, feed) */}
      <div>
        <button
          type="button"
          onClick={() => setShowScreenshots((s) => !s)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showScreenshots ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          📸 Ajouter des captures d'écran (facultatif — pour juger photo, bannière et feed)
        </button>
        {showScreenshots && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {UPLOAD_ZONES.map((zone) => {
              const zoneFiles = screenshots.filter((s) => s.type === zone.type);
              return (
                <div key={zone.type}>
                  <div
                    onClick={() => fileInputRefs.current[zone.type]?.click()}
                    className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-4 text-center cursor-pointer hover:border-primary/50 transition-colors min-h-[120px] flex flex-col items-center justify-center"
                  >
                    <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                    <p className="text-xs font-medium text-foreground">{zone.label}</p>
                    <p className="text-2xs text-muted-foreground">{zone.hint}</p>
                  </div>
                  <input
                    ref={(el) => { fileInputRefs.current[zone.type] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileAdd(zone.type, e.target.files)}
                  />
                  {zoneFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {zoneFiles.map((s) => {
                        const idx = screenshots.indexOf(s);
                        return (
                          <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
                            <img loading="lazy" src={s.preview} alt="Aperçu du post LinkedIn" className="w-full h-full object-cover" />
                            <button onClick={() => removeScreenshot(idx)} aria-label="Retirer cette capture" title="Retirer cette capture" className="absolute top-0 right-0 bg-background/80 rounded-full p-0.5"><X className="h-3 w-3" /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button onClick={handleAnalyze} disabled={analyzing} className="w-full rounded-pill gap-2 h-12 text-base">
        {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {analyzing ? "Analyse en cours..." : "🔍 Lancer l'audit"}
      </Button>
      {analyzing && <AiLoadingIndicator context="audit" isLoading={analyzing} />}
    </div>
  );

  const renderResults = () => {
    if (!result) return null;
    const g = getScoreInfo(result.score_global);
    const sections = [
      { key: "profil", label: "👤 Profil", icon: "👤" },
      { key: "contenu", label: "📝 Contenu", icon: "📝" },
      { key: "strategie", label: "🎯 Stratégie", icon: "🎯" },
      { key: "reseau", label: "🤝 Réseau", icon: "🤝" },
    ] as const;

    return (
      <div className="space-y-8 animate-fade-in">
        {/* ─── Global Score ─── */}
         <div className="rounded-2xl border-l-[3px] border-l-primary bg-rose-pale p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              🔍 Ton Audit LinkedIn
            </h2>
            <div className="flex items-center gap-3">
              {auditDate && (
                <span className="text-xs text-muted-foreground">
                  {new Date(auditDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-sm font-bold ${g.bg} ${g.color}`}>
                {g.emoji} {result.score_global}/100
              </span>
            </div>
          </div>
          <Progress value={result.score_global} className="h-2.5 mb-1" />
          <p className="text-2xs italic text-muted-foreground text-center mb-3">Score LinkedIn : présence et stratégie</p>
          {previousScore !== null && previousScore !== result.score_global && (
            <p className="text-sm text-muted-foreground">
              Audit précédent : {previousScore}/100 → {result.score_global > previousScore ? `+${result.score_global - previousScore} points 🎉` : `${result.score_global - previousScore} points`}
            </p>
          )}
        </div>

        {/* ─── Granular Scores ─── */}
        {result.granular_scores && <GranularScoresSection granular={result.granular_scores} />}

        {/* ─── Section scores ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {sections.map(({ key, label }) => {
            const s = result.sections[key];
            const si = getScoreInfo(s.score);
            return (
              <div key={key} className="rounded-2xl border border-border bg-card p-4 text-center">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className={`text-2xl font-bold ${si.color}`}>{s.score}/100</p>
                <Progress value={s.score} className="mt-2 h-2" />
              </div>
            );
          })}
        </div>

        {/* ─── Top 5 priorities as cards ─── */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
            🎯 Tes 5 priorités
          </h3>
          {result.top_5_priorities?.map((p) => (
            <div key={p.rank} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {p.rank}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-semibold text-foreground leading-tight">{p.title}</h4>
                    <span className="text-xs">{impactEmoji(p.impact)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{p.why}</p>
                </div>
              </div>
              {p.action_route && (
                <div className="pl-10">
                  <Link
                    to={p.action_route}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium bg-rose-pale px-3 py-1.5 rounded-pill"
                  >
                    ✨ {p.action_label} <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ─── Detail accordions ─── */}
        <Accordion type="multiple" className="space-y-2">
          {sections.map(({ key, label }) => {
            const s = result.sections[key];
            return (
              <AccordionItem key={key} value={key} className="rounded-2xl border border-border bg-card px-4">
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span>{label}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-pill ${getScoreInfo(s.score).bg} ${getScoreInfo(s.score).color}`}>
                      {s.score}/100
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {s.elements?.map((el, i) => {
                      const statusIcon = el.status === "good" ? "✅" : el.status === "warning" ? "⚠️" : "❌";
                      return (
                        <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">{statusIcon} {el.name}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-pill ${getScoreInfo(Math.round((el.score / el.max_score) * 100)).bg} ${getScoreInfo(Math.round((el.score / el.max_score) * 100)).color}`}>
                              {el.score}/{el.max_score}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{el.feedback}</p>
                          {el.recommendation && (
                            <div className="bg-accent/30 border-l-[3px] border-l-accent rounded-r-lg px-4 py-2">
                              <p className="text-sm text-foreground/80 italic">💡 {el.recommendation}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* ─── LinkedIn Pillar Action Plan ─── */}
        {(() => {
          const LINKEDIN_PILLAR_ACTIONS: Record<string, { label: string; route: string; emoji: string }> = {
            profil: { label: "Optimiser mon profil LinkedIn", route: "/linkedin/profil", emoji: "👤" },
            contenu: { label: "Créer du contenu LinkedIn", route: "/creer?canal=linkedin", emoji: "📝" },
            strategie: { label: "Structurer ma stratégie LinkedIn", route: "/linkedin/recommandations", emoji: "🎯" },
            reseau: { label: "Développer mon réseau", route: "/linkedin/engagement", emoji: "🤝" },
          };
          const sorted = (["profil", "contenu", "strategie", "reseau"] as const)
            .map(key => ({ key, ...LINKEDIN_PILLAR_ACTIONS[key], score: result.sections[key]?.score ?? 0 }))
            .sort((a, b) => a.score - b.score)
            .slice(0, 3);

          return (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
                📋 Ton plan d'action (par priorité)
              </h3>
              {sorted.map((item, i) => (
                <div key={item.key} className={`rounded-xl border p-4 flex items-center gap-3 ${i === 0 ? "border-primary/30 bg-[hsl(var(--rose-pale))]" : "border-border bg-card"}`}>
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{item.emoji} {item.label}</p>
                      {i === 0 && <span className="text-2xs bg-primary/10 text-primary px-2 py-0.5 rounded-pill font-semibold">Priorité #1</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.score}/100</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-xs gap-1"
                    onClick={() => navigate(item.route)}
                  >
                    {item.emoji} Y aller <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Red flags checker */}
        <RedFlagsChecker
          content={Object.values(result.sections).map((s: any) => `${s.feedback || ""}\n${s.recommendation || ""}`).join("\n\n")}
          onFix={() => {}}
        />
        <AiGeneratedMention />

        {/* ─── Actions ─── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => { setPreviousScore(result?.score_global ?? null); setView("form"); setResult(null); setAuditDate(null); }} variant="outline" className="gap-2 rounded-pill">
            <RotateCcw className="h-4 w-4" /> Refaire l'audit
          </Button>
          <Button onClick={() => navigate("/linkedin")} className="gap-2 rounded-pill">
            Retour à Mon LinkedIn <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon LinkedIn" parentTo="/linkedin" currentLabel="Audit" useFromParam />

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">🔍 Audit de ton profil LinkedIn</h1>
        <p className="text-sm text-muted-foreground mb-6">
          L'IA analyse ton profil, ton contenu, ta stratégie et ton réseau pour te donner un score et des priorités d'action.
        </p>

        {loadingExisting ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
        <>
        {/* Quota exhausted */}
        {quotaExhausted && !analyzing && (
          <QuotaExhaustedCard
            category="audits"
            renewalMessage={quotaExhausted.message || undefined}
            plan={plan}
          />
        )}

        {view === "form" ? renderForm() : renderResults()}
        </>
        )}
      </main>
    </div>
  );
}

/* ─── Granular Scores Sub-component ─── */

const HEADLINE_CRITERIA: Record<string, string> = {
  impact_80_chars: "Impact des 80 premiers caractères",
  keywords: "Mots-clés recherchables",
  structure: "Structure claire",
  no_buzzwords: "Zéro buzzwords vides",
  value_prop: "Proposition de valeur visible",
};

const ABOUT_CRITERIA: Record<string, string> = {
  hook_3_lines: "Hook des 3 premières lignes",
  storytelling: "Storytelling / structure narrative",
  cta: "CTA clair",
  social_proof: "Preuve sociale / crédibilité",
  tone_coherence: "Ton cohérent avec le branding",
};

function GranularBar({ score, max, label, feedback }: { score: number; max: number; label: string; feedback: string }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color = pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-error";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground font-medium">{label}</span>
        <span className="text-xs font-bold text-muted-foreground tabular-nums">{score}/{max}</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{feedback}</p>
    </div>
  );
}

function GranularScoresSection({ granular }: { granular: { headline?: GranularSection; about?: GranularSection } }) {
  const renderSection = (
    data: GranularSection | undefined,
    criteriaMap: Record<string, string>,
    emoji: string,
    title: string,
    maxTotal: number,
  ) => {
    if (!data) return null;
    const total = typeof data.total === "number" ? data.total : 0;
    const si = getScoreInfo(Math.round((total / maxTotal) * 100));

    return (
      <AccordionItem value={title} className="rounded-2xl border border-border bg-card px-4">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2">
            <span>{emoji} {title}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-pill ${si.bg} ${si.color}`}>
              {total}/{maxTotal}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pt-2">
            {Object.entries(criteriaMap).map(([key, label]) => {
              const criterion = data[key];
              if (!criterion || typeof criterion === "number") return null;
              const c = criterion as GranularCriterion;
              return <GranularBar key={key} score={c.score} max={c.max} label={label} feedback={c.feedback} />;
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
        🔬 Scoring granulaire
      </h3>
      <Accordion type="multiple" className="space-y-2">
        {renderSection(granular.headline, HEADLINE_CRITERIA, "📝", "Headline", 25)}
        {renderSection(granular.about, ABOUT_CRITERIA, "📄", "À propos", 25)}
      </Accordion>
    </div>
  );
}
