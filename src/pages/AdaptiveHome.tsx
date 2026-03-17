import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Clock } from "lucide-react";

import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useOnboardingMissions, OnboardingMission } from "@/hooks/use-onboarding-missions";

import WelcomeOverlay from "@/components/dashboard/WelcomeOverlay";
import GuidedTour from "@/components/GuidedTour";
import AppHeader from "@/components/AppHeader";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Confetti from "@/components/Confetti";
import { MarkdownText } from "@/components/ui/markdown-text";

/* ── Icon resolver ── */
function RecommendationIcon({ name }: { name: string }) {
  const iconMap: Record<string, string> = {
    BookOpen: "📖", Users: "👥", Layers: "📚", CalendarPlus: "📅",
    CalendarDays: "📅", BarChart3: "📊", Sparkles: "✨", PenLine: "✏️",
    Palette: "🎨", Search: "🔍", ClipboardCheck: "📋", LayoutGrid: "📱",
    Lightbulb: "💡"
  };
  return <span className="text-xl">{iconMap[name] || "📌"}</span>;
}

/* ── Collapsible missions ── */
const COLLAPSED_KEY = "lac_missions_collapsed";
const FIRST_SEEN_KEY = "lac_missions_first_seen";

function CollapsibleMissions({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { missions, completedCount, allDone, nextMission, dismissed, dismiss, isLoading } = useOnboardingMissions();

  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === null) return false;
    return stored === "true";
  });

  useEffect(() => {
    if (!localStorage.getItem(FIRST_SEEN_KEY)) {
      localStorage.setItem(FIRST_SEEN_KEY, "true");
    }
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  };

  if (dismissed || isLoading) return null;
  if (allDone) return null;

  return (
    <div data-tour="card-missions" className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <button onClick={toggle} className="w-full flex items-center gap-3">
        <span className="text-base">🚀</span>
        <span className="font-heading text-sm font-bold text-foreground">Tes missions</span>
        <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
          {completedCount}/5
        </span>
        <Progress value={completedCount / 5 * 100} className="h-1.5 flex-1 max-w-[80px]" />
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </button>

      {!collapsed &&
        <div className="mt-4 space-y-2">
          {missions.map((mission) =>
            <MissionRow
              key={mission.id}
              mission={mission}
              isNext={nextMission?.id === mission.id}
              onClick={() => onNavigate(mission.route)}
            />
          )}
        </div>
      }
    </div>
  );
}

function MissionRow({ mission, isNext, onClick }: { mission: OnboardingMission; isNext: boolean; onClick: () => void }) {
  const isCompleted = mission.completed;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-all ${
        isCompleted
          ? "border-green-200 bg-green-50/50 opacity-70"
          : isNext
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <span className="text-lg mt-0.5">{isCompleted ? "✅" : mission.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{mission.title}</p>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{mission.description}</p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Clock className="h-3 w-3" />
          {mission.time}
        </span>
      </div>
      {isNext && !isCompleted &&
        <span className="text-xs font-medium text-primary animate-pulse shrink-0 mt-1">
          Commencer →
        </span>
      }
    </button>
  );
}

/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Ta prochaine étape", text: "Chaque jour, l'outil te recommande l'action qui aura le plus d'impact. Pas besoin de réfléchir par où commencer : c'est ici.", position: "bottom" as const },
  { target: "card-mini-actions", title: "Tes raccourcis", text: "Ton branding, tes audits, ta routine d'engagement, ton calendrier : tout est accessible en un clic depuis ces cartes.", position: "bottom" as const },
  { target: "nav-creer", title: "Créer", text: "C'est ici que tu génères tes contenus : posts, carrousels, newsletters, Reels. L'IA connaît ton branding et écrit avec ta voix.", position: "bottom" as const },
  { target: "nav-calendrier", title: "Organiser", text: "Ton calendrier éditorial. Tu planifies tes contenus, tu vois ta semaine d'un coup d'œil, et tu sais toujours quoi poster.", position: "bottom" as const },
  { target: "card-missions", title: "Tes premières missions", text: "5 petites étapes pour bien démarrer. Avance à ton rythme, coche au fur et à mesure. Rien d'obligatoire, tout est utile.", position: "top" as const },
  { target: "card-assistant", title: "Ta coach de com'", text: "Un doute, une question, besoin d'un coup de pouce ? Elle connaît ton projet et te répond de façon personnalisée.", position: "top" as const },
];

/* ── Mini-cards data ── */
const MINI_CARDS = [
  { emoji: "🎨", title: "Mon identité", subtitle: "Affiner mon identité", bg: "bg-accent/10", route: "/branding" },
  { emoji: "🔍", title: "Lancer un audit", subtitle: "Instagram ou site web", bg: "bg-[hsl(var(--bento-blue))]", route: "/instagram/audit" },
  { emoji: "💬", title: "Ma routine", subtitle: "15 min d'engagement", bg: "bg-rose-pale", route: "/instagram/routine" },
  { emoji: "📅", title: "Mon calendrier", subtitle: "Planifier mes contenus", bg: "bg-accent/10", route: "/calendrier" },
];

/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));
  const [welcomeDone, setWelcomeDone] = useState(() => localStorage.getItem("lac_welcome_seen") === "true");
  const [contentCoachingOpen, setContentCoachingOpen] = useState(false);
  const [coachHovered, setCoachHovered] = useState(false);

  // Après l'enrichissement fire-and-forget, invalider le cache branding
  // pour que les pages branding affichent les données pré-remplies
  const queryClient = useQueryClient();
  const location = useLocation();
  useEffect(() => {
    const isFirstVisit = location.state?.fromWelcome || !localStorage.getItem("lac_branding_cache_refreshed");
    if (isFirstVisit) {
      const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: ["brand-charter"] });
        queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
        queryClient.invalidateQueries({ queryKey: ["persona"] });
        queryClient.invalidateQueries({ queryKey: ["brand-proposition"] });
        queryClient.invalidateQueries({ queryKey: ["brand-strategy"] });
        queryClient.invalidateQueries({ queryKey: ["voice-profile"] });
        queryClient.invalidateQueries({ queryKey: ["editorial-line"] });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["offers"] });
      };
      // Première vague : 8s (couvre les enrichissements rapides)
      const timer1 = setTimeout(invalidateAll, 8000);
      // Deuxième vague : 30s (couvre les enrichissements Opus lents)
      const timer2 = setTimeout(() => {
        invalidateAll();
        localStorage.setItem("lac_branding_cache_refreshed", "true");
      }, 30000);
      return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }
  }, []);

  useEffect(() => {
    const check = () => setWelcomeDone(localStorage.getItem("lac_welcome_seen") === "true");
    const interval = setInterval(check, 500);
    // Fallback : si l'overlay ne s'affiche pas après 2s, lancer le tour quand même
    const fallback = setTimeout(() => setWelcomeDone(true), 2000);
    return () => { clearInterval(interval); clearTimeout(fallback); };
  }, []);

  const handleNavigate = (route: string) => {
    if (route === "/creer" && profileSummary.brandingTotal < 50) {
      toast({ title: "Tes contenus seront plus personnalisés une fois que tu auras posé tes bases 💡" });
    }
    navigate(route);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-[680px] mx-auto px-4 py-12">
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
      <main className="max-w-[680px] mx-auto px-4 py-8 space-y-6">

        {/* A. Greeting */}
        <div>
          <h1 className="font-display text-[28px] text-foreground leading-tight">
            Salut {profileSummary.firstName} ! 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-[15px]">
            Prête à faire rayonner tes projets ?
          </p>
        </div>

        {/* B. Hero Recommendation Card */}
        <div
          data-tour="card-next-step"
          className="rounded-2xl bg-card border border-border/60 p-6 sm:p-7 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[2px] transition-all duration-[300ms] ease-out relative overflow-hidden cursor-pointer"
          onClick={() => handleNavigate(recommendation.ctaRoute)}
        >
          {/* Accent bar */}
          <div className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-accent to-bordeaux rounded-l-2xl" />

          <div className="flex items-start gap-4 pl-3">
            <div className="w-[46px] h-[46px] rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
              <RecommendationIcon name={recommendation.icon} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono-ui text-[10.5px] text-muted-foreground uppercase tracking-wider mb-1">
                Ta prochaine étape
              </p>
              <h2 className="font-display text-xl text-foreground">{recommendation.title}</h2>
              <MarkdownText content={recommendation.explanation} className="text-sm text-muted-foreground mt-1.5 leading-relaxed" />

              <Button
                className="mt-4 rounded-xl bg-bordeaux hover:bg-primary text-white shadow-none hover:shadow-none"
                onClick={(e) => { e.stopPropagation(); handleNavigate(recommendation.ctaRoute); }}
              >
                {recommendation.ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <button
                className="block mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
                onClick={(e) => { e.stopPropagation(); setContentCoachingOpen(true); }}
              >
                🤔 Je sais pas quoi poster...
              </button>
            </div>
          </div>
        </div>

        {/* C. Mini-cards */}
        <div data-tour="card-mini-actions" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {MINI_CARDS.map((card) => (
            <div
              key={card.route}
              className={`rounded-2xl p-5 cursor-pointer border border-transparent hover:border-border hover:-translate-y-[2px] hover:shadow-[var(--shadow-bento)] transition-all duration-[250ms] ease-out ${card.bg}`}
              onClick={() => handleNavigate(card.route)}
            >
              <span className="text-2xl mb-3 block">{card.emoji}</span>
              <p className="font-body text-sm font-semibold text-foreground">{card.title}</p>
              <p className="font-body text-xs text-muted-foreground">{card.subtitle}</p>
            </div>
          ))}
        </div>

        {/* D. Collapsible missions */}
        <CollapsibleMissions onNavigate={handleNavigate} />

        {/* E. Coach Card */}
        <div
          data-tour="card-assistant"
          className="rounded-2xl p-5 bg-gradient-to-br from-rose-pale to-card border border-primary/15 hover:border-primary/30 hover:-translate-y-[2px] hover:shadow-[var(--shadow-bento)] transition-all duration-[250ms] ease-out cursor-pointer"
          onClick={() => handleNavigate("/dashboard/guide")}
          onMouseEnter={() => setCoachHovered(true)}
          onMouseLeave={() => setCoachHovered(false)}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-soft to-rose-medium/20 flex items-center justify-center shrink-0">
              <span className="text-lg">🧠</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-[15px] text-foreground">Ta coach de com'</p>
              <p className="text-xs text-muted-foreground">
                Pose-lui n'importe quelle question sur ta com', ta stratégie, tes contenus.
              </p>
            </div>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200 ${coachHovered ? "bg-bordeaux" : "bg-card"}`}>
              <ArrowRight className={`h-4 w-4 transition-colors duration-200 ${coachHovered ? "text-white" : "text-muted-foreground"}`} />
            </div>
          </div>
        </div>

        {/* Content Coaching Dialog */}
        <ContentCoachingDialog open={contentCoachingOpen} onOpenChange={setContentCoachingOpen} />

        {/* WelcomeOverlay + GuidedTour */}
        <WelcomeOverlay prenom={profileSummary.firstName} />

        {!tourDone && !isLoading && welcomeDone &&
          <GuidedTour
            steps={TOUR_STEPS}
            storageKey="lac_dashboard_tour_seen"
            onComplete={() => setTourDone(true)}
          />
        }
      </main>
    </div>
  );
}
