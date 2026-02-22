import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ContentRecycling from "@/components/ContentRecycling";
import ContentWorkshop from "@/components/ContentWorkshop";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useActiveChannels } from "@/hooks/use-active-channels";

interface FormatOption {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  route: string;
  comingSoon?: boolean;
  channel: string; // which channel this format belongs to
}

const ALL_FORMAT_OPTIONS: FormatOption[] = [
  { id: "post", emoji: "📝", label: "Post", desc: "Carrousel, image ou texte", route: "/atelier?canal=instagram&from=/instagram/creer", channel: "instagram" },
  { id: "carousel", emoji: "🎠", label: "Carrousel", desc: "Slides visuelles", route: "", comingSoon: true, channel: "instagram" },
  { id: "reel", emoji: "🎬", label: "Reel", desc: "Script complet avec hook", route: "/instagram/reels?from=/instagram/creer", channel: "instagram" },
  { id: "story", emoji: "📱", label: "Story", desc: "Séquence avec stickers", route: "/instagram/stories?from=/instagram/creer", channel: "instagram" },
  { id: "linkedin", emoji: "💼", label: "LinkedIn", desc: "Post LinkedIn", route: "/linkedin/post?from=/instagram/creer", channel: "linkedin" },
  { id: "pinterest", emoji: "📌", label: "Pinterest", desc: "Épingle optimisée", route: "", comingSoon: true, channel: "pinterest" },
  { id: "newsletter", emoji: "📧", label: "Newsletter", desc: "Email engageant", route: "", comingSoon: true, channel: "newsletter" },
];

interface FormatSuggestion {
  format: string;
  format_label: string;
  suggested_angle: string;
  objective: string;
  objective_label: string;
  reason: string;
}

export default function InstagramCreer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { channels: activeChannels } = useActiveChannels();
  const FORMAT_OPTIONS = ALL_FORMAT_OPTIONS.filter(f => activeChannels.includes(f.channel as any));
  const [ideaText, setIdeaText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<FormatSuggestion | null>(null);
  const [secondaryMode, setSecondaryMode] = useState<"none" | "recycle" | "dictate">("none");
  const [profile, setProfile] = useState<any>(null);

  // Load profile for dictate mode
  const loadProfile = async () => {
    if (!user || profile) return;
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
    if (data) setProfile(data);
  };

  const handleFormatClick = (format: FormatOption) => {
    if (format.comingSoon) return;
    navigate(format.route);
  };

  const handleSuggestFormat = async () => {
    if (!ideaText.trim() || suggesting) return;
    setSuggesting(true);
    setSuggestion(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await supabase.functions.invoke("suggest-format", {
        body: { idea: ideaText },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.error) throw new Error(res.error.message);
      setSuggestion(res.data);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  const handleGoToSuggested = () => {
    if (!suggestion) return;
    const fmt = FORMAT_OPTIONS.find(f => f.id === suggestion.format);
    if (fmt && !fmt.comingSoon) {
      // For post, pass pre-filled data
      if (suggestion.format === "post") {
        navigate(`/atelier?canal=instagram&objectif=${suggestion.objective}&sujet=${encodeURIComponent(ideaText)}`);
      } else {
        navigate(fmt.route);
      }
    }
  };

  const OBJ_EMOJI: Record<string, string> = {
    visibilite: "👀",
    confiance: "🤝",
    vente: "💰",
    credibilite: "🏆",
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 animate-fade-in">
        <SubPageHeader parentLabel="Dashboard" parentTo="/dashboard" currentLabel="Créer un contenu" />

        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">✨ Créer un contenu</h1>
          <p className="mt-2 text-sm text-muted-foreground">Chaque format a son propre générateur optimisé.</p>
        </div>

        {/* ─── Format grid ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f.id}
              onClick={() => handleFormatClick(f)}
              disabled={f.comingSoon}
              className={`relative rounded-2xl border-2 p-4 text-center transition-all ${
                f.comingSoon
                  ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                  : "border-border bg-card hover:border-primary hover:shadow-md group"
              }`}
            >
              {f.comingSoon && (
                <span className="absolute top-2 right-2 text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  🔜
                </span>
              )}
              <span className="text-2xl block mb-2">{f.emoji}</span>
              <p className="font-display font-bold text-sm text-foreground group-hover:text-primary transition-colors">{f.label}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{f.desc}</p>
            </button>
          ))}
        </div>

        {/* ─── "J'ai une idée" block ─── */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          <h3 className="font-display font-bold text-sm text-foreground mb-1">
            💡 Tu as une idée mais tu sais pas quel format choisir ?
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Décris ton idée, l'IA te recommande le meilleur format.
          </p>
          <TextareaWithVoice
            value={ideaText}
            onChange={(e) => {
              setIdeaText(e.target.value);
              setSuggestion(null);
            }}
            placeholder="Ex : ma pire erreur de communication en 2025..."
            rows={2}
            className="mb-3"
          />
          <Button
            onClick={handleSuggestFormat}
            disabled={!ideaText.trim() || suggesting}
            className="rounded-full gap-1.5"
            size="sm"
          >
            {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Trouve-moi le bon format
          </Button>

          {/* Suggestion result */}
          {suggestion && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 animate-fade-in">
              <p className="text-xs text-muted-foreground mb-1">
                💡 Pour ton idée "{ideaText.slice(0, 50)}{ideaText.length > 50 ? "…" : ""}"
              </p>
              <p className="text-sm font-bold text-foreground mb-1">
                Je te recommande : {FORMAT_OPTIONS.find(f => f.id === suggestion.format)?.emoji} {suggestion.format_label}
              </p>
              <p className="text-xs text-muted-foreground mb-1">
                Format : {suggestion.suggested_angle}
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                Objectif : {OBJ_EMOJI[suggestion.objective] || "🎯"} {suggestion.objective_label}
              </p>
              <p className="text-xs text-muted-foreground italic mb-3">
                {suggestion.reason}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleGoToSuggested}
                  size="sm"
                  className="rounded-full gap-1.5"
                >
                  {FORMAT_OPTIONS.find(f => f.id === suggestion.format)?.emoji} Créer ce contenu →
                </Button>
                <Button
                  onClick={() => {
                    setSuggestion(null);
                    handleSuggestFormat();
                  }}
                  size="sm"
                  variant="outline"
                  className="rounded-full gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" /> Autre suggestion
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Secondary options ─── */}
        <div className="rounded-2xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Autres options</p>
          <div className="flex gap-2">
            <Button
              variant={secondaryMode === "recycle" ? "default" : "outline"}
              size="sm"
              onClick={() => setSecondaryMode(secondaryMode === "recycle" ? "none" : "recycle")}
              className="rounded-full gap-1.5 text-xs"
            >
              ♻️ Recycler un contenu
            </Button>
            <Button
              variant={secondaryMode === "dictate" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSecondaryMode(secondaryMode === "dictate" ? "none" : "dictate");
                loadProfile();
              }}
              className="rounded-full gap-1.5 text-xs"
            >
              🎤 Dicter mon contenu
            </Button>
          </div>

          {secondaryMode === "recycle" && (
            <div className="mt-4 animate-fade-in">
              <ContentRecycling />
            </div>
          )}
          {secondaryMode === "dictate" && profile && (
            <div className="mt-4 animate-fade-in">
              <ContentWorkshop profile={profile} onIdeaGenerated={() => {}} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
