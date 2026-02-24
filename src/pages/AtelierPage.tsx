import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Save, PenLine, ArrowLeft, CalendarDays, RefreshCw, Mic } from "lucide-react";
import { Link } from "react-router-dom";
import CreativeFlow from "@/components/CreativeFlow";
import ContentRecycling from "@/components/ContentRecycling";
import ContentWorkshop from "@/components/ContentWorkshop";
import {
  OBJECTIFS, FORMATS, CANAUX,
  getRecommendedFormats, formatIdToGuideKey,
  RECO_EXPLAIN,
} from "@/lib/atelier-data";
import { getInstagramFormatReco } from "@/lib/production-guides";
import BrandingPrompt from "@/components/BrandingPrompt";

interface AccrocheItem {
  short: string;
  long: string;
}

interface IdeaResult {
  titre: string;
  format: string;
  angle: string;
  accroches?: (string | AccrocheItem)[];
}

export default function AtelierPage() {
  const [accrocheMode, setAccrocheMode] = useState<Record<string, "short" | "long">>({});
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlCanal = searchParams.get("canal");

  // Calendar context
  const calendarData = location.state as any;
  const fromCalendar = calendarData?.fromCalendar === true;

  // State
  const [canal, setCanal] = useState(urlCanal || "instagram");
  const [objectif, setObjectif] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [sujetLibre, setSujetLibre] = useState("");
  const [generating, setGenerating] = useState(false);
  const [ideas, setIdeas] = useState<IdeaResult[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [brandProfile, setBrandProfile] = useState<any>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [showRecapEdit, setShowRecapEdit] = useState(false);
  const [atelierMode, setAtelierMode] = useState<"create" | "recycle" | "dictate">("create");

  // Pre-fill from calendar data
  useEffect(() => {
    if (fromCalendar && calendarData) {
      if (calendarData.objectif) setObjectif(calendarData.objectif);
      if (calendarData.theme) setSujetLibre(calendarData.theme);
      // Map calendar angle (free text) to atelier format id
      if (calendarData.angle) {
        const matchedFormat = FORMATS.find(
          (f) => f.label.toLowerCase() === calendarData.angle?.toLowerCase()
        );
        if (matchedFormat) setSelectedFormat(matchedFormat.id);
      }
    }
  }, []);

  // Load profile + brand_profile
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      (supabase.from("brand_profile") as any).select("*").eq(column, value).maybeSingle(),
    ]).then(([profRes, bpRes]) => {
      if (profRes.data) setProfile(profRes.data);
      if (bpRes.data) setBrandProfile(bpRes.data);
    });
  }, [user?.id]);

  const mergedProfile = profile
    ? {
        ...profile,
        mission: brandProfile?.mission || profile.mission,
        offre: brandProfile?.offer || profile.offre,
        cible: brandProfile?.target_description || profile.cible,
        probleme_principal: brandProfile?.target_problem || profile.probleme_principal,
        croyances_limitantes: brandProfile?.target_beliefs || profile.croyances_limitantes,
        verbatims: brandProfile?.target_verbatims || profile.verbatims,
        expressions_cles: brandProfile?.key_expressions || profile.expressions_cles,
        ce_quon_evite: brandProfile?.things_to_avoid || profile.ce_quon_evite,
      }
    : null;

  const { recommended, others } = getRecommendedFormats(objectif);
  const selectedFormatLabel = FORMATS.find((f) => f.id === selectedFormat)?.label || "";
  const formatReco = selectedFormat ? getInstagramFormatReco(formatIdToGuideKey(selectedFormat)) : null;

  // Build calendar context for CreativeFlow
  const calendarContext = fromCalendar
    ? {
        calendarPostId: calendarData.calendarPostId,
        theme: calendarData.theme,
        objectif: calendarData.objectif,
        angle: calendarData.angle,
        format: calendarData.format,
        notes: calendarData.notes,
        postDate: calendarData.postDate,
        existingContent: calendarData.existingContent,
        // Launch
        launchId: calendarData.launchId,
        contentType: calendarData.contentType,
        contentTypeEmoji: calendarData.contentTypeEmoji,
        category: calendarData.category,
        objective: calendarData.objective,
        angleSuggestion: calendarData.angleSuggestion,
        chapter: calendarData.chapter,
        chapterLabel: calendarData.chapterLabel,
        audiencePhase: calendarData.audiencePhase,
      }
    : undefined;

  // Save generated content back to calendar
  const handleSaveToCalendar = async (content: string, meta: any) => {
    if (!calendarData?.calendarPostId) return;
    const accroche = content.split("\n")[0]
      ?.replace(/^(Slide 1\s*:|Hook\s*:|Accroche\s*:)/i, "")
      .trim();

    const { error } = await supabase
      .from("calendar_posts")
      .update({
        content_draft: content,
        accroche: accroche || null,
        status: "drafting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", calendarData.calendarPostId);

    if (error) {
      toast({ title: "Erreur de sauvegarde", variant: "destructive" });
    } else {
      toast({ title: "Contenu sauvegardé dans ton calendrier !" });
      navigate("/calendrier?canal=" + canal);
    }
  };

  const handleGenerate = async () => {
    if (!mergedProfile) return;
    setGenerating(true);
    setIdeas([]);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "ideas",
          profile: mergedProfile,
          canal,
          objectif,
          format: selectedFormatLabel || undefined,
          sujet: sujetLibre || undefined,
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: IdeaResult[];
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }
      setIdeas(parsed);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const saveIdea = async (idea: IdeaResult, idx: number) => {
    if (!user) return;
    setSavingIdx(idx);
    try {
      await supabase.from("saved_ideas").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        titre: idea.titre,
        format: idea.format,
        angle: idea.angle,
        canal,
        objectif: objectif || null,
      });
      toast({ title: "Idée enregistrée !" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setSavingIdx(null);
    }
  };

  const goToRedaction = (idea: IdeaResult) => {
    const params = new URLSearchParams({
      canal,
      format: idea.format,
      theme: idea.titre,
      angle: idea.angle,
      ...(objectif ? { objectif } : {}),
    });
    navigate(`/atelier/rediger?${params.toString()}`);
  };

  const isInstagramContext = urlCanal === "instagram";

  // Format date for recap banner
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return dateStr;
    }
  };

  const objLabel = calendarData?.objectif
    ? OBJECTIFS.find((o) => o.id === calendarData.objectif)?.label
    : null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        {/* Calendar recap banner */}
        {fromCalendar && (
          <div className="rounded-2xl border border-primary/20 bg-rose-pale p-4 mb-6 animate-fade-in">
            <button
              onClick={() => navigate("/calendrier?canal=" + canal)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au calendrier
            </button>
            <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              {calendarData.postDate && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  {formatDate(calendarData.postDate)}
                </span>
              )}
              {objLabel && <span>· {calendarData.objectif === "visibilite" ? "👀" : calendarData.objectif === "confiance" ? "🤝" : calendarData.objectif === "vente" ? "💰" : "🏆"} {objLabel}</span>}
              {calendarData.angle && <span>· 📖 {calendarData.angle}</span>}
              {calendarData.format && <span>· 📑 {calendarData.format}</span>}
            </div>
            {calendarData.notes && (
              <p className="text-xs text-muted-foreground italic mt-1.5 truncate">📝 {calendarData.notes}</p>
            )}
            {calendarData.angleSuggestion && (
              <p className="text-xs text-muted-foreground italic mt-1">💡 {calendarData.angleSuggestion}</p>
            )}
            {!showRecapEdit && (
              <button
                onClick={() => setShowRecapEdit(true)}
                className="text-xs text-primary hover:underline mt-2"
              >
                ✏️ Modifier ces infos
              </button>
            )}
          </div>
        )}

        {/* Standard nav for non-calendar */}
        {!fromCalendar && (
          <SubPageHeader
            breadcrumbs={[
              { label: "Dashboard", to: "/dashboard" },
              { label: "Créer", to: "/instagram/creer" },
            ]}
            currentLabel="Atelier d'idées"
            useFromParam
          />
        )}

        <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground mb-1">
          {fromCalendar ? "✨ Rédiger un contenu" : "💡 Atelier d'idées"}
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {fromCalendar
            ? "Crée ton contenu avec l'aide de l'IA, en mode co-création."
            : "Trouve des idées de contenu adaptées à ton activité et ta cible."}
        </p>

        <BrandingPrompt section="global" />

        {/* Mode switcher (only when not from calendar) */}
        {!fromCalendar && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setAtelierMode("create")}
              className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                atelierMode === "create" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              ✨ Créer un contenu
            </button>
            <button
              onClick={() => setAtelierMode("recycle")}
              className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                atelierMode === "recycle" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              🔄 Recycler un contenu
            </button>
            <button
              onClick={() => setAtelierMode("dictate")}
              className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                atelierMode === "dictate" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              🎤 Dicter mon contenu
            </button>
          </div>
        )}

        {/* Recycle mode */}
        {!fromCalendar && atelierMode === "recycle" && (
          <ContentRecycling />
        )}

        {/* Dictate mode */}
        {!fromCalendar && atelierMode === "dictate" && profile && (
          <ContentWorkshop profile={profile} onIdeaGenerated={() => {}} />
        )}

        {/* Hide selectors when coming from calendar (unless user wants to edit) */}
        {(fromCalendar || atelierMode === "create") && (!fromCalendar || showRecapEdit) && (
          <>
            {/* ── Canal selector ── */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Canal</label>
              <div className="flex flex-wrap gap-2">
                {CANAUX.map((c) => (
                  <button
                    key={c.id}
                    disabled={!c.enabled}
                    onClick={() => c.enabled && setCanal(c.id)}
                    className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                      canal === c.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : c.enabled
                          ? "bg-card text-foreground border-border hover:border-primary/40"
                          : "bg-muted text-muted-foreground border-border opacity-50 cursor-not-allowed"
                    }`}
                  >
                    {c.label}
                    {!c.enabled && <span className="ml-1 text-[10px]">(Bientôt)</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Objectif selector ── */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Tu veux quoi avec ce contenu ?
              </label>
              <div className="flex flex-wrap gap-2">
                {OBJECTIFS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setObjectif(objectif === o.id ? null : o.id)}
                    className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                      objectif === o.id
                        ? o.color + " border-current"
                        : "bg-card text-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {o.emoji} {o.label}
                    <span className="ml-1 text-[10px] text-muted-foreground hidden sm:inline">({o.desc})</span>
                  </button>
                ))}
              </div>
              {objectif && RECO_EXPLAIN[objectif] && (
                <p className="mt-2 text-xs text-muted-foreground italic animate-fade-in">
                  💡 {RECO_EXPLAIN[objectif]}
                </p>
              )}
            </div>

            {/* ── Format selector ── */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Format / angle
              </label>
              <div className="flex flex-wrap gap-2">
                {recommended.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFormat(selectedFormat === f.id ? null : f.id)}
                    className={`rounded-pill px-3 py-1.5 text-sm font-medium border transition-all ${
                      selectedFormat === f.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {f.label}
                    <span className="ml-1.5 text-[9px] font-bold bg-accent text-accent-foreground px-1.5 py-0.5 rounded-md">
                      Recommandé
                    </span>
                  </button>
                ))}
                {others.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFormat(selectedFormat === f.id ? null : f.id)}
                    className={`rounded-pill px-3 py-1.5 text-sm font-medium border transition-all ${
                      selectedFormat === f.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {formatReco && canal === "instagram" && (
                <p className="mt-2 text-xs text-muted-foreground animate-fade-in">
                  📐 {formatReco}
                </p>
              )}
            </div>

            {/* ── Sujet libre ── */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Sujet libre (optionnel)
              </label>
              <Input
                value={sujetLibre}
                onChange={(e) => setSujetLibre(e.target.value)}
                placeholder="Un mot-clé, un thème, une question..."
              />
            </div>
          </>
        )}

        {/* ── Creative Flow ── */}
        <CreativeFlow
          contentType={`post_${canal}`}
          context={[
            selectedFormatLabel && `Format : ${selectedFormatLabel}`,
            objectif && `Objectif : ${objectif}`,
            sujetLibre && `Sujet : ${sujetLibre}`,
          ].filter(Boolean).join(". ") || `Idées de contenu ${canal}`}
          profile={mergedProfile || undefined}
          calendarContext={calendarContext}
          skipToQuestions={fromCalendar && !!calendarData?.objectif && !!calendarData?.angle}
          showQuickMode={!fromCalendar}
          quickModeLabel="Générer 5 idées"
          quickModeAction={handleGenerate}
          quickModeLoading={generating}
          onSaveToIdeas={(content, meta) => {
            if (!user) return;
            supabase.from("saved_ideas").insert({
              user_id: user.id,
              workspace_id: workspaceId !== user.id ? workspaceId : undefined,
              titre: meta.accroche || content.slice(0, 60),
              format: meta.format || selectedFormatLabel || "post",
              angle: content.slice(0, 120),
              canal,
              objectif: meta.objectif || objectif || null,
            }).then(() => toast({ title: "Idée enregistrée !" }));
          }}
          onSaveToCalendar={fromCalendar ? handleSaveToCalendar : undefined}
          onAddToCalendar={!fromCalendar ? (content, meta) => {
            const params = new URLSearchParams({
              canal,
              format: meta.format || selectedFormatLabel || "",
              theme: meta.accroche || content.slice(0, 60),
              angle: content.slice(0, 120),
              ...(objectif ? { objectif } : {}),
            });
            navigate(`/calendrier?${params.toString()}`);
          } : undefined}
        />

        {/* ── Quick mode results (existing ideas flow) ── */}
        {generating && (
          <div className="flex items-center gap-3 py-8 justify-center animate-fade-in">
            <div className="flex gap-1">
              <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" />
              <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
              <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
            </div>
            <span className="text-sm italic text-muted-foreground">L'IA cherche des idées...</span>
          </div>
        )}

        {ideas.length > 0 && !generating && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-display text-xl font-bold">Tes idées</h2>
            {ideas.map((idea, idx) => (
              <div key={idx} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base font-bold text-foreground">{idea.titre}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{idea.angle}</p>
                  </div>
                  <span className="shrink-0 font-mono-ui text-[10px] font-semibold bg-rose-pale text-primary px-2 py-0.5 rounded-md">
                    {idea.format}
                  </span>
                </div>

                {idea.accroches && idea.accroches.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Accroches</p>
                      {typeof idea.accroches[0] === "object" && (
                        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                          <button
                            onClick={() => setAccrocheMode(prev => ({ ...prev, [idx]: "short" }))}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                              (accrocheMode[idx] || "short") === "short" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                            }`}
                          >Courte</button>
                          <button
                            onClick={() => setAccrocheMode(prev => ({ ...prev, [idx]: "long" }))}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                              accrocheMode[idx] === "long" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                            }`}
                          >Longue</button>
                        </div>
                      )}
                    </div>
                    {idea.accroches.map((a, i) => {
                      const isObject = typeof a === "object" && a !== null;
                      const mode = accrocheMode[idx] || "short";
                      const text = isObject ? (mode === "long" ? (a as AccrocheItem).long : (a as AccrocheItem).short) : (a as string);
                      return (
                        <p key={i} className="text-sm text-foreground bg-muted/50 rounded-lg px-3 py-2 italic">
                          "{text}"
                        </p>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => saveIdea(idea, idx)} disabled={savingIdx === idx} className="rounded-pill gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {savingIdx === idx ? "Enregistré !" : "Enregistrer"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => goToRedaction(idea)} className="rounded-pill gap-1.5">
                    <PenLine className="h-3.5 w-3.5" />
                    Rédiger ce contenu
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}