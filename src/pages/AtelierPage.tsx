import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Save, PenLine, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import CreativeFlow from "@/components/CreativeFlow";
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
  // Track which accroche view mode per idea: "short" or "long"
  const [accrocheMode, setAccrocheMode] = useState<Record<string, "short" | "long">>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCanal = searchParams.get("canal");

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

  // Load profile + brand_profile
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([profRes, bpRes]) => {
      if (profRes.data) setProfile(profRes.data);
      if (bpRes.data) setBrandProfile(bpRes.data);
    });
  }, [user]);

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        {isInstagramContext && (
          <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="Trouver des idées" />
        )}
        {!isInstagramContext && (
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
            <ArrowLeft className="h-4 w-4" />
            Retour au hub
          </Link>
        )}

        <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground mb-1">
          💡 Atelier d'idées
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Trouve des idées de contenu adaptées à ton activité et ta cible.
        </p>

        <BrandingPrompt section="global" />

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
            {/* Recommended first */}
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
          {/* Format technique reco */}
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

        {/* ── Creative Flow ── */}
        <CreativeFlow
          contentType={`post_${canal}`}
          context={[
            selectedFormatLabel && `Format : ${selectedFormatLabel}`,
            objectif && `Objectif : ${objectif}`,
            sujetLibre && `Sujet : ${sujetLibre}`,
          ].filter(Boolean).join(". ") || `Idées de contenu ${canal}`}
          profile={mergedProfile || undefined}
          showQuickMode={true}
          quickModeLabel="Générer 5 idées"
          quickModeAction={handleGenerate}
          quickModeLoading={generating}
          onSaveToIdeas={(content, meta) => {
            if (!user) return;
            supabase.from("saved_ideas").insert({
              user_id: user.id,
              titre: meta.accroche || content.slice(0, 60),
              format: meta.format || selectedFormatLabel || "post",
              angle: content.slice(0, 120),
              canal,
              objectif: meta.objectif || objectif || null,
            }).then(() => toast({ title: "Idée enregistrée !" }));
          }}
          onAddToCalendar={(content, meta) => {
            const params = new URLSearchParams({
              canal,
              format: meta.format || selectedFormatLabel || "",
              theme: meta.accroche || content.slice(0, 60),
              angle: content.slice(0, 120),
              ...(objectif ? { objectif } : {}),
            });
            navigate(`/calendrier?${params.toString()}`);
          }}
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
