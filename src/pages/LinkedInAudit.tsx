import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Sparkles, Upload, X, Loader2, ArrowRight, ArrowLeft, ChevronRight, Download, RotateCcw } from "lucide-react";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import { Link, useNavigate } from "react-router-dom";

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
const STEPS = ["Screenshots", "Profil", "Contenu", "Stratégie", "Réseau"];
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
const CONNECTION_TYPE_OPTIONS = ["Des gens de mon secteur", "Des client·es potentiel·les", "D'ancien·nes collègues", "Des gens ajouté·es en masse", "Des partenaires", "Un mix de tout ça"];
const ACCEPTANCE_OPTIONS = ["Toutes", "Seulement celles avec un message", "Seulement celles de mon secteur", "Je n'y pense pas souvent"];
const PROACTIVE_OPTIONS = ["Jamais", "Parfois (quand je rencontre quelqu'un)", "Régulièrement (stratégie de networking)"];
const RECO_OPTIONS = ["0", "1-3", "4-10", "Plus de 10"];
const CONTENT_TYPE_OPTIONS = ["Posts texte (opinion)", "Carrousels PDF", "Partage d'articles", "Vidéos", "Storytelling personnel", "Contenu éducatif", "Actualité du secteur", "Je publie rarement"];
const ENGAGEMENT_TYPE_OPTIONS = ["Beaucoup de likes mais peu de commentaires", "Peu de likes et peu de commentaires", "Des commentaires de qualité", "Rien du tout"];
const ACCROCHE_OPTIONS = ["Je suis content·e de partager...", "J'ai une question pour vous...", "Ce matin, j'ai réalisé un truc...", "Je ne sais jamais comment commencer"];
const RECYCLING_OPTIONS = ["Oui, je copie-colle", "Oui, j'adapte le ton et le format", "Non, je crée du contenu séparé", "Non, je ne publie pas sur Instagram"];
const PUB_ORG_OPTIONS = ["Quand j'ai le temps / l'inspiration", "J'essaie de tenir un rythme mais j'y arrive pas", "J'ai un créneau dédié chaque semaine", "J'ai un calendrier éditorial"];
const INBOUND_OPTIONS = ["Jamais", "Rarement (1-2/mois)", "Régulièrement (1-2/semaine)", "Souvent (presque chaque jour)"];

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
  if (score >= 70) return { color: "text-green-600", bg: "bg-green-100", emoji: "🟢" };
  if (score >= 40) return { color: "text-yellow-600", bg: "bg-yellow-100", emoji: "🟡" };
  return { color: "text-red-600", bg: "bg-red-100", emoji: "🔴" };
}

function impactEmoji(impact: string) {
  if (impact === "high") return "🔴";
  if (impact === "medium") return "🟡";
  return "🟢";
}

export default function LinkedInAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [step, setStep] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Step 1 data
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [profileUrl, setProfileUrl] = useState("");
  const [objective, setObjective] = useState("");
  const [rhythm, setRhythm] = useState("");
  const [avgViews, setAvgViews] = useState("");
  const [connectionsCount, setConnectionsCount] = useState("");

  // Step 3 data
  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [engagementType, setEngagementType] = useState("");
  const [accrocheStyle, setAccrocheStyle] = useState("");

  // Step 4 data
  const [recycling, setRecycling] = useState("");
  const [pubOrg, setPubOrg] = useState("");
  const [inboundRequests, setInboundRequests] = useState("");

  // Step 5 data
  const [connectionTypes, setConnectionTypes] = useState<string[]>([]);
  const [acceptancePolicy, setAcceptancePolicy] = useState("");
  const [proactiveRequests, setProactiveRequests] = useState("");
  const [recommendationsCount, setRecommendationsCount] = useState("");

  const fileInputRefs = useRef<Record<ScreenshotType, HTMLInputElement | null>>({} as any);

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
          setStep(5);
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
    const newFiles = Array.from(fileList).filter((f) => f.size <= 10 * 1024 * 1024).slice(0, 5);
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
    const uploaded: { url: string; type: ScreenshotType }[] = [];
    for (const s of screenshots) {
      const safeName = sanitizeFileName(s.file.name);
      const path = `${user!.id}/${s.type}-${safeName}`;
      const { error } = await supabase.storage.from("linkedin-audit-screenshots").upload(path, s.file, { contentType: s.file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("linkedin-audit-screenshots").getPublicUrl(path);
      uploaded.push({ url: data.publicUrl, type: s.type });
    }
    return uploaded;
  };

  const handleAnalyze = async () => {
    if (!user) return;
    setAnalyzing(true);
    try {
      const uploadedScreenshots = screenshots.length > 0 ? await uploadAllScreenshots() : [];

      const res = await supabase.functions.invoke("linkedin-audit-ai", {
        body: {
          workspace_id: workspaceId,
          profileUrl,
          objective,
          currentRhythm: rhythm,
          avgViews,
          connectionsCount,
          connectionTypes,
          acceptancePolicy,
          proactiveRequests,
          recommendationsCount,
          contentTypes,
          engagementType,
          accrocheStyle: accrocheStyle,
          recycling,
          publicationOrg: pubOrg,
          inboundRequests,
          screenshots: uploadedScreenshots,
        },
      });

      if (res.error) throw new Error(res.error.message);

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
        profile_url: profileUrl || null,
        objective,
        current_rhythm: rhythm,
        avg_views: avgViews,
        connections_count: connectionsCount,
        connection_types: connectionTypes,
        acceptance_policy: acceptancePolicy,
        proactive_requests: proactiveRequests,
        recommendations_count: recommendationsCount,
        content_types: contentTypes,
        engagement_type: engagementType,
        accroche_style: accrocheStyle,
        recycling,
        publication_org: pubOrg,
        inbound_requests: inboundRequests,
        screenshots: uploadedScreenshots,
        score_global: parsed.score_global,
        score_profil: parsed.sections?.profil?.score ?? 0,
        score_contenu: parsed.sections?.contenu?.score ?? 0,
        score_strategie: parsed.sections?.strategie?.score ?? 0,
        score_reseau: parsed.sections?.reseau?.score ?? 0,
        audit_result: parsed,
        top_priorities: parsed.top_5_priorities,
      } as any);

      setStep(5); // results
      toast({ title: "Audit terminé ! 🎉" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const canProceed = (s: number) => {
    if (s === 0) return true; // screenshots optional
    return true;
  };

  const handleNext = () => {
    if (step === 4) {
      handleAnalyze();
    } else {
      setStep((s) => s + 1);
    }
  };

  // ── Render steps ──
  const renderStep0 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground mb-2">📸 Montre-moi ton profil LinkedIn</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload tes screenshots pour que l'IA puisse analyser ton profil en détail. Plus tu en mets, plus l'audit sera précis.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                  <p className="text-[10px] text-muted-foreground">{zone.hint}</p>
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
                          <img src={s.preview} alt="Aperçu du post LinkedIn" className="w-full h-full object-cover" />
                          <button onClick={() => removeScreenshot(idx)} className="absolute top-0 right-0 bg-background/80 rounded-full p-0.5"><X className="h-3 w-3" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="rounded-xl bg-rose-pale p-3 mt-3">
          <p className="text-xs text-muted-foreground">💡 Plus tu uploades de screenshots, plus l'audit sera précis. Mais même 1 seul suffit pour commencer.</p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">🔗 URL de ton profil LinkedIn (optionnel)</label>
        <Input value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://linkedin.com/in/..." />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Ton objectif principal sur LinkedIn ?</label>
        <ChipSelect options={OBJECTIVE_OPTIONS} value={objective} onChange={setObjective} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Ton rythme actuel de publication ?</label>
        <ChipSelect options={RHYTHM_OPTIONS} value={rhythm} onChange={setRhythm} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tes 3 derniers posts ont eu combien de vues en moyenne ?</label>
        <ChipSelect options={VIEWS_OPTIONS} value={avgViews} onChange={setAvgViews} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Combien de connexions ?</label>
        <ChipSelect options={CONNECTIONS_OPTIONS} value={connectionsCount} onChange={setConnectionsCount} />
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">👤 Audit de ton profil</h2>
      <p className="text-sm text-muted-foreground">
        L'IA va évaluer chaque élément de ton profil : photo, bannière, titre, À propos, expériences, recommandations, etc.
      </p>
      <div className="rounded-2xl bg-rose-pale p-5">
        <p className="text-sm text-muted-foreground">
          📋 Les éléments analysés : Photo de profil, Bannière, Titre (headline), Section À propos, Expériences, Formation, Compétences, Recommandations, Sélection de contenus, URL personnalisée, Mode Créateur.
        </p>
      </div>
      <p className="text-xs text-muted-foreground italic">L'analyse sera basée sur tes screenshots et les infos fournies. Continue pour compléter les questions.</p>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">📝 Audit de ton contenu</h2>
      <p className="text-sm text-muted-foreground mb-2">Quelques questions sur tes publications LinkedIn.</p>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Quel type de contenu tu publies le plus ?</label>
        <ChipSelect options={CONTENT_TYPE_OPTIONS} value={contentTypes} onChange={setContentTypes} multi />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tes posts génèrent plutôt :</label>
        <ChipSelect options={ENGAGEMENT_TYPE_OPTIONS} value={engagementType} onChange={setEngagementType} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tes 3 premiers mots quand tu écris un post :</label>
        <ChipSelect options={ACCROCHE_OPTIONS} value={accrocheStyle} onChange={setAccrocheStyle} />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">🎯 Ta stratégie LinkedIn</h2>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu publies plutôt :</label>
        <ChipSelect options={PUB_ORG_OPTIONS} value={pubOrg} onChange={setPubOrg} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu recycles tes contenus Instagram sur LinkedIn ?</label>
        <ChipSelect options={RECYCLING_OPTIONS} value={recycling} onChange={setRecycling} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu commentes les posts des autres ?</label>
        <ChipSelect options={["Rarement", "Parfois (quand ça me parle)", "Régulièrement (5-10 commentaires/semaine)", "Beaucoup (presque tous les jours)"]} value={engagementType || ""} onChange={setEngagementType} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu reçois des demandes entrantes via LinkedIn ?</label>
        <ChipSelect options={INBOUND_OPTIONS} value={inboundRequests} onChange={setInboundRequests} />
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">🤝 Ton réseau LinkedIn</h2>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tes connexions sont principalement :</label>
        <ChipSelect options={CONNECTION_TYPE_OPTIONS} value={connectionTypes} onChange={setConnectionTypes} multi />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu acceptes les demandes de connexion :</label>
        <ChipSelect options={ACCEPTANCE_OPTIONS} value={acceptancePolicy} onChange={setAcceptancePolicy} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu envoies des demandes de connexion proactives ?</label>
        <ChipSelect options={PROACTIVE_OPTIONS} value={proactiveRequests} onChange={setProactiveRequests} />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Tu as des recommandations LinkedIn ?</label>
        <ChipSelect options={RECO_OPTIONS} value={recommendationsCount} onChange={setRecommendationsCount} />
      </div>
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
          <Progress value={result.score_global} className="h-2.5 mb-3" />
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
                    <h4 className="text-[15px] font-semibold text-foreground leading-tight">{p.title}</h4>
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
            contenu: { label: "Améliorer ma stratégie de contenu", route: "/linkedin/post", emoji: "📝" },
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
                      {i === 0 && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-pill font-semibold">Priorité #1</span>}
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

        {/* ─── Actions ─── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => { setPreviousScore(result?.score_global ?? null); setStep(0); setResult(null); setAuditDate(null); }} variant="outline" className="gap-2 rounded-pill">
            <RotateCcw className="h-4 w-4" /> Refaire l'audit
          </Button>
          <Button onClick={() => navigate("/linkedin")} className="gap-2 rounded-pill">
            Retour au hub LinkedIn <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon LinkedIn" parentTo="/linkedin" currentLabel="Audit" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">🔍 Audit de ton profil LinkedIn</h1>
        <p className="text-sm text-muted-foreground mb-6">
          L'IA analyse ton profil, ton contenu, ta stratégie et ton réseau pour te donner un score et des priorités d'action.
        </p>

        {loadingExisting ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
        <>
        {/* Stepper */}
        {step < 5 && (
          <div className="flex items-center gap-1 mb-8">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                  i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="text-[10px] font-medium text-muted-foreground hidden sm:inline">{s}</span>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step content */}
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderResults()}

        {/* Navigation */}
        {step < 5 && (
          <>
            <div className="flex justify-between mt-8">
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="gap-2 rounded-pill">
                  <ArrowLeft className="h-4 w-4" /> Retour
                </Button>
              ) : <div />}
              <Button onClick={handleNext} disabled={analyzing} className="gap-2 rounded-pill">
                {step === 4 && !analyzing ? (
                  <><Sparkles className="h-4 w-4" /> Voir mon audit complet</>
                ) : step === 4 && analyzing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours...</>
                ) : (
                  <>Suivant <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
            {analyzing && (
              <div className="mt-6">
                <AiLoadingIndicator context="audit" isLoading={analyzing} />
              </div>
            )}
          </>
        )}
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
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

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
