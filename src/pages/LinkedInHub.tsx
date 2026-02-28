import { useState, useEffect } from "react";
import { toLocalDateStr } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import FirstTimeTooltip from "@/components/FirstTimeTooltip";
import { ZoneSection, HubCard } from "@/components/hub";
import { useDemoContext } from "@/contexts/DemoContext";
import LinkedInCoaching from "@/components/linkedin/LinkedInCoaching";

interface ProgressData {
  profileSteps: number;
  summaryDone: boolean;
  experienceCount: number;
  recoCount: number;
  engagementWeekly: string;
  ideasCount: number;
  calendarCount: number;
  commentAccountsCount: number;
}

export default function LinkedInHub() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressData>({
    profileSteps: 0, summaryDone: false, experienceCount: 0,
    recoCount: 0, engagementWeekly: "À faire", ideasCount: 0, calendarCount: 0, commentAccountsCount: 0,
  });

  useEffect(() => {
    if (isDemoMode) {
      setProgress({
        profileSteps: 3,
        summaryDone: true,
        experienceCount: 4,
        recoCount: 2,
        engagementWeekly: "6/10",
        ideasCount: 8,
        calendarCount: 3,
        commentAccountsCount: 12,
      });
      setLoading(false);
      return;
    }
    if (!user) return;
    const fetch = async () => {
      const now = new Date();
      const monthStart = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const day = now.getDay();
      const mondayDate = new Date(now);
      mondayDate.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
      const monday = toLocalDateStr(mondayDate);

      const [profileRes, expRes, recoRes, weeklyRes, ideasRes, calRes, commentRes] = await Promise.all([
        (supabase.from("linkedin_profile") as any).select("title_done, url_done, photo_done, banner_done").eq(column, value).maybeSingle(),
        (supabase.from("linkedin_experiences") as any).select("id", { count: "exact", head: true }).eq(column, value),
        (supabase.from("linkedin_recommendations") as any).select("id, reco_received").eq(column, value),
        (supabase.from("engagement_weekly_linkedin") as any).select("total_done, objective, comments_target, messages_target").eq(column, value).eq("week_start", monday).maybeSingle(),
        (supabase.from("saved_ideas") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("canal", "linkedin"),
        (supabase.from("calendar_posts") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("canal", "linkedin").gte("date", monthStart).lte("date", monthEnd),
        (supabase.from("linkedin_comment_strategy") as any).select("accounts").eq(column, value).maybeSingle(),
      ]);

      const lp = profileRes.data;
      const profileSteps = lp ? [lp.title_done, lp.url_done, lp.photo_done, lp.banner_done].filter(Boolean).length : 0;
      const recoData = recoRes.data || [];
      const recoReceived = recoData.filter((r: any) => r.reco_received).length;
      const w = weeklyRes.data;
      const wTotal = w ? (w.comments_target ?? 0) + (w.messages_target ?? 0) : 0;

      const commentAccounts = commentRes.data?.accounts;
      const commentAccountsCount = Array.isArray(commentAccounts) ? commentAccounts.length : 0;

      setProgress({
        profileSteps,
        summaryDone: !!lp,
        experienceCount: expRes.count || 0,
        recoCount: recoReceived,
        engagementWeekly: w ? `${w.total_done ?? 0}/${wTotal}` : "À faire",
        ideasCount: ideasRes.count || 0,
        calendarCount: calRes.count || 0,
        commentAccountsCount,
      });
      setLoading(false);
    };
    fetch();
  }, [user?.id, column, value]);

  const progressMap: Record<string, string | null> = {
    "/linkedin/audit": null,
    "/linkedin/profil": `${progress.profileSteps}/4 éléments`,
    "/linkedin/resume": progress.summaryDone ? "✓ Rédigé" : "À faire",
    "/linkedin/parcours": `${progress.experienceCount} expérience${progress.experienceCount !== 1 ? "s" : ""}`,
    "/linkedin/recommandations": `${progress.recoCount}/5 reçues`,
    "/linkedin/engagement": progress.engagementWeekly,
    "/linkedin/comment-strategy": `${progress.commentAccountsCount} compte${progress.commentAccountsCount !== 1 ? "s" : ""}`,
    "/calendrier?canal=linkedin": `${progress.calendarCount} post${progress.calendarCount !== 1 ? "s" : ""} ce mois`,
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="flex gap-1"><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} /><div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} /></div></div>;

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
          <p className="mt-1 text-[15px] text-muted-foreground">
            Optimise ton profil, crée des posts pro, développe ton réseau : LinkedIn c'est pas ennuyeux, promis.
          </p>
        </div>

        {/* ─── ZONE 1 : POSER LES BASES ─── */}
        <ZoneSection emoji="🏗️" title="Poser les bases">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <HubCard to="#" emoji="✨" title="Coaching LinkedIn" desc="On t'aide à optimiser ton profil et ta stratégie, question par question." tag="Guidé · 15 min" onClick={() => setCoachingOpen(true)} />
            <FirstTimeTooltip id="linkedin-audit" text="Commence ici : un scan complet de ton profil LinkedIn avec des priorités d'action.">
              <HubCard to="/linkedin/audit" emoji="🔍" title="Auditer mon compte" desc="Score complet et priorités d'action." tag="Assisté" progressLabel={progressMap["/linkedin/audit"]} />
            </FirstTimeTooltip>
            <HubCard to="/linkedin/profil" emoji="👤" title="Optimiser mon profil" desc="Titre, photo, bannière, URL." tag="Checklist" progressLabel={progressMap["/linkedin/profil"]} />
            <HubCard to="/linkedin/resume" emoji="✍️" title="Mon résumé (À propos)" desc="Rédige un résumé qui donne envie." tag="Guidé" progressLabel={progressMap["/linkedin/resume"]} />
            <HubCard to="/linkedin/parcours" emoji="💼" title="Mon parcours" desc="Expériences, formations, compétences." tag="Guidé" progressLabel={progressMap["/linkedin/parcours"]} />
            <HubCard to="/linkedin/recommandations" emoji="⭐" title="Mes recommandations" desc="Demande et gère tes recommandations." tag="Exercice" progressLabel={progressMap["/linkedin/recommandations"]} />
          </div>
        </ZoneSection>

        {/* ─── ZONE 2 : CRÉER ─── */}
        <ZoneSection emoji="✨" title="Créer">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/creer?canal=linkedin"
              className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
            >
              <div>
                <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  Créer un post LinkedIn
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">L'IA génère un post calibré sur ton branding.</p>
              </div>
              <span className="text-primary text-sm font-semibold">Créer →</span>
            </Link>
            <Link
              to="/transformer?mode=crosspost"
              className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
            >
              <div>
                <h3 className="font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  Recycler un contenu
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">Adapte un contenu existant pour LinkedIn.</p>
              </div>
              <span className="text-primary text-sm font-semibold">Recycler →</span>
            </Link>
          </div>
        </ZoneSection>

        {/* ─── ZONE 3 : ENGAGER & PLANIFIER ─── */}
        <ZoneSection emoji="💬" title="Engager & Planifier">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FirstTimeTooltip id="linkedin-engagement" text="Tes actions hebdo pour développer ton réseau.">
              <HubCard to="/linkedin/engagement" emoji="💬" title="Mon engagement" desc="Commentaires et messages stratégiques." tag="Suivi hebdo" progressLabel={progressMap["/linkedin/engagement"]} />
            </FirstTimeTooltip>
            <HubCard to="/linkedin/comment-strategy" emoji="🎯" title="Stratégie commentaires" desc="Tes 10-15 comptes à commenter." tag="Exercice" progressLabel={progressMap["/linkedin/comment-strategy"]} />
            <HubCard to="/calendrier?canal=linkedin" emoji="📅" title="Mon calendrier" desc="Planifie tes posts LinkedIn." tag="Planning" progressLabel={progressMap["/calendrier?canal=linkedin"]} />
          </div>
        </ZoneSection>

        <LinkedInCoaching open={coachingOpen} onOpenChange={setCoachingOpen} />
      </main>
    </div>
  );
}

