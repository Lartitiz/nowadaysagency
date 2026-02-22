import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft, User, PenLine, Briefcase, Star, MessageCircle, Lightbulb, CalendarDays, Search } from "lucide-react";

interface CardDef {
  icon: React.ElementType;
  emoji: string;
  title: string;
  desc: string;
  to: string;
  tag: string;
}

const CARDS: CardDef[] = [
  { icon: Search, emoji: "🔍", title: "Auditer mon compte", desc: "Score complet et priorités d'action.", to: "/linkedin/audit", tag: "IA" },
  { icon: User, emoji: "👤", title: "Optimiser mon profil", desc: "Titre, photo, bannière, URL.", to: "/linkedin/profil", tag: "Checklist" },
  { icon: PenLine, emoji: "✍️", title: "Mon résumé (À propos)", desc: "Rédige un résumé qui donne envie.", to: "/linkedin/resume", tag: "Guide + IA" },
  { icon: Briefcase, emoji: "💼", title: "Mon parcours", desc: "Expériences, formations, compétences.", to: "/linkedin/parcours", tag: "Guide + IA" },
  { icon: Star, emoji: "⭐", title: "Mes recommandations", desc: "Demande et gère tes recommandations.", to: "/linkedin/recommandations", tag: "Exercice" },
  { icon: MessageCircle, emoji: "💬", title: "Mon engagement", desc: "Commentaires et messages stratégiques.", to: "/linkedin/engagement", tag: "Suivi hebdo" },
  { icon: Lightbulb, emoji: "💡", title: "Trouver des idées", desc: "Idées de contenu LinkedIn.", to: "/atelier?canal=linkedin", tag: "IA" },
  { icon: CalendarDays, emoji: "📅", title: "Mon calendrier", desc: "Planifie tes posts LinkedIn.", to: "/calendrier?canal=linkedin", tag: "Planning" },
];

interface ProgressData {
  profileSteps: number;
  summaryDone: boolean;
  experienceCount: number;
  recoCount: number;
  engagementWeekly: string;
  ideasCount: number;
  calendarCount: number;
}

export default function LinkedInHub() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<ProgressData>({
    profileSteps: 0, summaryDone: false, experienceCount: 0,
    recoCount: 0, engagementWeekly: "À faire", ideasCount: 0, calendarCount: 0,
  });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const day = now.getDay();
      const mondayDate = new Date(now);
      mondayDate.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
      const monday = mondayDate.toISOString().split("T")[0];

      const [profileRes, expRes, recoRes, weeklyRes, ideasRes, calRes] = await Promise.all([
        supabase.from("linkedin_profile").select("title_done, url_done, photo_done, banner_done").eq("user_id", user.id).maybeSingle(),
        supabase.from("linkedin_experiences").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("linkedin_recommendations").select("id, reco_received").eq("user_id", user.id),
        supabase.from("engagement_weekly_linkedin").select("total_done, objective, comments_target, messages_target").eq("user_id", user.id).eq("week_start", monday).maybeSingle(),
        supabase.from("saved_ideas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "linkedin"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "linkedin").gte("date", monthStart).lte("date", monthEnd),
      ]);

      const lp = profileRes.data;
      const profileSteps = lp ? [lp.title_done, lp.url_done, lp.photo_done, lp.banner_done].filter(Boolean).length : 0;
      const recoData = recoRes.data || [];
      const recoReceived = recoData.filter((r: any) => r.reco_received).length;
      const w = weeklyRes.data;
      const wTotal = w ? (w.comments_target ?? 0) + (w.messages_target ?? 0) : 0;

      setProgress({
        profileSteps,
        summaryDone: !!lp,
        experienceCount: expRes.count || 0,
        recoCount: recoReceived,
        engagementWeekly: w ? `${w.total_done ?? 0}/${wTotal}` : "À faire",
        ideasCount: ideasRes.count || 0,
        calendarCount: calRes.count || 0,
      });
    };
    fetch();
  }, [user?.id]);

  const getProgressLabel = (index: number): string | null => {
    switch (index) {
      case 0: return null; // audit - no progress
      case 1: return `${progress.profileSteps}/4 éléments`;
      case 2: return progress.summaryDone ? "✓ Rédigé" : "À faire";
      case 3: return `${progress.experienceCount} expérience${progress.experienceCount !== 1 ? "s" : ""}`;
      case 4: return `${progress.recoCount}/5 reçues`;
      case 5: return progress.engagementWeekly;
      case 6: return `${progress.ideasCount} idée${progress.ideasCount !== 1 ? "s" : ""}`;
      case 7: return `${progress.calendarCount} post${progress.calendarCount !== 1 ? "s" : ""} ce mois`;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">💼 Mon LinkedIn</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ton profil LinkedIn, c'est ta vitrine pro. On va le rendre irrésistible.
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
