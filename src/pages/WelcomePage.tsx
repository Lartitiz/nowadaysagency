import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const GOAL_LABELS: Record<string, string> = {
  start: "🌱 Poser les bases",
  visibility: "📱 Être plus visible",
  launch: "🎁 Lancer une offre",
  clients: "🎯 Trouver des client·es",
  structure: "🗂️ Structurer",
};

const TIME_LABELS: Record<string, string> = {
  less_2h: "Moins de 2h",
  "2_5h": "2 à 5h",
  "5_10h": "5 à 10h",
  more_10h: "Plus de 10h",
};

const STEPS = [
  {
    num: "1️⃣",
    title: "Pose tes fondations",
    emoji: "🎨",
    module: "Branding",
    time: "30 min",
    desc: "Définis ton positionnement, ta cible, ton ton de communication. C'est la base de tout.",
    cta: "👉 C'est ta première étape.",
  },
  {
    num: "2️⃣",
    title: "Audite et optimise tes canaux",
    emoji: "📱",
    module: "Audit Instagram",
    time: "15 min",
    desc: "Analyse ton profil et ta bio. L'outil te dit exactement quoi améliorer.",
  },
  {
    num: "3️⃣",
    title: "Crée tes premiers contenus",
    emoji: "✨",
    module: "Atelier créatif",
    time: "20 min",
    desc: "Posts, Reels, Stories, Carrousels. L'outil t'accompagne de l'idée au texte final.",
  },
  {
    num: "4️⃣",
    title: "Planifie et engage",
    emoji: "📅",
    module: "Calendrier + Contacts",
    time: "15 min",
    desc: "Planifie tes publications et mets en place ta routine d'engagement.",
  },
];

export default function WelcomePage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const [prenom, setPrenom] = useState("");
  const [goal, setGoal] = useState("");
  const [time, setTime] = useState("");
  const [channels, setChannels] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data: profile }, { data: config }] = await Promise.all([
        (supabase.from("profiles") as any).select("prenom, canaux").eq(column, value).maybeSingle(),
        (supabase.from("user_plan_config") as any).select("main_goal, weekly_time, welcome_seen, onboarding_completed").eq(column, value).maybeSingle(),
      ]);
      // Don't redirect if user explicitly navigated here (e.g., "Revoir la page de bienvenue")
      // Only redirect if they land here accidentally without completing onboarding
      if (!config?.onboarding_completed) {
        navigate("/onboarding", { replace: true });
        return;
      }
      if (profile) {
        setPrenom(profile.prenom || "");
        setChannels(profile.canaux || []);
      }
      if (config) {
        setGoal(config.main_goal || "");
        setTime(config.weekly_time || "");
      }
    };
    load();
  }, [user?.id]);

  const markSeen = async (destination: string) => {
    if (!user) return;
    await (supabase.from("user_plan_config") as any).update({ welcome_seen: true }).eq(column, value);
    navigate(destination);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl animate-fade-in space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
            ✨ C'est parti {prenom} !
          </h1>
          <p className="text-sm text-muted-foreground">
            Ton outil est prêt. Voici comment ça marche.
          </p>
        </div>

        {/* 4 Steps */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Ton parcours en 4 étapes
          </h2>

          <div className="space-y-3">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${
                  i === 0 ? "border-primary bg-secondary" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{s.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {s.num} {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.module} · {s.time}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                    {s.cta && (
                      <p className="text-xs font-semibold text-primary mt-1">{s.cta}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Config recap */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Ton outil s'adapte
          </h2>
          <div className="flex flex-wrap gap-2">
            {goal && (
              <span className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                🎯 {GOAL_LABELS[goal] || goal}
              </span>
            )}
            {time && (
              <span className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                ⏰ {TIME_LABELS[time] || time}
              </span>
            )}
            {channels.map((ch) => (
              <span key={ch} className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                📱 {ch}
              </span>
            ))}
          </div>
        </div>

        {/* Import suggestion */}
        <div className="rounded-2xl bg-rose-pale border border-border p-5">
          <p className="text-sm text-foreground">
            💡 Tu as déjà un document stratégique (plan de com', brief, site web) ?
            Importe-le dans le Branding pour gagner du temps.
          </p>
          <Link
            to="/branding"
            onClick={() => {
              if (user) (supabase.from("user_plan_config") as any).update({ welcome_seen: true }).eq(column, value);
            }}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary mt-2 hover:underline"
          >
            📄 Importer un document →
          </Link>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => markSeen("/branding")}
            className="flex-1 rounded-pill gap-2"
            size="lg"
          >
            🎨 Commencer par le Branding →
          </Button>
          <Button
            variant="outline"
            onClick={() => markSeen("/dashboard")}
            className="rounded-pill"
            size="lg"
          >
            📊 Aller au Dashboard →
          </Button>
        </div>
      </div>
    </div>
  );
}
