import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import FirstTimeTooltip from "@/components/FirstTimeTooltip";
import { ZoneSection, HubCard, FormatPill, HubConnectBanner } from "@/components/hub";
import { useDemoContext } from "@/contexts/DemoContext";

import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import InstagramProfileCoaching from "@/components/instagram/InstagramProfileCoaching";

interface ProgressData {
  auditScore: number | null;
  ideasCount: number;
  calendarCount: number;
  launchCount: number;
  engagementWeekly: string;
  statsFollowers: number | null;
  statsFollowersDiff: number | null;
  statsUpToDate: boolean;
}

export default function InstagramHub() {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressData>({
    auditScore: null, ideasCount: 0, calendarCount: 0, launchCount: 0, engagementWeekly: "À faire", statsFollowers: null, statsFollowersDiff: null, statsUpToDate: false,
  });
  const [coachingOpen, setCoachingOpen] = useState(false);

  useEffect(() => {
    if (isDemoMode && demoData) {
      setProgress({
        auditScore: (demoData as any).audit.score,
        ideasCount: (demoData as any).calendar_posts.filter((p: any) => !p.planned_day).length,
        calendarCount: (demoData as any).calendar_posts.filter((p: any) => p.planned_day).length,
        launchCount: 0,
        engagementWeekly: "4/10",
        statsFollowers: 1247,
        statsFollowersDiff: 38,
        statsUpToDate: true,
      });
      setLoading(false);
      return;
    }
    if (!user) return;
    const fetchProgress = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const day = now.getDay();
      const mondayDate = new Date(now);
      mondayDate.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
      const monday = mondayDate.toISOString().split("T")[0];

      const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];

      const [auditRes, ideasRes, calRes, launchRes, weeklyRes, statsRes, prevStatsRes] = await Promise.all([
        (supabase.from("instagram_audit") as any).select("score_global").eq(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("saved_ideas") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("canal", "instagram"),
        (supabase.from("calendar_posts") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("canal", "instagram").gte("date", monthStart).lte("date", monthEnd),
        (supabase.from("launches") as any).select("id", { count: "exact", head: true }).eq(column, value),
        (supabase.from("engagement_weekly") as any).select("total_done, dm_target, comments_target, replies_target").eq(column, value).eq("week_start", monday).maybeSingle(),
        (supabase.from("monthly_stats") as any).select("followers, followers_gained").eq(column, value).eq("month_date", currentMonthDate).maybeSingle(),
        (supabase.from("monthly_stats") as any).select("followers").eq(column, value).eq("month_date", prevMonthDate).maybeSingle(),
      ]);

      const w = weeklyRes.data;
      const wTotal = w ? (w.dm_target ?? 0) + (w.comments_target ?? 0) + (w.replies_target ?? 0) : 0;
      const currentFollowers = (statsRes.data as any)?.followers ?? null;
      const prevFollowers = (prevStatsRes.data as any)?.followers ?? null;

      setProgress({
        auditScore: auditRes.data?.score_global ?? null,
        ideasCount: ideasRes.count || 0,
        calendarCount: calRes.count || 0,
        launchCount: launchRes.count || 0,
        engagementWeekly: w ? `${w.total_done ?? 0}/${wTotal}` : "À faire",
        statsFollowers: currentFollowers,
        statsFollowersDiff: currentFollowers != null && prevFollowers != null ? currentFollowers - prevFollowers : null,
        statsUpToDate: currentFollowers != null,
      });
      setLoading(false);
    };
    fetchProgress();
  }, [user?.id]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" />
          Retour à l'accueil
        </Link>

        <div className="mb-8">
         <h1 className="font-display text-3xl sm:text-3xl font-bold text-bordeaux">📱 Mon Instagram</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Audite ton profil, génère des contenus, optimise ta bio : tout pour qu'Instagram bosse pour toi (et pas l'inverse).
          </p>
        </div>

        {!isDemoMode && <HubConnectBanner platform="instagram" />}

        {/* ─── ZONE 1 : ANALYSER ─── */}
        <ZoneSection emoji="📊" title={<><span className="text-primary font-bold">1.</span> 📊 Analyser</>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={() => setCoachingOpen(true)} className="text-left">
              <div className="relative rounded-2xl border-2 border-primary bg-primary/5 p-5 hover:bg-primary/10 hover:shadow-md transition-all group">
                <span className="absolute top-3 right-3 font-mono-ui text-2xs font-semibold text-primary bg-rose-pale px-2.5 py-0.5 rounded-pill">
                  IA · 10 min
                </span>
                <span className="text-2xl mb-2 block">✨</span>
                <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  Optimiser mon profil avec l'IA
                </h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">L'IA t'aide à optimiser ton profil, question par question.</p>
              </div>
            </button>
            <FirstTimeTooltip id="instagram-profil" text="Analyse ton profil : bio, feed, cohérence visuelle.">
              <HubCard to="/instagram/profil" emoji="👤" title="Auditer mon profil" desc="Audit complet : bio, feed, stories à la une, posts épinglés, nom." />
            </FirstTimeTooltip>
            <FirstTimeTooltip id="instagram-stats" text="Tes KPIs mensuels avec graphiques d'évolution.">
              <HubCard to="/instagram/stats" emoji="📈" title="Suivre mes stats" desc="Tes KPIs mensuels : Instagram, site, CA. Avec graphiques d'évolution." />
            </FirstTimeTooltip>
          </div>
        </ZoneSection>

        {/* ─── ZONE 2 : CRÉER ─── */}
        <ZoneSection emoji="✨" title={<><span className="text-primary font-bold">2.</span> ✨ Créer</>}>
          <Link
            to="/creer?canal=instagram"
            className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
          >
            <div>
              <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                Créer un contenu Instagram
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">Post, carrousel, reel, story : tous les formats.</p>
            </div>
            <span className="text-primary text-sm font-semibold">Créer →</span>
          </Link>
        </ZoneSection>

        {/* ─── ZONE 3 : ENGAGER & PLANIFIER ─── */}
        <ZoneSection emoji="💬" title={<><span className="text-primary font-bold">3.</span> 💬 Engager & Planifier</>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <HubCard to="/instagram/routine" emoji="💬" title="Faire ma routine d'engagement" desc="Tes actions hebdo pour créer du lien avec ta communauté." />
            <HubCard to="/calendrier?canal=instagram" emoji="📅" title="Planifier mon mois" desc="Ton calendrier Instagram : pose tes posts, visualise ta régularité." />
            <HubCard to="/idees?canal=instagram" emoji="💡" title="Piocher dans mes idées" desc="Ta banque d'idées sauvegardées." />
            <HubCard to="/instagram/lancement" emoji="🚀" title="Préparer mon lancement" desc="Plan de lancement guidé, étape par étape." />
          </div>
        </ZoneSection>

        <InstagramProfileCoaching open={coachingOpen} onOpenChange={setCoachingOpen} />
      </main>
    </div>
  );
}

