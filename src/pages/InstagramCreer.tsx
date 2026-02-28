import { useState } from "react";
import ContentSetupForm from "@/components/ContentSetupForm";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import { useNavigate, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isModuleVisible } from "@/config/feature-flags";
import { useProfile } from "@/hooks/use-profile";

import DictationInput from "@/components/DictationInput";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { useActiveChannels } from "@/hooks/use-active-channels";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";

interface FormatOption {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  route: string;
  comingSoon?: boolean;
  channel: string; // which channel this format belongs to
}

function getFormatOptions(suggestion: FormatSuggestion | null): FormatOption[] {
  const params = new URLSearchParams();
  params.set("from", "/creer");
  if (suggestion) {
    if (suggestion.objective) params.set("objectif", suggestion.objective);
    if (suggestion.suggested_angle) params.set("sujet", encodeURIComponent(suggestion.suggested_angle));
  }
  const qs = params.toString();
  return [
    { id: "post", emoji: "📝", label: "Post", desc: "Carrousel, image ou texte", route: `/atelier?canal=instagram&${qs}`, channel: "instagram" },
    { id: "carousel", emoji: "🎠", label: "Carrousel", desc: "Slides visuelles", route: `/instagram/carousel?${qs}`, channel: "instagram" },
    { id: "reel", emoji: "🎬", label: "Reel", desc: "Script complet avec hook", route: `/instagram/reels?${qs}`, channel: "instagram" },
    { id: "story", emoji: "📱", label: "Story", desc: "Séquence avec stickers", route: `/instagram/stories?${qs}`, channel: "instagram" },
    { id: "linkedin", emoji: "💼", label: "LinkedIn", desc: "Post LinkedIn", route: `/linkedin/post?${qs}`, channel: "linkedin" },
    { id: "crosspost", emoji: "🔄", label: "Crosspost", desc: "Adapter un contenu existant", route: `/transformer`, channel: "instagram" },
    { id: "pinterest", emoji: "📌", label: "Pinterest", desc: "Épingle optimisée", route: "", comingSoon: true, channel: "pinterest" },
    { id: "newsletter", emoji: "📧", label: "Newsletter", desc: "Email engageant", route: "", comingSoon: true, channel: "newsletter" },
  ];
}

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
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { channels: activeChannels } = useActiveChannels();
  const { column, value } = useWorkspaceFilter();
  const [ideaText, setIdeaText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<FormatSuggestion | null>(null);
  const [showGuidedFlow, setShowGuidedFlow] = useState(false);
  const FORMAT_OPTIONS = getFormatOptions(suggestion).filter(f => activeChannels.includes(f.channel as any));
  const [secondaryMode, setSecondaryMode] = useState<"none" | "dictate">("none");
  const [contentCoachingOpen, setContentCoachingOpen] = useState(false);
  const { data: profile } = useProfile();

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
      const wsId = column === "workspace_id" ? value : undefined;
      const res = await supabase.functions.invoke("suggest-format", {
        body: { idea: ideaText, workspace_id: wsId },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setSuggestion(res.data);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      const msg = e?.message || "";
      if (msg.includes("API_KEY") || msg.includes("not configured")) {
        toast({ title: "Fonctionnalité en cours de configuration", description: "Cette recommandation sera bientôt disponible. En attendant, choisis un format ci-dessous 👇", variant: "default" });
      } else {
        toast({ title: "Oups", description: "Impossible de recommander un format pour l'instant. Choisis directement ci-dessous 👇", variant: "default" });
      }
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
        <SubPageHeader parentLabel="Dashboard" parentTo="/dashboard" currentLabel="Créer un contenu" useFromParam />

        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">✨ Créer un contenu</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choisis ton canal et ton format, l'IA s'occupe du reste.</p>
          <button
            onClick={() => setContentCoachingOpen(true)}
            className="text-xs text-muted-foreground hover:text-primary mt-2 transition-colors"
          >
            🤔 Je sais pas quoi poster...
          </button>
        </div>

        {/* ─── "L'IA me recommande" block ─── */}
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

        {/* ─── Création guidée ─── */}
        <div className="rounded-2xl border border-border bg-card mb-6 overflow-hidden">
          <button
            onClick={() => setShowGuidedFlow(!showGuidedFlow)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <div>
              <h3 className="font-display font-bold text-sm text-foreground">
                🎯 Tu sais ce que tu veux dire mais pas comment ?
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Choisis ton objectif et ton angle, on te guide vers le bon format.
              </p>
            </div>
            <span className={`text-muted-foreground transition-transform ${showGuidedFlow ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {showGuidedFlow && (
            <div className="px-5 pb-5 animate-fade-in">
              <ContentSetupForm
                compact
                submitLabel="Créer ce contenu →"
                onSubmit={({ canal, objectif, format, sujet }) => {
                  const params = new URLSearchParams();
                  params.set("canal", canal);
                  params.set("from", "/creer");
                  if (objectif) params.set("objectif", objectif);
                  if (sujet) params.set("sujet", encodeURIComponent(sujet));
                  if (format) params.set("format", format);
                  navigate(`/atelier?${params.toString()}`);
                }}
              />
            </div>
          )}
        </div>

        {/* ─── Label before format grid ─── */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Ou choisis directement un format
        </p>

        {/* ─── Format grid grouped by channel ─── */}
        {(() => {
          const channelLabels: Record<string, string> = {
            instagram: "📱 Instagram",
            linkedin: "💼 LinkedIn",
            pinterest: "📌 Pinterest",
            newsletter: "📧 Newsletter",
          };
          const channelOrder = ["instagram", "linkedin", "newsletter"]
            .concat(isModuleVisible("pinterest", isAdmin) ? ["pinterest"] : []);
          const grouped = channelOrder
            .map(ch => ({ channel: ch, formats: FORMAT_OPTIONS.filter(f => f.channel === ch) }))
            .filter(g => g.formats.length > 0);

          return grouped.map(g => (
            <div key={g.channel} className="mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {channelLabels[g.channel] || g.channel}
              </p>
              <div className={`grid gap-2 ${g.channel === "instagram" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
                {g.formats.map((f) => (
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
            </div>
          ));
        })()}

        {/* ─── Transformer link ─── */}
        <div className="mb-4">
          <Link
            to="/transformer"
            className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔄</span>
              <div>
                <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  Transformer un contenu existant
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Recycler, adapter pour un autre canal, ou t'inspirer d'un contenu.</p>
              </div>
            </div>
            <span className="text-primary text-sm font-semibold shrink-0">Transformer →</span>
          </Link>
        </div>

        {/* ─── Dicter ─── */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant={secondaryMode === "dictate" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSecondaryMode(secondaryMode === "dictate" ? "none" : "dictate");
              }}
              className="rounded-full gap-1.5 text-xs"
            >
              🎤 Dicter mon contenu
            </Button>
          </div>
          {secondaryMode === "dictate" && (
            <div className="mt-4 animate-fade-in">
              <DictationInput onTranscribed={(text) => {
                navigate("/atelier?canal=instagram", {
                  state: { fromDictation: true, dictatedText: text },
                });
              }} />
            </div>
          )}
        </div>

        <ContentCoachingDialog open={contentCoachingOpen} onOpenChange={setContentCoachingOpen} />
      </main>
    </div>
  );
}