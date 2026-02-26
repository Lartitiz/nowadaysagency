import { useState, useEffect } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Copy, RefreshCw, Bookmark, PenLine, Lightbulb, CalendarDays, Instagram, Target, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useSearchParams } from "react-router-dom";
import { getInstagramFormatReco } from "@/lib/production-guides";
import type { UserProfile } from "@/pages/Dashboard";
import RedactionFlow from "@/components/RedactionFlow";

const OBJECTIVES = [
  { id: "visibilite", label: "🔍 Visibilité", desc: "Faire découvrir", color: "bg-violet-100 text-violet-700 border-violet-300" },
  { id: "confiance", label: "💛 Confiance", desc: "Créer du lien", color: "bg-yellow/30 text-accent-foreground border-yellow" },
  { id: "vente", label: "🛒 Vente", desc: "Convertir", color: "bg-secondary text-primary border-primary/30" },
  { id: "credibilite", label: "🎓 Crédibilité", desc: "Montrer l'expertise", color: "bg-muted text-foreground border-border" },
];

const OBJECTIVE_FORMAT_RECOS: Record<string, string[]> = {
  visibilite: ["Coup de gueule", "Mythe à déconstruire", "Conseil contre-intuitif", "Surf sur l'actu"],
  confiance: ["Storytelling", "Regard philosophique", "Build in public", "Identification / quotidien"],
  vente: ["Before / After", "Histoire cliente", "Test grandeur nature"],
  credibilite: ["Enquête / décryptage", "Analyse en profondeur", "Conseil contre-intuitif"],
};

const FORMATS = [
  "Storytelling", "Mythe à déconstruire", "Coup de gueule", "Enquête / décryptage",
  "Conseil contre-intuitif", "Test grandeur nature", "Before / After",
  "Histoire cliente", "Regard philosophique", "Surf sur l'actu",
  "Identification / quotidien", "Build in public", "Analyse en profondeur",
];

const CHANNELS = [
  { id: "instagram", label: "Instagram", icon: Instagram, enabled: true },
  { id: "linkedin", label: "LinkedIn", enabled: false },
  { id: "blog", label: "Blog", enabled: false },
  { id: "pinterest", label: "Pinterest", enabled: false },
];

interface Idea {
  titre: string;
  format: string;
  angle: string;
  accroches?: string[];
}

interface Props {
  profile: UserProfile;
  onIdeaGenerated: () => void;
}

export default function ContentWorkshop({ profile, onIdeaGenerated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [canal, setCanal] = useState("instagram");
  const [objectif, setObjectif] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [sujet, setSujet] = useState("");
  const [generating, setGenerating] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [redactionIdea, setRedactionIdea] = useState<Idea | null>(null);

  useEffect(() => {
    const urlCanal = searchParams.get("canal");
    if (urlCanal && CHANNELS.some((c) => c.id === urlCanal && c.enabled)) {
      setCanal(urlCanal);
    }
  }, [searchParams]);

  // Recommended formats based on objective
  const recommendedFormats = objectif ? OBJECTIVE_FORMAT_RECOS[objectif] || [] : [];
  const sortedFormats = objectif
    ? [...FORMATS].sort((a, b) => {
        const aRec = recommendedFormats.includes(a) ? 0 : 1;
        const bRec = recommendedFormats.includes(b) ? 0 : 1;
        return aRec - bRec;
      })
    : FORMATS;

  const fetchIdeas = async () => {
    if (!user) return;
    setGenerating(true);
    setIdeas([]);
    setCopiedIdx(null);
    setSavedIdx(new Set());

    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "ideas",
          format: format || "",
          sujet,
          canal,
          objectif: objectif || "",
          profile: {
            prenom: profile.prenom,
            activite: profile.activite,
            type_activite: profile.type_activite,
            cible: profile.cible,
            probleme_principal: profile.probleme_principal,
            piliers: profile.piliers,
            tons: profile.tons,
            mission: profile.mission || "",
            offre: profile.offre || "",
            croyances_limitantes: profile.croyances_limitantes || "",
            verbatims: profile.verbatims || "",
            expressions_cles: profile.expressions_cles || "",
            ce_quon_evite: profile.ce_quon_evite || "",
            style_communication: profile.style_communication || [],
          },
        },
      });

      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";

      let parsed: Idea[];
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }

      setIdeas(parsed.slice(0, 5));

      await supabase
        .from("generated_posts")
        .insert({ user_id: user.id, format: "ideas", sujet: sujet || "(idées variées)", contenu: content });
      onIdeaGenerated();
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleInspire = async () => {
    setLoadingSuggestions(true);
    setSuggestions([]);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "suggest",
          canal,
          objectif: objectif || "",
          profile: {
            activite: profile.activite,
            cible: profile.cible,
            piliers: profile.piliers,
          },
        },
      });
      if (res.error) throw new Error(res.error.message);
      const lines = (res.data?.content || "").split("\n").filter((l: string) => l.trim());
      setSuggestions(lines.slice(0, 5));
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleCopyIdea = async (idea: Idea, idx: number) => {
    let text = `${idea.titre}\n${idea.angle}`;
    if (idea.accroches?.length) text += `\n\nAccroches proposées :\n${idea.accroches.join("\n")}`;
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleSaveIdea = async (idea: Idea, idx: number) => {
    if (!user || savedIdx.has(idx)) return;
    const { error } = await supabase.from("saved_ideas").insert({
      user_id: user.id,
      titre: idea.titre,
      format: idea.format,
      angle: idea.angle,
      canal,
      objectif: objectif || null,
    } as any);
    if (error) {
      toast({ title: "Erreur", description: "Impossible d'enregistrer l'idée", variant: "destructive" });
      return;
    }
    setSavedIdx((prev) => new Set(prev).add(idx));
  };

  const formatReco = canal === "instagram" && format ? getInstagramFormatReco(format) : null;

  return (
    <div className="rounded-2xl bg-card border border-border p-6 max-sm:p-4 shadow-sm min-w-0">
      <div className="flex items-center gap-3 mb-5">
        <PenLine className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Mon atelier de contenu</h2>
        <span className="rounded-full bg-yellow text-accent-foreground px-3 py-0.5 text-xs font-bold">
          Méthode Nowadays
        </span>
      </div>

      {/* Canal selector */}
      <div className="mb-5">
        <p className="text-sm font-medium text-foreground mb-2">Pour quel canal ?</p>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => ch.enabled && setCanal(ch.id)}
              disabled={!ch.enabled}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium border transition-all shrink-0 ${
                canal === ch.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : ch.enabled
                    ? "bg-card text-foreground border-border hover:border-primary/40"
                    : "bg-muted text-muted-foreground border-border opacity-60 cursor-not-allowed"
              }`}
            >
              {ch.label}
              {!ch.enabled && <span className="ml-1 text-xs">(Bientôt)</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Objective selector - NEW */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Quel est ton objectif ?</p>
        </div>
        <p className="text-xs italic text-muted-foreground mb-3">L'objectif guide le choix du format et le style des accroches. Tu peux aussi ne rien choisir.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OBJECTIVES.map((obj) => (
            <button
              key={obj.id}
              onClick={() => setObjectif(objectif === obj.id ? null : obj.id)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                objectif === obj.id
                  ? "border-primary bg-secondary"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <span className="text-sm font-semibold block">{obj.label}</span>
              <span className="text-xs text-muted-foreground">{obj.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Angle selector */}
      <div className="mb-1">
        <p className="text-sm font-medium text-foreground mb-1">Quel angle pour ton post ?</p>
        <p className="text-xs italic text-muted-foreground mb-3">
          {objectif
            ? "Les angles recommandés pour ton objectif sont mis en avant."
            : "L'angle, c'est la manière dont tu vas aborder ton sujet."}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap max-sm:flex-nowrap max-sm:overflow-x-auto pb-2 mb-4 scrollbar-none">
        {sortedFormats.map((f) => {
          const isReco = recommendedFormats.includes(f);
          return (
            <button
              key={f}
              onClick={() => setFormat(format === f ? null : f)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium border transition-all shrink-0 ${
                format === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : isReco
                    ? "bg-secondary text-primary border-primary/40 ring-1 ring-primary/20"
                    : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              {isReco && "★ "}{f}
            </button>
          );
        })}
      </div>

      {/* Instagram format recommendation */}
      {formatReco && (
        <div className="mb-4 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 text-sm text-foreground animate-fade-in">
          📱 {formatReco}
        </div>
      )}

      {/* Input */}
      <div className="relative mb-2">
        <Input
          value={sujet}
          onChange={(e) => setSujet(e.target.value)}
          placeholder="De quoi tu veux parler ? Un thème, un mot-clé..."
          className="rounded-[10px] h-12 pr-40 w-full box-border"
          onKeyDown={(e) => e.key === "Enter" && fetchIdeas()}
        />
        <Button
          onClick={fetchIdeas}
          disabled={generating}
          className="absolute right-1 top-1 rounded-full bg-primary text-primary-foreground hover:bg-bordeaux h-10 px-5"
        >
          {generating ? "..." : "Trouver des idées"}
        </Button>
      </div>

      {/* Inspire me */}
      <button
        onClick={handleInspire}
        disabled={loadingSuggestions}
        className="text-sm text-primary font-medium hover:underline mb-4 block"
      >
        <span className="inline-flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5" />
          {loadingSuggestions ? "Je cherche des idées..." : "Inspire-moi, j'ai pas d'idée"}
        </span>
      </button>

      {suggestions.length > 0 && (
        <div className="mb-4 space-y-2 animate-fade-in">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setSujet(s); setSuggestions([]); }}
              className="block w-full text-left rounded-lg border border-border p-3 text-sm hover:bg-secondary transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Loading state */}
      {generating && (
        <div className="flex items-center gap-3 py-12 justify-center animate-fade-in">
          <div className="flex gap-1">
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" />
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
          </div>
          <span className="text-sm italic text-muted-foreground">Je réfléchis à des idées pour toi...</span>
        </div>
      )}

      {/* Ideas cards */}
      {ideas.length > 0 && !generating && (
        <div className="space-y-3 mt-4 animate-fade-in">
          {ideas.map((idea, i) => (
            <div key={i} className="rounded-xl bg-rose-pale border border-border p-4">
              <div className="flex items-start gap-2 mb-2">
                <span className="rounded-full bg-primary text-primary-foreground px-3 py-0.5 text-xs font-bold uppercase tracking-wider shrink-0">
                  {idea.format}
                </span>
              </div>
              <p className="font-bold text-foreground text-sm mb-1">{idea.titre}</p>
              <p className="text-sm italic text-muted-foreground leading-relaxed mb-2">{idea.angle}</p>

              {/* Accroches */}
              {idea.accroches && idea.accroches.length > 0 && (
                <div className="mt-2 mb-3 space-y-1.5">
                  <p className="text-xs font-mono-ui font-semibold text-muted-foreground uppercase tracking-wider">Accroches suggérées</p>
                  {idea.accroches.map((accroche, j) => (
                    <div key={j} className="rounded-lg bg-card border border-border px-3 py-2 text-sm text-foreground">
                      {accroche}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyIdea(idea, i)}
                  className="rounded-full gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedIdx === i ? "Copié !" : "Copier"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveIdea(idea, i)}
                  disabled={savedIdx.has(i)}
                  className="rounded-full gap-1.5"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {savedIdx.has(i) ? "Enregistré !" : "Enregistrer"}
                </Button>
                <PlanifierButton idea={idea} userId={user?.id} toast={toast} />
                <Button
                  size="sm"
                  onClick={() => setRedactionIdea(idea)}
                  className="rounded-full gap-1.5 bg-primary text-primary-foreground hover:bg-bordeaux"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Rédiger ce contenu
                </Button>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={fetchIdeas}
            disabled={generating}
            className="w-full rounded-full gap-2 mt-2"
          >
            <RefreshCw className="h-4 w-4" />
            Encore 5 idées
          </Button>
        </div>
      )}

      {/* Empty state */}
      {ideas.length === 0 && !generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Lightbulb className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">Tes prochaines idées de contenu t'attendent ici</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Choisis un objectif, un angle, ou donne un thème pour commencer</p>
        </div>
      )}

      {/* Redaction Flow */}
      {redactionIdea && (
        <RedactionFlow
          idea={redactionIdea}
          profile={profile}
          canal={canal}
          objectif={objectif || ""}
          onClose={() => setRedactionIdea(null)}
        />
      )}
    </div>
  );
}

function PlanifierButton({ idea, userId, toast }: { idea: Idea; userId?: string; toast: any }) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const handleSelect = async (d: Date | undefined) => {
    if (!d || !userId) return;
    setDate(d);
    const dateStr = toLocalDateStr(d);
    const { error } = await supabase.from("calendar_posts").insert({
      user_id: userId,
      date: dateStr,
      theme: idea.titre,
      angle: idea.format,
      status: "idea",
      content_draft: idea.accroches?.join("\n\n") || null,
    });
    setOpen(false);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de planifier", variant: "destructive" });
    } else {
      toast({ title: "Ajouté au calendrier !" });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          Planifier
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
