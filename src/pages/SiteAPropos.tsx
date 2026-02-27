import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import AboutOptimizeResult from "@/components/site/AboutOptimizeResult";
import PreGenCoaching, { type PreGenBrief } from "@/components/coach/PreGenCoaching";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, RefreshCw, FileText, Pencil, Check, ArrowRight, Sparkles, Wrench, Lightbulb } from "lucide-react";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import AiGeneratedMention from "@/components/AiGeneratedMention";

interface ValueBlock { title: string; description: string }

interface AboutData {
  id?: string;
  angle?: string;
  title?: string;
  story?: string;
  values_blocks?: ValueBlock[];
  approach?: string;
  for_whom?: string;
  cta?: string;
  custom_facts?: { label: string; value: string }[];
}

const ANGLES = [
  { id: "lettre", emoji: "💌", label: "La lettre ouverte", desc: "Ton intimiste, comme si tu écrivais à ta future cliente." },
  { id: "manifeste", emoji: "✊", label: "Le manifeste", desc: "Ton engagé, tes convictions d'abord." },
  { id: "parcours", emoji: "🛤️", label: "Le parcours", desc: "Ton narratif, chronologique, ton histoire." },
];

const FOCUS_CHIPS = ["Mon histoire", "L'accroche", "Le ton", "La structure", "Tout"];

type Mode = "entry" | "coaching" | "from-scratch" | "optimize-input" | "optimize-loading" | "optimize-result" | "display";

export default function SiteAPropos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const profileUserId = useProfileUserId();
  const [data, setData] = useState<AboutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [exporting, setExporting] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);

  // Coaching brief state
  const [coachingBrief, setCoachingBrief] = useState<PreGenBrief | null>(null);
  const [recommendedAngle, setRecommendedAngle] = useState<string | null>(null);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);

  // Optimize mode state
  const [mode, setMode] = useState<Mode>("entry");
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [optimizeUrl, setOptimizeUrl] = useState("");
  const [optimizeText, setOptimizeText] = useState("");
  const [optimizeFocus, setOptimizeFocus] = useState("");
  const [optimizeResult, setOptimizeResult] = useState<any>(null);
  const [originalText, setOriginalText] = useState("");
  const [useAudit, setUseAudit] = useState(true);
  const [auditScore, setAuditScore] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    (supabase.from("website_about") as any).select("*").eq(column, value).maybeSingle()
      .then(({ data: d }: any) => {
        if (d) {
          setData({
            ...d,
            values_blocks: Array.isArray(d.values_blocks) ? d.values_blocks as unknown as ValueBlock[] : [],
            custom_facts: Array.isArray(d.custom_facts) ? d.custom_facts as unknown as { label: string; value: string }[] : [],
          });
          setSelectedAngle(d.angle || null);
          if (d.title) setMode("display");
        }
        setLoading(false);
      });
    // Check for existing audit
    (supabase.from("website_audit") as any)
      .select("scores")
      .eq(column, value)
      .eq("completed", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: a }: any) => {
        if (a?.scores) {
          const scores = typeof a.scores === "string" ? JSON.parse(a.scores) : a.scores;
          const confiance = scores?.confiance || scores?.trust;
          if (confiance) {
            const s = confiance.max ? Math.round((confiance.score / confiance.max) * 100) : confiance.score;
            setAuditScore(s);
          }
        }
      });
  }, [user?.id]);

  const generate = async (angle: string) => {
    if (!user) return;
    setGenerating(true);
    setSelectedAngle(angle);
    try {
      const body: any = { action: "about-page", angle, workspace_id: workspaceId !== user?.id ? workspaceId : undefined };
      if (coachingBrief?.summary) {
        body.pre_gen_brief = coachingBrief.summary;
      }
      const { data: fnData, error } = await supabase.functions.invoke("website-ai", { body });
      if (error) throw error;
      const raw = fnData.content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);

      const aboutData: AboutData = {
        angle,
        title: parsed.title,
        story: parsed.story,
        values_blocks: parsed.values || [],
        approach: parsed.approach,
        for_whom: parsed.for_whom,
        cta: parsed.cta,
      };

      const { data: existing } = await (supabase.from("website_about") as any).select("id").eq(column, value).maybeSingle();
      if (existing) {
        await (supabase.from("website_about") as any).update({ ...aboutData, updated_at: new Date().toISOString() }).eq(column, value);
        setData({ ...aboutData, id: existing.id, custom_facts: data?.custom_facts || [] });
      } else {
        const { data: inserted } = await supabase.from("website_about").insert({
          user_id: user.id,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          ...aboutData,
        } as any).select("id").single();
        setData({ ...aboutData, id: inserted?.id, custom_facts: [] });
      }
      setMode("display");
      toast({ title: "Page à propos générée !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCoachingComplete = (brief: PreGenBrief) => {
    setCoachingBrief(brief);
    // Detect recommended angle from brief
    const summary = (brief.summary || "").toLowerCase();
    let detected: string | null = null;
    if (summary.includes("lettre") || summary.includes("intimiste") || summary.includes("personnel")) {
      detected = "lettre";
    } else if (summary.includes("manifeste") || summary.includes("engag") || summary.includes("conviction")) {
      detected = "manifeste";
    } else if (summary.includes("parcours") || summary.includes("histoire") || summary.includes("chronolog")) {
      detected = "parcours";
    }
    if (brief.detected_angle) {
      const a = brief.detected_angle.toLowerCase();
      if (a.includes("lettre")) detected = "lettre";
      else if (a.includes("manifeste")) detected = "manifeste";
      else if (a.includes("parcours")) detected = "parcours";
    }
    setRecommendedAngle(detected);
    setMode("from-scratch");
  };

  const handleOptimize = async () => {
    if (!user) return;
    const url = inputMode === "url" ? optimizeUrl.trim() : undefined;
    const text = inputMode === "text" ? optimizeText.trim() : undefined;
    if (!url && !text) {
      toast({ title: "Fournis l'URL de ta page ou colle ton texte", variant: "destructive" });
      return;
    }
    setOriginalText(text || "");
    setMode("optimize-loading");
    try {
      const { data: fnData, error } = await supabase.functions.invoke("website-ai", {
        body: {
          action: "optimize-about",
          url,
          current_text: text,
          focus: optimizeFocus.trim() || undefined,
          workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
        },
      });
      if (error) throw error;
      const raw = fnData.content?.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);
      setOptimizeResult(parsed);
      if (!text && url) setOriginalText("(contenu extrait de " + url + ")");
      setMode("optimize-result");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setMode("optimize-input");
    }
  };

  const copyAll = () => {
    if (!data) return;
    const parts = [
      data.title, data.story,
      data.values_blocks?.map(v => `${v.title}\n${v.description}`).join("\n\n"),
      data.approach, data.for_whom, data.cta,
    ].filter(Boolean);
    navigator.clipboard.writeText(parts.join("\n\n---\n\n"));
    toast({ title: "Copié !" });
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = async (field: string) => {
    if (!user || !data) return;
    const update: any = { [field]: editValue, updated_at: new Date().toISOString() };
    await (supabase.from("website_about") as any).update(update).eq(column, value);
    setData({ ...data, [field]: editValue });
    setEditingField(null);
    toast({ title: "Sauvegardé !" });
  };

  const exportPDF = async () => {
    if (!recapRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      const canvas = await html2canvas(recapRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgW, imgH);
      pdf.save("ma-page-a-propos.pdf");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  // ─── ENTRY SCREEN ───
  if (mode === "entry") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />
          <h1 className="font-display text-[26px] font-bold text-foreground mb-2">📖 Ma page À propos</h1>
          <p className="text-[15px] text-muted-foreground mb-8">
            Raconte ton histoire pour créer du lien. L'IA t'aide à trouver les mots.
          </p>

          <div className="space-y-4">
            {/* Card 1: From scratch → coaching first */}
            <button
              onClick={() => setMode("coaching")}
              className="w-full text-left rounded-2xl border-2 border-border hover:border-primary hover:shadow-md bg-card p-6 transition-all group"
            >
              <div className="flex items-start gap-4">
                <span className="flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="h-6 w-6" />
                </span>
                <div className="flex-1">
                  <p className="font-display text-base font-bold text-foreground">✨ Rédiger ma page de zéro</p>
                  <p className="text-[13px] text-muted-foreground mt-1">Tu n'as pas encore de page À propos ? On la crée ensemble.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground mt-1 group-hover:text-primary transition-colors" />
              </div>
            </button>

            {/* Card 2: Optimize existing */}
            <button
              onClick={() => setMode("optimize-input")}
              className="w-full text-left rounded-2xl border-2 border-border hover:border-primary hover:shadow-md bg-card p-6 transition-all group"
            >
              <div className="flex items-start gap-4">
                <span className="flex items-center justify-center h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 shrink-0 group-hover:bg-amber-500/20 transition-colors">
                  <Wrench className="h-6 w-6" />
                </span>
                <div className="flex-1">
                  <p className="font-display text-base font-bold text-foreground">🔧 Améliorer ma page existante</p>
                  <p className="text-[13px] text-muted-foreground mt-1">Tu as déjà une page ? Colle ton URL ou ton texte, l'IA l'améliore.</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground mt-1 group-hover:text-primary transition-colors" />
              </div>
            </button>
          </div>

          {data?.title && (
            <button onClick={() => setMode("display")} className="mt-6 text-sm text-primary hover:underline">
              📄 Voir ma page À propos actuelle →
            </button>
          )}
        </main>
      </div>
    );
  }

  // ─── COACHING PRÉ-GÉNÉRATION ───
  if (mode === "coaching") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />
          <button onClick={() => setMode("entry")} className="text-sm text-primary hover:underline mb-4 inline-block">← Retour</button>
          <h1 className="font-display text-[22px] font-bold text-foreground mb-2">💬 On cadre ta page ensemble</h1>
          <p className="text-[15px] text-muted-foreground mb-6">
            Quelques questions rapides pour que l'IA rédige une page qui te ressemble vraiment.
          </p>
          <PreGenCoaching
            generationType="about-page"
            onComplete={handleCoachingComplete}
            onSkip={() => {
              setCoachingBrief(null);
              setRecommendedAngle(null);
              setMode("from-scratch");
            }}
          />
        </main>
      </div>
    );
  }

  // ─── FROM SCRATCH: Angle selection ───
  if (mode === "from-scratch") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />
          <button onClick={() => setMode("entry")} className="text-sm text-primary hover:underline mb-4 inline-block">← Retour</button>
          <h1 className="font-display text-[26px] font-bold text-foreground mb-2">✨ Rédiger ma page de zéro</h1>
          <p className="text-[15px] text-muted-foreground mb-4">
            L'IA rédige ta page à propos à partir de ton branding. Choisis un angle.
          </p>

          {/* Coaching recommendation banner */}
          {coachingBrief && recommendedAngle && (
            <div className="rounded-xl border border-primary/20 bg-rose-pale p-4 mb-6">
              <p className="text-sm text-foreground">
                💡 D'après notre échange, je te recommande l'angle <strong>« {ANGLES.find(a => a.id === recommendedAngle)?.label} »</strong> 👇
              </p>
            </div>
          )}

          <div className="space-y-3">
            {ANGLES.map(a => (
              <button
                key={a.id}
                onClick={() => generate(a.id)}
                disabled={generating}
                className={`w-full text-left rounded-2xl border-2 p-5 transition-all ${
                  generating && selectedAngle === a.id
                    ? "border-primary bg-rose-pale"
                    : recommendedAngle === a.id && !generating
                    ? "border-primary bg-rose-pale shadow-sm"
                    : "border-border hover:border-primary hover:shadow-md bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{a.emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-base font-bold text-foreground">{a.label}</p>
                      {recommendedAngle === a.id && !generating && (
                        <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary text-primary-foreground">recommandé</span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground">{a.desc}</p>
                  </div>
                  {generating && selectedAngle === a.id && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                </div>
              </button>
            ))}
          </div>

          {generating && (
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground animate-pulse">✨ Génération en cours... L'IA rédige ta page à propos.</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── OPTIMIZE INPUT ───
  if (mode === "optimize-input") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />
          <button onClick={() => setMode("entry")} className="text-sm text-primary hover:underline mb-4 inline-block">← Retour</button>
          <h1 className="font-display text-[26px] font-bold text-foreground mb-2">🔧 Améliorer ma page existante</h1>
          <p className="text-[15px] text-muted-foreground mb-6">
            Colle ton URL ou ton texte, l'IA l'analyse et te propose une version améliorée.
          </p>

          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${inputMode === "url" ? "text-foreground" : "text-muted-foreground"}`}>Coller l'URL</span>
              <Switch checked={inputMode === "text"} onCheckedChange={(checked) => setInputMode(checked ? "text" : "url")} />
              <span className={`text-sm font-medium ${inputMode === "text" ? "text-foreground" : "text-muted-foreground"}`}>Coller le texte</span>
            </div>

            {inputMode === "url" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">URL de ta page À propos</label>
                <Input value={optimizeUrl} onChange={(e) => setOptimizeUrl(e.target.value)} placeholder="https://monsite.com/a-propos" className="rounded-xl" />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Texte de ta page</label>
                <Textarea value={optimizeText} onChange={(e) => setOptimizeText(e.target.value)} placeholder="Colle le texte de ta page À propos actuelle..." className="rounded-xl min-h-[120px]" />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Qu'est-ce que tu veux améliorer ? <span className="text-muted-foreground font-normal">(optionnel)</span>
              </label>
              <Textarea value={optimizeFocus} onChange={(e) => setOptimizeFocus(e.target.value)} placeholder="Ex: Mon histoire sonne faux, c'est trop long, on dirait une fiche Wikipedia..." className="rounded-xl min-h-[70px]" />
              <div className="flex flex-wrap gap-1.5">
                {FOCUS_CHIPS.map(chip => (
                  <button key={chip} onClick={() => setOptimizeFocus(prev => prev ? `${prev}, ${chip}` : chip)} className="font-mono-ui text-[11px] font-semibold px-3 py-1 rounded-pill border border-border bg-card hover:border-primary hover:bg-rose-pale transition-colors">
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {auditScore !== null && (
              <div className="rounded-xl border border-primary/20 bg-rose-pale p-4 space-y-2">
                <p className="text-sm text-foreground">
                  💡 Tu as un audit site avec un score confiance de <strong>{auditScore}/100</strong>. L'IA va utiliser ces recommandations pour améliorer ta page.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={useAudit} onChange={(e) => setUseAudit(e.target.checked)} className="rounded border-border text-primary focus:ring-primary h-4 w-4" />
                  <span className="text-sm text-foreground">Utiliser les recommandations de mon audit</span>
                </label>
              </div>
            )}

            <Button onClick={handleOptimize} disabled={inputMode === "url" ? !optimizeUrl.trim() : !optimizeText.trim()} className="w-full sm:w-auto rounded-pill gap-2">
              ✨ Analyser et améliorer
            </Button>
            <p className="text-xs text-muted-foreground">~30 secondes · L'IA analyse ta page et propose des améliorations</p>
          </div>
        </main>
      </div>
    );
  }

  // ─── OPTIMIZE LOADING ───
  if (mode === "optimize-loading") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[700px] px-6 py-12 max-md:px-4">
          <AiLoadingIndicator isLoading={true} context="audit" />
        </main>
      </div>
    );
  }

  // ─── OPTIMIZE RESULT ───
  if (mode === "optimize-result" && optimizeResult) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />
          <button onClick={() => setMode("entry")} className="text-sm text-primary hover:underline mb-4 inline-block">← Retour</button>
          <h1 className="font-display text-[22px] font-bold text-foreground mb-6">🔧 Résultats de l'optimisation</h1>
          <AboutOptimizeResult result={optimizeResult} originalText={originalText} onRetry={() => setMode("optimize-input")} userId={profileUserId} />
          <div className="mt-6">
            <RedFlagsChecker
              content={optimizeResult?.sections?.map((s: any) => s.improved || s.original || "").join("\n\n") || optimizeResult?.summary || ""}
              onFix={() => {}}
            />
          </div>
          <AiGeneratedMention />
        </main>
      </div>
    );
  }

  // ─── DISPLAY GENERATED PAGE ───
  if (mode === "display" && data?.title) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon Site Web" parentTo="/site" currentLabel="Page à propos" />

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setMode("entry")} className="gap-1.5">
              ← Modifier
            </Button>
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copier tout
            </Button>
            <Button variant="outline" size="sm" onClick={() => generate(data.angle || "parcours")} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Regénérer
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting}>
              <FileText className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowIdeasDialog(true)}>
              <Lightbulb className="h-3.5 w-3.5 mr-1" /> Sauvegarder en idée
            </Button>
          </div>
          <SaveToIdeasDialog
            open={showIdeasDialog}
            onOpenChange={setShowIdeasDialog}
            contentType="post_instagram"
            subject="Page à propos"
            contentData={{ type: "generated", text: `${data?.title || ""}\n\n${data?.story || ""}\n\n${data?.approach || ""}` }}
            sourceModule="site-a-propos"
            format="post"
          />

          <div ref={recapRef} className="bg-white rounded-2xl border border-[hsl(var(--border))] p-8 max-md:p-5">
            <SectionBlock label="🎯 Titre d'accroche" text={data.title || ""} field="title" editing={editingField} editValue={editValue} onEdit={startEdit} onSave={saveEdit} onEditChange={setEditValue} onCopy={copyText} />
            <SectionBlock label="👑 Mon histoire" text={data.story || ""} field="story" editing={editingField} editValue={editValue} onEdit={startEdit} onSave={saveEdit} onEditChange={setEditValue} onCopy={copyText} />

            {data.values_blocks && data.values_blocks.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B" }}>
                    ❤️ Mes valeurs
                  </p>
                  <button onClick={() => copyText(data.values_blocks!.map(v => `${v.title}\n${v.description}`).join("\n\n"))}
                    className="text-xs font-semibold hover:opacity-70" style={{ color: "#fb3d80" }}>
                    <Copy className="h-3 w-3 inline mr-1" />Copier
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.values_blocks.map((v, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#FFF4F8" }}>
                      <p style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e", marginBottom: 4 }}>{v.title}</p>
                      <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>{v.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <SectionBlock label="🛠️ Mon approche" text={data.approach || ""} field="approach" editing={editingField} editValue={editValue} onEdit={startEdit} onSave={saveEdit} onEditChange={setEditValue} onCopy={copyText} />
            <SectionBlock label="🎯 Pour qui" text={data.for_whom || ""} field="for_whom" editing={editingField} editValue={editValue} onEdit={startEdit} onSave={saveEdit} onEditChange={setEditValue} onCopy={copyText} />
            <SectionBlock label="🔘 CTA" text={data.cta || ""} field="cta" editing={editingField} editValue={editValue} onEdit={startEdit} onSave={saveEdit} onEditChange={setEditValue} onCopy={copyText} isLast />

            <p style={{ textAlign: "center", fontSize: 11, color: "#D1D5DB", marginTop: 32 }}>
              L'Assistant Com' × Nowadays Agency
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Fallback to entry
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <p className="text-muted-foreground">Chargement...</p>
      </main>
    </div>
  );
}

function SectionBlock({
  label, text, field, editing, editValue, onEdit, onSave, onEditChange, onCopy, isLast = false,
}: {
  label: string; text: string; field: string;
  editing: string | null; editValue: string;
  onEdit: (field: string, val: string) => void;
  onSave: (field: string) => void;
  onEditChange: (val: string) => void;
  onCopy: (text: string) => void;
  isLast?: boolean;
}) {
  const isEditing = editing === field;
  return (
    <div className={isLast ? "" : "mb-8"}>
      <div className="flex items-center justify-between mb-2">
        <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B" }}>
          {label}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => onCopy(text)} className="text-xs font-semibold hover:opacity-70" style={{ color: "#fb3d80" }}>
            <Copy className="h-3 w-3 inline mr-1" />Copier
          </button>
          {isEditing ? (
            <button onClick={() => onSave(field)} className="text-xs font-semibold hover:opacity-70 text-green-600">
              <Check className="h-3 w-3 inline mr-1" />OK
            </button>
          ) : (
            <button onClick={() => onEdit(field, text)} className="text-xs font-semibold hover:opacity-70 text-muted-foreground">
              <Pencil className="h-3 w-3 inline mr-1" />Modifier
            </button>
          )}
        </div>
      </div>
      {isEditing ? (
        <Textarea value={editValue} onChange={(e) => onEditChange(e.target.value)} className="min-h-[100px] text-sm" autoFocus />
      ) : (
        <p style={{ fontSize: 14, color: "#1a1a2e", lineHeight: 1.7, whiteSpace: "pre-line" }}>{text}</p>
      )}
    </div>
  );
}
