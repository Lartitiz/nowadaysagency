import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw, Bookmark, PenLine, Lightbulb, CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { UserProfile } from "@/pages/Dashboard";

const FORMATS = [
  "Storytelling", "Mythe à déconstruire", "Coup de gueule", "Enquête / décryptage",
  "Conseil contre-intuitif", "Test grandeur nature", "Before / After",
  "Histoire cliente", "Regard philosophique", "Surf sur l'actu",
];

interface Idea {
  titre: string;
  format: string;
  angle: string;
}

interface Props {
  profile: UserProfile;
  onIdeaGenerated: () => void;
}

export default function ContentWorkshop({ profile, onIdeaGenerated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [format, setFormat] = useState<string | null>(null);
  const [sujet, setSujet] = useState("");
  const [generating, setGenerating] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

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
          profile: {
            prenom: profile.prenom,
            activite: profile.activite,
            type_activite: profile.type_activite,
            cible: profile.cible,
            probleme_principal: profile.probleme_principal,
            piliers: profile.piliers,
            tons: profile.tons,
          },
        },
      });

      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";

      let parsed: Idea[];
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try extracting JSON from response
        const match = content.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }

      setIdeas(parsed.slice(0, 5));

      // Track as generated post for counting
      await supabase
        .from("generated_posts")
        .insert({ user_id: user.id, format: "ideas", sujet: sujet || "(idées variées)", contenu: content });
      onIdeaGenerated();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
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
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleCopyIdea = async (idea: Idea, idx: number) => {
    await navigator.clipboard.writeText(`${idea.titre}\n${idea.angle}`);
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
    });
    if (error) {
      toast({ title: "Erreur", description: "Impossible d'enregistrer l'idée", variant: "destructive" });
      return;
    }
    setSavedIdx((prev) => new Set(prev).add(idx));
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-6 max-sm:p-4 shadow-sm min-w-0">
      <div className="flex items-center gap-3 mb-5">
        <PenLine className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Mon atelier de contenu</h2>
        <span className="rounded-pill bg-yellow text-accent-foreground px-3 py-0.5 text-xs font-bold">
          Méthode Nowadays
        </span>
      </div>

      {/* Angle selector */}
      <div className="mb-1">
        <p className="text-sm font-medium text-foreground mb-1">Quel angle pour ton post ?</p>
        <p className="text-xs italic text-muted-foreground mb-3">L'angle, c'est la manière dont tu vas aborder ton sujet. Un même thème peut être raconté en storytelling, en coup de gueule, en conseil...</p>
      </div>
      <div className="flex gap-2 flex-wrap max-sm:flex-nowrap max-sm:overflow-x-auto pb-2 mb-4 scrollbar-none">
        {FORMATS.map((f) => (
          <button
            key={f}
            onClick={() => setFormat(format === f ? null : f)}
            className={`whitespace-nowrap rounded-pill px-4 py-2 text-sm font-medium border transition-all shrink-0 ${
              format === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/40"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="relative mb-2">
        <Input
          value={sujet}
          onChange={(e) => setSujet(e.target.value)}
          placeholder="Dis-moi un thème, un mot-clé, ou laisse-moi te proposer des idées..."
          className="rounded-[10px] h-12 pr-40 w-full box-border"
          onKeyDown={(e) => e.key === "Enter" && fetchIdeas()}
        />
        <Button
          onClick={fetchIdeas}
          disabled={generating}
          className="absolute right-1 top-1 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux h-10 px-5"
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
                <span className="rounded-pill bg-primary text-primary-foreground px-3 py-0.5 text-xs font-bold uppercase tracking-wider shrink-0">
                  {idea.format}
                </span>
              </div>
              <p className="font-bold text-foreground text-sm mb-1">{idea.titre}</p>
              <p className="text-sm italic text-muted-foreground leading-relaxed">{idea.angle}</p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyIdea(idea, i)}
                  className="rounded-pill gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedIdx === i ? "Copié !" : "Copier l'idée"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveIdea(idea, i)}
                  disabled={savedIdx.has(i)}
                  className="rounded-pill gap-1.5"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {savedIdx.has(i) ? "Enregistré !" : "Enregistrer"}
                </Button>
                <PlanifierButton idea={idea} userId={user?.id} toast={toast} />
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={fetchIdeas}
            disabled={generating}
            className="w-full rounded-pill gap-2 mt-2"
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
          <p className="text-sm text-muted-foreground/60 mt-1">Choisis un angle ou donne un thème pour commencer</p>
        </div>
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
    const dateStr = d.toISOString().split("T")[0];
    const { error } = await supabase.from("calendar_posts").insert({
      user_id: userId,
      date: dateStr,
      theme: idea.titre,
      angle: idea.format,
      status: "idea",
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
        <Button variant="outline" size="sm" className="rounded-pill gap-1.5">
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
