import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import RoomTour from "@/components/RoomTour";
import SuggestedContents from "@/components/dashboard/SuggestedContents";
import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useUserPhase } from "@/hooks/use-user-phase";
import { useToast } from "@/hooks/use-toast";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";

/* ── Upcoming posts hook ── */
function useUpcomingPosts() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["upcoming-posts", user?.id, column, value],
    queryFn: async () => {
      const today = new Date();
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + 7);

      const { data, count } = await (supabase.from("calendar_posts") as any)
        .select("id, theme, date, canal, status", { count: "exact" })
        .eq(column, value)
        .gte("date", today.toISOString().split("T")[0])
        .lte("date", endOfWeek.toISOString().split("T")[0])
        .order("date", { ascending: true })
        .limit(3);

      return { posts: data || [], weekCount: count ?? 0 };
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

/* ── Chip component ── */
function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm rounded-full bg-card border border-[hsl(var(--primary)/0.3)] text-foreground hover:border-primary hover:bg-secondary/30 transition-colors"
    >
      {children}
    </button>
  );
}

/* ── Icon resolver ── */
function RecommendationIcon({ name }: { name: string }) {
  const iconMap: Record<string, string> = {
    BookOpen: "📖",
    Users: "👥",
    Layers: "📚",
    CalendarPlus: "📅",
    CalendarDays: "📅",
    BarChart3: "📊",
    Sparkles: "✨",
    PenLine: "✏️",
    Palette: "🎨",
    Search: "🔍",
    ClipboardCheck: "📋",
    LayoutGrid: "📱",
    Lightbulb: "💡",
  };
  return <span className="text-xl">{iconMap[name] || "📌"}</span>;
}

/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();
  const { phase, speed, isLoading: phaseLoading } = useUserPhase();
  const { data: upcoming } = useUpcomingPosts();

  const [showDashTour, setShowDashTour] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("lac_tour_dashboard_seen")) {
      const timer = setTimeout(() => setShowDashTour(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDashTourClose = () => {
    setShowDashTour(false);
    localStorage.setItem("lac_tour_dashboard_seen", "true");
  };

  const handleNavigate = (route: string) => {
    if (route === "/creer" && profileSummary.brandingTotal < 50) {
      toast({
        title: "Tes contenus seront plus personnalisés une fois que tu auras posé tes bases 💡",
      });
    }
    navigate(route);
  };

  if (isLoading || phaseLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-[640px] mx-auto px-4 py-12">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 bg-muted rounded-lg" />
            <div className="h-4 w-64 bg-muted rounded" />
            <div className="h-40 bg-muted rounded-2xl mt-6" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-[640px] mx-auto px-4 py-8">
        {phase === "construction" && (
          <ConstructionPhase
            firstName={profileSummary.firstName}
            recommendation={recommendation}
            onNavigate={handleNavigate}
          />
        )}

        {phase === "action" && (
          <ActionPhase
            firstName={profileSummary.firstName}
            recommendation={recommendation}
            onNavigate={handleNavigate}
          />
        )}

        {phase === "pilotage" && (
          <PilotagePhase
            firstName={profileSummary.firstName}
            recommendation={recommendation}
            onNavigate={handleNavigate}
            postsThisWeek={upcoming?.weekCount ?? 0}
            nextPost={upcoming?.posts?.[0] || null}
          />
        )}

        {/* Suggested contents widget */}
        {profileSummary.brandingTotal >= 30 && (speed === 1 || phase === "construction") && (
          <SuggestedContents />
        )}
      </main>

      <RoomTour open={showDashTour} onClose={handleDashTourClose} />
    </div>
  );
}

/* ═══════ Phase Construction ═══════ */
function ConstructionPhase({
  firstName,
  recommendation,
  onNavigate,
}: {
  firstName: string;
  recommendation: ReturnType<typeof useGuideRecommendation>["recommendation"];
  onNavigate: (route: string) => void;
}) {
  return (
    <>
      <h1 className="font-display text-2xl text-foreground">
        Salut {firstName} !
      </h1>
      <p className="text-muted-foreground mt-2">Ta prochaine étape :</p>

      <Card data-tour="card-next-step" className="mt-6 p-6 border-2 border-primary/20 bg-card rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <RecommendationIcon name={recommendation.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg text-foreground">
              {recommendation.title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {recommendation.explanation}
            </p>
          </div>
        </div>
        <Button
          className="w-full mt-4 rounded-xl"
          onClick={() => onNavigate(recommendation.ctaRoute)}
        >
          {recommendation.ctaLabel}
        </Button>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <p className="w-full text-xs text-muted-foreground mb-1">
          Tu veux faire autre chose ?
        </p>
        {recommendation.alternatives.map((alt) => (
          <Chip key={alt.route} onClick={() => onNavigate(alt.route)}>
            {alt.icon && <RecommendationIcon name={alt.icon} />} {alt.title}
          </Chip>
        ))}
      </div>

      <Card
        data-tour="card-assistant"
        className="mt-6 p-4 cursor-pointer hover:border-primary/30 transition bg-card rounded-2xl border border-dashed border-primary/20"
        onClick={() => onNavigate("/dashboard/guide")}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-lg">💬</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground">Discuter avec mon assistant</p>
            <p className="text-xs text-muted-foreground">Pose n'importe quelle question sur ta com'</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </Card>
    </>
  );
}

/* ═══════ Phase Action ═══════ */
function ActionPhase({
  firstName,
  recommendation,
  onNavigate,
}: {
  firstName: string;
  recommendation: ReturnType<typeof useGuideRecommendation>["recommendation"];
  onNavigate: (route: string) => void;
}) {
  const suggestions = [
    { emoji: recommendation.icon, title: recommendation.title, subtitle: recommendation.explanation, route: recommendation.ctaRoute },
    ...recommendation.alternatives.map((a) => ({
      emoji: a.icon,
      title: a.title,
      subtitle: "",
      route: a.route,
    })),
  ];

  return (
    <>
      <h1 className="font-display text-2xl text-foreground">
        Salut {firstName} !
      </h1>
      <p className="text-muted-foreground mt-2">Qu'est-ce qu'on fait cette semaine ?</p>

      <div className="space-y-3 mt-6">
        {suggestions.map((s) => (
          <Card
            key={s.route}
            className="p-4 cursor-pointer hover:border-primary/30 transition bg-card rounded-2xl"
            onClick={() => onNavigate(s.route)}
          >
            <div className="flex items-center gap-3">
              <RecommendationIcon name={s.emoji} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{s.title}</p>
                {s.subtitle && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.subtitle}</p>
                )}
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </Card>
        ))}
      </div>

      <Card
        data-tour="card-assistant"
        className="mt-6 p-4 cursor-pointer hover:border-primary/30 transition bg-card rounded-2xl border border-dashed border-primary/20"
        onClick={() => onNavigate("/dashboard/guide")}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-lg">💬</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground">Discuter avec mon assistant</p>
            <p className="text-xs text-muted-foreground">Pose n'importe quelle question sur ta com'</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip onClick={() => onNavigate("/dashboard/complet")}>Voir tous mes outils →</Chip>
      </div>
    </>
  );
}

/* ═══════ Phase Pilotage ═══════ */
function PilotagePhase({
  firstName,
  recommendation,
  onNavigate,
  postsThisWeek,
  nextPost,
}: {
  firstName: string;
  recommendation: ReturnType<typeof useGuideRecommendation>["recommendation"];
  onNavigate: (route: string) => void;
  postsThisWeek: number;
  nextPost: { id: string; theme: string; date: string; canal: string; status: string } | null;
}) {
  const suggestions = [
    { emoji: recommendation.icon, title: recommendation.title, subtitle: recommendation.explanation, route: recommendation.ctaRoute },
    ...recommendation.alternatives.map((a) => ({
      emoji: a.icon,
      title: a.title,
      subtitle: "",
      route: a.route,
    })),
  ];

  return (
    <>
      <h1 className="font-display text-2xl text-foreground">
        Salut {firstName} !
      </h1>
      <p className="text-muted-foreground mt-2">
        Cette semaine : {postsThisWeek} contenu{postsThisWeek > 1 ? "s" : ""} planifié{postsThisWeek > 1 ? "s" : ""}.
      </p>

      {nextPost && (
        <Card className="mt-4 p-4 bg-card rounded-2xl border border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Ton prochain post</p>
              <p className="text-sm font-medium text-foreground truncate mt-0.5">
                « {nextPost.theme} »
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl shrink-0"
              onClick={() => onNavigate(`/calendrier?post=${nextPost.id}`)}
            >
              Finaliser
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3 mt-6">
        {suggestions.map((s) => (
          <Card
            key={s.route}
            className="p-4 cursor-pointer hover:border-primary/30 transition bg-card rounded-2xl"
            onClick={() => onNavigate(s.route)}
          >
            <div className="flex items-center gap-3">
              <RecommendationIcon name={s.emoji} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{s.title}</p>
                {s.subtitle && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{s.subtitle}</p>
                )}
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </Card>
        ))}
      </div>

      <Card
        data-tour="card-assistant"
        className="mt-6 p-4 cursor-pointer hover:border-primary/30 transition bg-card rounded-2xl border border-dashed border-primary/20"
        onClick={() => onNavigate("/dashboard/guide")}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-lg">💬</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground">Discuter avec mon assistant</p>
            <p className="text-xs text-muted-foreground">Pose n'importe quelle question sur ta com'</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </Card>

      <Link
        to="/dashboard/complet"
        className="text-xs text-muted-foreground underline mt-8 block text-center"
      >
        Voir tous mes outils →
      </Link>
    </>
  );
}
