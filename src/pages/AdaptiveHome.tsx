import { useState, useEffect } from "react";
import CalendarCoachingDialog from "@/components/calendar/CalendarCoachingDialog";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Clock, Globe, Instagram, Lightbulb } from "lucide-react";

import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useOnboardingMissions, OnboardingMission } from "@/hooks/use-onboarding-missions";

import WelcomeOverlay from "@/components/dashboard/WelcomeOverlay";
import GuidedTour from "@/components/GuidedTour";
import AppHeader from "@/components/AppHeader";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { isAurianaDemoEmail, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";
import { saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";

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
  { target: "card-ideas", title: "Tes idées sauvegardées", text: "Toutes les idées que tu mets de côté atterrissent ici. Tu peux les transformer en contenu en un clic.", position: "left" as const },
  { target: "card-mini-actions", title: "Tes raccourcis", text: "Ton branding, tes audits, ta routine d'engagement, ton calendrier : tout est accessible en un clic depuis ces cartes.", position: "bottom" as const },
  { target: "nav-creer", title: "Créer", text: "C'est ici que tu génères tes contenus : posts, carrousels, newsletters, Reels. L'IA connaît ton branding et écrit avec ta voix.", position: "bottom" as const },
  { target: "nav-calendrier", title: "Organiser", text: "Ton calendrier éditorial. Tu planifies tes contenus, tu vois ta semaine d'un coup d'œil, et tu sais toujours quoi poster.", position: "bottom" as const },
  { target: "card-missions", title: "Tes premières missions", text: "5 petites étapes pour bien démarrer. Avance à ton rythme, coche au fur et à mesure. Rien d'obligatoire, tout est utile.", position: "top" as const },
  { target: "card-assistant", title: "Ta coach de com'", text: "Un doute, une question, besoin d'un coup de pouce ? Elle connaît ton projet et te répond de façon personnalisée.", position: "top" as const },
];

/* ── Mini-cards data ── */
const MINI_CARDS = [
  { emoji: "🎨", title: "Mon identité", subtitle: "Affiner mon image de marque", bg: "bg-accent/10", route: "/branding" },
  { emoji: "🔍", title: "Lancer un audit", subtitle: "Instagram ou site web", bg: "bg-[hsl(var(--bento-blue))]", route: "__choose_audit__" },
  { emoji: "✨", title: "Planifier ma semaine", subtitle: "Planning IA personnalisé", bg: "bg-rose-pale", route: "__plan_week__" },
  { emoji: "📅", title: "Mon calendrier", subtitle: "Planifier mes contenus", bg: "bg-accent/10", route: "/calendrier" },
];

/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));
  const [welcomeDone, setWelcomeDone] = useState(() => localStorage.getItem("lac_welcome_seen") === "true");
  const [contentCoachingOpen, setContentCoachingOpen] = useState(false);
  const [planWeekOpen, setPlanWeekOpen] = useState(false);
  const [auditPickerOpen, setAuditPickerOpen] = useState(false);
  const [coachHovered, setCoachHovered] = useState(false);

  // Ideas count — pour la card "Idées sauvegardées" en colonne droite
  const workspaceId = activeWorkspace?.id ?? null;
  const { data: ideaCount = 0 } = useQuery<number>({
    queryKey: ["adaptive-home-ideas-count", user?.id, workspaceId],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("saved_ideas")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId ?? user.id);
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

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
      const timer1 = setTimeout(invalidateAll, 8000);
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
    const fallback = setTimeout(() => setWelcomeDone(true), 2000);
    return () => { clearInterval(interval); clearTimeout(fallback); };
  }, []);

  const handleNavigate = (route: string) => {
    if (route === "__plan_week__") {
      setPlanWeekOpen(true);
      return;
    }
    if (route === "__choose_audit__") {
      setAuditPickerOpen(true);
      return;
    }
    if (route === "/creer" && profileSummary.brandingTotal < 50) {
      toast({ title: "Tes contenus seront plus personnalisés une fois que tu auras posé tes bases 💡" });
    }
    navigate(route);
  };

  const handleAuditChoice = (route: "/instagram/audit" | "/site/audit") => {
    setAuditPickerOpen(false);
    navigate(route);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-[1100px] mx-auto px-4 py-12">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 bg-muted rounded-lg" />
            <div className="h-4 w-64 bg-muted rounded" />
            <div className="h-40 bg-muted rounded-2xl mt-6" />
          </div>
        </main>
      </div>
    );
  }

  /* ─── Hero block (col gauche) ─── */
  const heroBlock = (
    <div
      data-tour="card-next-step"
      className="group rounded-2xl bg-gradient-to-br from-rose-pale/40 to-card border border-border/60 p-6 sm:p-8 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px] hover:border-border transition-all duration-[300ms] ease-out cursor-pointer"
      onClick={() => handleNavigate("/creer")}
    >
      <p className="font-mono-ui text-[10.5px] text-foreground/60 uppercase tracking-[0.12em] font-semibold mb-3">
        ✨ On crée quoi aujourd'hui&nbsp;?
      </p>

      <h2 className="font-display text-[26px] sm:text-3xl leading-[1.15] text-foreground">
        Ton prochain contenu
      </h2>

      <p className="text-[15px] text-foreground/70 mt-2 leading-relaxed line-clamp-1">
        {recommendation.explanation}
      </p>

      <Button
        className="mt-6 w-full sm:w-auto h-12 px-6 rounded-xl bg-bordeaux hover:bg-primary text-white text-[15px] font-semibold shadow-sm hover:shadow-md transition-all"
        onClick={(e) => { e.stopPropagation(); handleNavigate("/creer"); }}
      >
        Créer un contenu
        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Button>

      <div className="flex flex-wrap gap-2 mt-4">
        {[
          { label: "Post Instagram", route: "/creer" },
          { label: "Carousel", route: "/creer?format=carousel" },
          { label: "Reel", route: "/creer?format=reel" },
          { label: "Post LinkedIn", route: "/creer?canal=linkedin" },
          { label: "Article de blog", route: "/site/accueil" },
        ].map((item) => (
          <button
            key={item.route + item.label}
            onClick={(e) => { e.stopPropagation(); handleNavigate(item.route); }}
            className="text-xs font-medium px-3.5 py-2 rounded-xl
              bg-card/80 border border-primary/15 text-foreground
              hover:bg-primary hover:text-primary-foreground hover:border-primary
              transition-all duration-150"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6 mb-3 h-px bg-border/60" />

      <button
        className="text-xs text-muted-foreground hover:text-primary transition-colors"
        onClick={(e) => { e.stopPropagation(); setContentCoachingOpen(true); }}
      >
        Pas d'idée&nbsp;? Discutes-en avec ta coach →
      </button>

      {isAurianaDemoEmail(user?.email) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            clearFlowState();
            saveFlowState({ ...AURIANA_DEMO_FLOW, ts: Date.now() });
            navigate("/creer", { state: { demo: true, demoScenario: "auriana-carousel" } });
          }}
          className="mt-3 ml-3 inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 bg-card/80 border border-border text-foreground/70 rounded-lg hover:border-primary/40 hover:text-primary transition-all"
        >
          🎬 Lancer la démo carrousel
        </button>
      )}
    </div>
  );

  /* ─── Outils 2x2 (col gauche, sous le hero) ─── */
  const toolsGrid = (
    <div data-tour="card-mini-actions" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
  );

  /* ─── Card Idées sauvegardées (col droite) ─── */
  const ideasCard = (
    <button
      data-tour="card-ideas"
      onClick={() => navigate("/idees")}
      className="group w-full text-left rounded-2xl bg-card border border-border/60 p-6 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[2px] hover:border-primary/30 transition-all duration-[250ms] ease-out"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono-ui text-[10px] text-foreground/60 uppercase tracking-[0.18em] font-semibold">
          Inspiration
        </span>
        <span className="font-display italic text-bordeaux text-2xl leading-none">
          {ideaCount}
        </span>
      </div>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-pale flex items-center justify-center shrink-0">
          <Lightbulb className="h-5 w-5 text-bordeaux" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[17px] text-foreground leading-tight">
            Idées sauvegardées
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {ideaCount > 0
              ? "Retrouve tes pépites et transforme-les en posts."
              : "Aucune idée encore — lance un brainstorm avec ta coach."}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-bordeaux group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
      </div>
    </button>
  );

  /* ─── Coach card (col droite) ─── */
  const coachCard = (
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
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">

        {/* A. Greeting */}
        <div>
          <h1 className="font-display text-[28px] text-foreground leading-tight">
            Salut {profileSummary.firstName} ! 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-[15px]">
            Prête à faire rayonner tes projets ?
          </p>
        </div>

        {/* Magazine layout : 2 colonnes asymétriques à partir de lg */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Colonne gauche : hero + outils */}
          <div className="lg:col-span-8 space-y-6">
            {heroBlock}
            {toolsGrid}
          </div>

          {/* Colonne droite : idées + missions + coach */}
          <div className="lg:col-span-4 space-y-4">
            {ideasCard}
            <CollapsibleMissions onNavigate={handleNavigate} />
            {coachCard}
          </div>

        </div>

        {/* Dialogs */}
        <ContentCoachingDialog open={contentCoachingOpen} onOpenChange={setContentCoachingOpen} />
        <CalendarCoachingDialog open={planWeekOpen} onOpenChange={setPlanWeekOpen} />
        <Dialog open={auditPickerOpen} onOpenChange={setAuditPickerOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Quel audit veux-tu lancer&nbsp;?</DialogTitle>
              <DialogDescription>
                Choisis l'espace que tu veux analyser maintenant.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleAuditChoice("/instagram/audit")}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/60 text-foreground">
                  <Instagram className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">Audit Instagram</span>
                  <span className="block text-xs text-muted-foreground">
                    Bio, feed, highlights et points d'amélioration.
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={() => handleAuditChoice("/site/audit")}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/60 text-foreground">
                  <Globe className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">Audit site web</span>
                  <span className="block text-xs text-muted-foreground">
                    Conversion, lisibilité et clarté des pages.
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </DialogContent>
        </Dialog>

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
