import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft, User, Sparkles, Lightbulb, PenLine, CalendarDays, Rocket, Heart } from "lucide-react";

interface CardDef {
  icon: React.ElementType;
  emoji: string;
  title: string;
  desc: string;
  to: string;
  tag: string;
}

const CARDS: CardDef[] = [
  { icon: User, emoji: "👤", title: "Mon profil", desc: "Audit + bio + stories à la une + posts épinglés + feed + nom.", to: "/instagram/profil", tag: "Audit + Optimisations" },
  { icon: Sparkles, emoji: "✨", title: "M'inspirer", desc: "Colle un contenu qui t'a plu. L'IA t'explique pourquoi ça marche et te crée ta version.", to: "/instagram/inspirer", tag: "Analyser · Adapter · Poster" },
  { icon: Lightbulb, emoji: "💡", title: "Trouver des idées", desc: "Direction l'atelier.", to: "/atelier?canal=instagram", tag: "IA" },
  { icon: PenLine, emoji: "✏️", title: "Rédiger un contenu", desc: "L'IA t'aide à rédiger un post complet.", to: "/atelier/rediger?canal=instagram", tag: "Rédaction IA" },
  { icon: CalendarDays, emoji: "📅", title: "Mon calendrier", desc: "Planifie tes posts.", to: "/calendrier?canal=instagram", tag: "Planning" },
  { icon: Rocket, emoji: "🚀", title: "Mon lancement", desc: "Plan de lancement guidé.", to: "/instagram/lancement", tag: "Template + IA" },
  { icon: Heart, emoji: "📊", title: "Mon engagement", desc: "Crée du lien avec ta communauté. Exercice guidé + checklist hebdo.", to: "/instagram/engagement", tag: "Exercice + Suivi" },
];

interface ProgressData {
  auditScore: number | null;
  inspirerCount: number;
  ideasCount: number;
  calendarCount: number;
  launchCount: number;
  engagementWeekly: string;
}

export default function InstagramHub() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<ProgressData>({
    auditScore: null, inspirerCount: 0, ideasCount: 0,
    calendarCount: 0, launchCount: 0, engagementWeekly: "0/0",
  });

  useEffect(() => {
    if (!user) return;
    const fetchProgress = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const day = now.getDay();
      const mondayDate = new Date(now);
      mondayDate.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
      const monday = mondayDate.toISOString().split("T")[0];

      const [auditRes, inspirerRes, ideasRes, calRes, launchRes, weeklyRes] = await Promise.all([
        supabase.from("instagram_audit").select("score_global").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("instagram_inspirations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("saved_ideas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "instagram"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "instagram").gte("date", monthStart).lte("date", monthEnd),
        supabase.from("launches").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("engagement_weekly").select("total_done, dm_target, comments_target, replies_target").eq("user_id", user.id).eq("week_start", monday).maybeSingle(),
      ]);

      const w = weeklyRes.data;
      const wTotal = w ? (w.dm_target ?? 0) + (w.comments_target ?? 0) + (w.replies_target ?? 0) : 0;

      setProgress({
        auditScore: auditRes.data?.score_global ?? null,
        inspirerCount: inspirerRes.count || 0,
        ideasCount: ideasRes.count || 0,
        calendarCount: calRes.count || 0,
        launchCount: launchRes.count || 0,
        engagementWeekly: w ? `${w.total_done ?? 0}/${wTotal}` : "À faire",
      });
    };
    fetchProgress();
  }, [user]);

  const getProgressLabel = (index: number): string | null => {
    switch (index) {
      case 0: return progress.auditScore !== null ? `${progress.auditScore}/100` : "À configurer";
      case 1: return progress.inspirerCount > 0 ? `${progress.inspirerCount} analyse${progress.inspirerCount !== 1 ? "s" : ""}` : null;
      case 2: return `${progress.ideasCount} idée${progress.ideasCount !== 1 ? "s" : ""}`;
      case 3: return null;
      case 4: return `${progress.calendarCount} post${progress.calendarCount !== 1 ? "s" : ""} ce mois`;
      case 5: return `${progress.launchCount} lancement${progress.launchCount !== 1 ? "s" : ""}`;
      case 6: return progress.engagementWeekly;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-bordeaux">Mon Instagram</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tout ce dont tu as besoin pour structurer et animer ton compte Instagram.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card, idx) => {
            const progressLabel = getProgressLabel(idx);
            return (
              <Link
                key={card.to}
                to={card.to}
                className="group relative rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition-all"
              >
                {progressLabel && (
                  <span className="absolute top-4 right-4 font-mono-ui text-[10px] font-semibold text-muted-foreground bg-rose-pale px-2 py-0.5 rounded-pill">
                    {progressLabel}
                  </span>
                )}
                <span className="text-2xl mb-3 block">{card.emoji}</span>
                <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  {card.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
                <span className="mt-3 inline-block font-mono-ui text-[10px] font-semibold text-primary bg-rose-pale px-2.5 py-0.5 rounded-pill">
                  {card.tag}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
