import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Sparkles, Upload, X, Loader2, ArrowRight, ArrowLeft, ChevronRight, Download, RotateCcw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

// ── Types ──
type ScreenshotType = "profile" | "about" | "feed" | "experience" | "other";
interface ScreenshotFile { file: File; preview: string; type: ScreenshotType; }

interface AuditElement { name: string; score: number; max_score: number; status: string; feedback: string; recommendation: string; }
interface AuditSection { score: number; elements: AuditElement[]; }
interface Priority { rank: number; title: string; impact: string; why: string; action_label: string; action_route: string; }
interface AuditResult {
  score_global: number;
  sections: { profil: AuditSection; contenu: AuditSection; strategie: AuditSection; reseau: AuditSection };
  top_5_priorities: Priority[];
}

// ── Constants ──
const STEPS = ["Screenshots", "Profil", "Contenu", "Stratégie", "Réseau"];
const OBJECTIVE_OPTIONS = [
  "Trouver des client·es (Academy)",
  "Trouver des client·es (Agency)",
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

  const [step, setStep] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);

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

  // Load previous audit
  useEffect(() => {
    if (!user) return;
    supabase
      .from("linkedin_audit")
      .select("score_global")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.score_global) setPreviousScore(data.score_global);
      });
  }, [user]);

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
                          <img src={s.preview} alt="" className="w-full h-full object-cover" />
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
      <div className="space-y-8">
        {/* Global score */}
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <h2 className="text-lg font-bold text-foreground mb-1">🔍 Ton Audit LinkedIn</h2>
          <p className={`text-4xl font-bold ${g.color}`}>{result.score_global}/100</p>
          <Progress value={result.score_global} className="mt-3 h-3" />
          {previousScore !== null && previousScore !== result.score_global && (
            <p className="text-sm text-muted-foreground mt-2">
              Audit précédent : {previousScore}/100 → {result.score_global > previousScore ? `+${result.score_global - previousScore} points 🎉` : `${result.score_global - previousScore} points`}
            </p>
          )}
        </div>

        {/* Section scores */}
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

        {/* Top 5 priorities */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-bold text-foreground mb-4">🎯 Tes 5 priorités</h3>
          <div className="space-y-4">
            {result.top_5_priorities?.map((p) => (
              <div key={p.rank} className="flex gap-3 items-start">
                <span className="text-lg">{impactEmoji(p.impact)}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">{p.rank}. {p.title}</p>
                  <p className="text-sm text-muted-foreground">{p.why}</p>
                  {p.action_route && (
                    <Link to={p.action_route} className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-1">
                      ✨ {p.action_label} <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail accordions */}
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
                        <div key={i} className="border-l-2 border-l-primary/20 pl-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">{statusIcon} {el.name}</p>
                            <span className="text-xs text-muted-foreground font-mono">{el.score}/{el.max_score}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{el.feedback}</p>
                          {el.recommendation && (
                            <p className="text-sm text-primary/80 mt-1 italic">→ {el.recommendation}</p>
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

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => { setStep(0); setResult(null); }} variant="outline" className="gap-2 rounded-pill">
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
          <div className="flex justify-between mt-8">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="gap-2 rounded-pill">
                <ArrowLeft className="h-4 w-4" /> Retour
              </Button>
            ) : <div />}
            <Button onClick={handleNext} disabled={analyzing} className="gap-2 rounded-pill">
              {analyzing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours...</>
              ) : step === 4 ? (
                <><Sparkles className="h-4 w-4" /> Voir mon audit complet</>
              ) : (
                <>Suivant <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
