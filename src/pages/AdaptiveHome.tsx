import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, Clock } from "lucide-react";

import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useOnboardingMissions, OnboardingMission } from "@/hooks/use-onboarding-missions";
import SuggestedContents from "@/components/dashboard/SuggestedContents";
import WelcomeOverlay from "@/components/dashboard/WelcomeOverlay";
import GuidedTour from "@/components/GuidedTour";
import AppHeader from "@/components/AppHeader";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import Confetti from "@/components/Confetti";

/* ── Icon resolver ── */
function RecommendationIcon({ name }: { name: string }) {
  const iconMap: Record<string, string> = {
    BookOpen: "📖", Users: "👥", Layers: "📚", CalendarPlus: "📅",
    CalendarDays: "📅", BarChart3: "📊", Sparkles: "✨", PenLine: "✏️",
    Palette: "🎨", Search: "🔍", ClipboardCheck: "📋", LayoutGrid: "📱",
    Lightbulb: "💡",
  };
  return <span className="text-xl">{iconMap[name] || "📌"}</span>;
}

/* ── Chip ── */
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

/* ── Collapsible missions ── */
const COLLAPSED_KEY = "lac_missions_collapsed";
const FIRST_SEEN_KEY = "lac_missions_first_seen";

function CollapsibleMissions({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { missions, completedCount, allDone, nextMission, dismissed, dismiss, isLoading } = useOnboardingMissions();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(COLLAPSED_KEY) !== "false";
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

  if (allDone) {
    return (
      <div className="rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-5 shadow-sm">
        <Confetti />
        <p className="font-heading font-bold text-foreground">
          Bravo ! Tu as posé tes fondations 🎉
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Tu connais les bases de l'outil. Maintenant, explore librement.
        </p>
        <button onClick={dismiss} className="mt-3 text-sm font-medium text-primary hover:underline">
          Fermer →
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {/* Toggle header */}
      <button onClick={toggle} className="w-full flex items-center gap-3">
        <span className="text-base">🚀</span>
        <span className="font-heading text-sm font-bold text-foreground">Tes missions</span>
        <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
          {completedCount}/5
        </span>
        <Progress value={(completedCount / 5) * 100} className="h-1.5 flex-1 max-w-[80px]" />
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </button>

      {/* Mission list */}
      {!collapsed && (
        <div className="mt-4 space-y-2">
          {missions.map((mission) => (
            <MissionRow
              key={mission.id}
              mission={mission}
              isNext={nextMission?.id === mission.id}
              onClick={() => onNavigate(mission.route)}
            />
          ))}
        </div>
      )}
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
      {isNext && !isCompleted && (
        <span className="text-xs font-medium text-primary animate-pulse shrink-0 mt-1">
          Commencer →
        </span>
      )}
    </button>
  );
}

/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Ta prochaine étape", text: "L'outil analyse où tu en es et te recommande l'action qui aura le plus d'impact. Tu n'as qu'à suivre.", position: "bottom" as const },
  { target: "nav-branding", title: "Ta marque", text: "Tout ton branding est ici : positionnement, cible, ton, storytelling. C'est le socle de tout ce que l'outil génère pour toi.", position: "bottom" as const },
  { target: "nav-creer", title: "Créer du contenu", text: "Posts Instagram, carrousels, newsletters, posts LinkedIn : l'outil connaît ta marque et te propose des textes avec les bonnes structures.", position: "bottom" as const },
  { target: "card-assistant", title: "Ton coach com' IA", text: "Tu peux lui poser n'importe quelle question sur ta communication. Il connaît ton branding et te répond de façon personnalisée.", position: "top" as const },
  { target: "nav-mon-plan", title: "Ton plan de com' personnalisé", text: "C'est ici que tout se rejoint. Un parcours étape par étape, adapté à ton objectif et au temps que tu as.", position: "bottom" as const },
];

/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));
  const [welcomeDone, setWelcomeDone] = useState(() => localStorage.getItem("lac_welcome_seen") === "true");

  useEffect(() => {
    const check = () => setWelcomeDone(localStorage.getItem("lac_welcome_seen") === "true");
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
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
      <main className="max-w-[640px] mx-auto px-4 py-8 space-y-6">
        {/* A. Header */}
        <div>
          <h1 className="font-display text-2xl text-foreground">
            Salut {profileSummary.firstName} !
          </h1>
          <p className="text-muted-foreground mt-2">Ta prochaine étape :</p>
        </div>

        {/* B. Recommendation */}
        <Card data-tour="card-next-step" className="p-6 border-2 border-primary/20 bg-card rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <RecommendationIcon name={recommendation.icon} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-lg text-foreground">{recommendation.title}</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{recommendation.explanation}</p>
            </div>
          </div>
          <Button className="w-full mt-4 rounded-xl" onClick={() => handleNavigate(recommendation.ctaRoute)}>
            {recommendation.ctaLabel}
          </Button>
        </Card>

        {/* C. Alternatives */}
        <div className="flex flex-wrap gap-2">
          <p className="w-full text-xs text-muted-foreground mb-1">Tu veux faire autre chose ?</p>
          {recommendation.alternatives.map((alt) => (
            <Chip key={alt.route} onClick={() => handleNavigate(alt.route)}>
              {alt.icon && <RecommendationIcon name={alt.icon} />} {alt.title}
            </Chip>
          ))}
        </div>

        {/* D. Collapsible missions */}
        <CollapsibleMissions onNavigate={handleNavigate} />

        {/* E. Coach IA */}
        <Card
          data-tour="card-assistant"
          className="p-4 cursor-pointer transition bg-gradient-to-br from-primary/5 to-card rounded-2xl border border-primary/20 hover:border-primary/40"
          onClick={() => handleNavigate("/dashboard/guide")}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <span className="text-lg">🧠</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground">Ton coach com' IA</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pose-lui n'importe quelle question sur ta com', ta stratégie, tes contenus. Il connaît ta marque et s'adapte à toi.
              </p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </Card>

        {/* F. Suggested contents */}
        {profileSummary.brandingTotal >= 30 && <SuggestedContents />}

        {/* G. WelcomeOverlay + GuidedTour */}
        <WelcomeOverlay prenom={profileSummary.firstName} />

        {!tourDone && !isLoading && welcomeDone && (
          <GuidedTour
            steps={TOUR_STEPS}
            storageKey="lac_dashboard_tour_seen"
            onComplete={() => setTourDone(true)}
          />
        )}
      </main>
    </div>
  );
}
