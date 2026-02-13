import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw, CalendarPlus, PenLine } from "lucide-react";
import type { UserProfile } from "@/pages/Dashboard";

const FORMATS = [
  "Storytelling", "Mythe à déconstruire", "Coup de gueule", "Enquête / décryptage",
  "Conseil contre-intuitif", "Test grandeur nature", "Before / After",
  "Histoire cliente", "Regard philosophique", "Surf sur l'actu",
];

interface Props {
  profile: UserProfile;
  onPostCreated: () => void;
}

export default function ContentWorkshop({ profile, onPostCreated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [format, setFormat] = useState(FORMATS[0]);
  const [sujet, setSujet] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addedToPlan, setAddedToPlan] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const handleGenerate = async () => {
    if (!sujet.trim() || !user) return;
    setGenerating(true);
    setGeneratedPost("");
    setPostId(null);
    setCopied(false);
    setAddedToPlan(false);

    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "generate",
          format,
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
      setGeneratedPost(content);

      // Save to DB
      const { data: post, error } = await supabase
        .from("generated_posts")
        .insert({ user_id: user.id, format, sujet, contenu: content })
        .select("id")
        .single();
      if (post) setPostId(post.id);
      if (error) console.error(error);
      onPostCreated();
    } catch (e: any) {
      toast({ title: "Erreur de génération", description: e.message, variant: "destructive" });
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAddToPlan = async () => {
    if (!postId) return;
    await supabase.from("generated_posts").update({ added_to_plan: true }).eq("id", postId);
    setAddedToPlan(true);
  };

  const charCount = generatedPost.length;

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <PenLine className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Mon atelier de contenu</h2>
        <span className="rounded-pill bg-yellow text-accent-foreground px-3 py-0.5 text-xs font-bold">
          Méthode Nowadays
        </span>
      </div>

      {/* Format selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {FORMATS.map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
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
          placeholder="De quoi tu veux parler ? Ex : le syndrome de l'impostrice quand on vend..."
          className="rounded-[10px] h-12 pr-28"
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <Button
          onClick={handleGenerate}
          disabled={generating || !sujet.trim()}
          className="absolute right-1 top-1 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux h-10 px-5"
        >
          {generating ? "..." : "Générer"}
        </Button>
      </div>

      {/* Inspire me */}
      <button
        onClick={handleInspire}
        disabled={loadingSuggestions}
        className="text-sm text-primary font-medium hover:underline mb-4 block"
      >
        {loadingSuggestions ? "Je cherche des idées..." : "Inspire-moi"}
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
          <span className="text-sm italic text-muted-foreground">Je rédige avec ta méthodo...</span>
        </div>
      )}

      {/* Generated post */}
      {generatedPost && !generating && (
        <div className="animate-fade-in rounded-xl bg-rose-pale border-l-4 border-primary p-5 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-pill bg-primary text-primary-foreground px-3 py-0.5 text-xs font-bold uppercase tracking-wider">
              {format}
            </span>
            <span className="text-xs text-muted-foreground">~{charCount} caractères</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{generatedPost}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="rounded-pill gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copié !" : "Copier"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              className="rounded-pill gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Autre version
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddToPlan}
              disabled={addedToPlan}
              className="rounded-pill gap-1.5"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              {addedToPlan ? "Ajouté !" : "Ajouter au plan"}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!generatedPost && !generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <PenLine className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">Ton prochain post t'attend ici</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Choisis un format et donne un sujet pour commencer</p>
        </div>
      )}
    </div>
  );
}
