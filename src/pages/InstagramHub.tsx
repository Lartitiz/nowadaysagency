import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft, User, BarChart3, Sparkles, MessageCircle, CheckSquare, CalendarDays, Lightbulb, Rocket } from "lucide-react";

interface ProgressData {
  auditScore: number | null;
  ideasCount: number;
  calendarCount: number;
  launchCount: number;
  engagementWeekly: string;
}

export default function InstagramHub() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<ProgressData>({
    auditScore: null, ideasCount: 0, calendarCount: 0, launchCount: 0, engagementWeekly: "À faire",
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

      const [auditRes, ideasRes, calRes, launchRes, weeklyRes] = await Promise.all([
        supabase.from("instagram_audit").select("score_global").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("saved_ideas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "instagram"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("canal", "instagram").gte("date", monthStart).lte("date", monthEnd),
        supabase.from("launches").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("engagement_weekly").select("total_done, dm_target, comments_target, replies_target").eq("user_id", user.id).eq("week_start", monday).maybeSingle(),
      ]);

      const w = weeklyRes.data;
      const wTotal = w ? (w.dm_target ?? 0) + (w.comments_target ?? 0) + (w.replies_target ?? 0) : 0;

      setProgress({
        auditScore: auditRes.data?.score_global ?? null,
        ideasCount: ideasRes.count || 0,
        calendarCount: calRes.count || 0,
        launchCount: launchRes.count || 0,
        engagementWeekly: w ? `${w.total_done ?? 0}/${wTotal}` : "À faire",
      });
    };
    fetchProgress();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-bordeaux">Mon Instagram</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tout ce dont tu as besoin pour structurer et animer ton compte Instagram.
          </p>
        </div>

        {/* ─── ZONE 1 : ANALYSER ─── */}
        <ZoneSection emoji="📊" title="Analyser">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HubCard
              to="/instagram/profil"
              emoji="👤"
              title="Mon profil"
              desc="Audit complet : bio, feed, stories à la une, posts épinglés, nom."
              badge={progress.auditScore !== null ? `${progress.auditScore}/100` : "À configurer"}
            />
            <HubCard
              to="/instagram/profil"
              emoji="📈"
              title="Mes stats"
              desc="Followers, reach, posts qui marchent. Connecte Instagram pour un audit automatique."
              badge="Bientôt"
              disabled
            />
          </div>
        </ZoneSection>

        {/* ─── ZONE 2 : CRÉER ─── */}
        <ZoneSection emoji="✨" title="Créer">
          <Link
            to="/instagram/creer"
            className="group block rounded-2xl border-2 border-primary bg-primary/5 p-6 sm:p-8 hover:bg-primary/10 hover:shadow-md transition-all text-center"
          >
            <span className="text-3xl mb-3 block">✨</span>
            <h3 className="font-display text-xl sm:text-2xl font-bold text-primary group-hover:text-bordeaux transition-colors">
              Créer un contenu
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              L'IA t'aide à rédiger. Tu choisis le format : post, Reel ou story.
            </p>
            <div className="flex justify-center gap-3 mt-5 flex-wrap">
              <FormatPill emoji="📸" label="Post" />
              <FormatPill emoji="🎬" label="Reel" />
              <FormatPill emoji="📱" label="Story" />
            </div>
          </Link>
        </ZoneSection>

        {/* ─── ZONE 3 : ENGAGER ─── */}
        <ZoneSection emoji="💬" title="Engager">
          <HubCard
            to="/instagram/routine"
            emoji="💬"
            title="Routine d'engagement"
            desc="Tes actions hebdo pour créer du lien avec ta communauté."
            badge={progress.engagementWeekly}
          />
        </ZoneSection>

        {/* ─── ZONE 4 : PLANIFIER ─── */}
        <ZoneSection emoji="📅" title="Planifier">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <HubCard
              to="/calendrier?canal=instagram"
              emoji="📅"
              title="Calendrier"
              desc="Planifie tes posts."
              badge={`${progress.calendarCount} post${progress.calendarCount !== 1 ? "s" : ""} ce mois`}
            />
            <HubCard
              to="/atelier?canal=instagram"
              emoji="💡"
              title="Mes idées"
              desc="Ta banque d'idées sauvegardées."
              badge={`${progress.ideasCount} idée${progress.ideasCount !== 1 ? "s" : ""}`}
            />
            <HubCard
              to="/instagram/lancement"
              emoji="🚀"
              title="Mon lancement"
              desc="Plan de lancement guidé."
              badge={`${progress.launchCount} lancement${progress.launchCount !== 1 ? "s" : ""}`}
            />
          </div>
        </ZoneSection>
      </main>
    </div>
  );
}

/* ─── Zone section wrapper ─── */
function ZoneSection({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h2>
      <div className="rounded-2xl border border-border bg-card/50 p-4">
        {children}
      </div>
    </section>
  );
}

/* ─── Hub card ─── */
function HubCard({
  to,
  emoji,
  title,
  desc,
  badge,
  disabled,
}: {
  to: string;
  emoji: string;
  title: string;
  desc: string;
  badge?: string;
  disabled?: boolean;
}) {
  const content = (
    <div className={`relative rounded-2xl border border-border bg-card p-5 transition-all ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-primary hover:shadow-md group"}`}>
      {badge && (
        <span className="absolute top-3 right-3 font-mono-ui text-[10px] font-semibold text-muted-foreground bg-rose-pale px-2 py-0.5 rounded-pill">
          {badge}
        </span>
      )}
      <span className="text-2xl mb-2 block">{emoji}</span>
      <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );

  if (disabled) return content;

  return <Link to={to}>{content}</Link>;
}

/* ─── Format pill ─── */
function FormatPill({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono-ui text-xs font-semibold text-primary bg-rose-pale px-3 py-1.5 rounded-pill">
      {emoji} {label}
    </span>
  );
}
