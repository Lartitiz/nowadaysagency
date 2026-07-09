import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Instagram,
  Linkedin,
  Mail,
  Pin,
  Lightbulb,
  MessageCircle,
  Rocket,
  Recycle as RecycleIcon,
  Upload,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useOnboardingMissions, OnboardingMission } from "@/hooks/use-onboarding-missions";

import WeekStrip, { type WeekPost } from "@/components/dashboard/WeekStrip";
import GuidedTour from "@/components/GuidedTour";
import AppHeader from "@/components/AppHeader";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import { isAurianaDemoEmail, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";
import { weeklyIdeas } from "@/lib/weekly-ideas";
import RecycleDialog from "@/components/dashboard/RecycleDialog";
import { saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { toLocalDateStr } from "@/lib/utils";

/* ── Collapsible missions ── */
const COLLAPSED_KEY = "lac_missions_collapsed";
const FIRST_SEEN_KEY = "lac_missions_first_seen";

function OnboardingBanner({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { missions, completedCount, allDone, nextMission, dismissed, isLoading } = useOnboardingMissions();

  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    // Replié par défaut : le bandeau ne doit jamais repousser « Créer un contenu »
    // sous la ligne de flottaison. Replié, il reste guidant via la prochaine étape.
    if (stored === null) return true;
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

  const total = missions.length;
  const remaining = total - completedCount;
  const counterLabel = remaining === 1 ? `${completedCount}/${total} — plus qu'une !` : `${completedCount}/${total}`;

  return (
    <div
      data-tour="card-missions"
      className="rounded-2xl border border-border/70 bg-rose-pale/70 p-3 sm:p-4"
    >
      <button onClick={toggle} className="w-full flex items-center gap-3">
        <Rocket className="h-4 w-4 text-bordeaux/80 shrink-0" />
        <span className="font-heading text-sm font-bold text-foreground shrink-0">
          Tes premiers pas
        </span>
        <Progress value={(completedCount / total) * 100} className="h-1.5 flex-1" />
        <span className="text-xs font-medium text-foreground/80 shrink-0">
          {counterLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-foreground/60 transition-transform shrink-0 ${collapsed ? "" : "rotate-180"}`}
        />
      </button>

      {/* Replié : une seule action guidée (la prochaine étape) au lieu d'un mur de 6 cartes */}
      {collapsed && nextMission && (
        <button
          onClick={() => onNavigate(nextMission.route)}
          className="mt-3 w-full text-left rounded-xl border border-primary/40 bg-card p-3 flex items-center gap-3 hover:border-primary transition-colors"
        >
          <span className="text-lg shrink-0">{nextMission.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-mono-ui text-2xs uppercase tracking-[0.14em] text-foreground/70 font-semibold">
              Prochaine étape
            </p>
            <p className="text-sm font-semibold text-foreground truncate">{nextMission.title}</p>
          </div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Clock className="h-3 w-3" />
            {nextMission.time}
          </span>
          <span className="text-xs font-medium text-primary shrink-0 hidden sm:inline">Commencer →</span>
        </button>
      )}

      {!collapsed && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
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
          ? "border-success/30 bg-success-bg/50 opacity-70"
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

/* ── Section label ── */
function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <p className="mb-3 flex items-baseline gap-2">
      <span className="font-mono-ui text-2xs uppercase tracking-[0.18em] text-foreground/70 font-semibold">
        {children}
      </span>
      {hint && (
        <span className="text-2xs text-muted-foreground font-body normal-case tracking-normal">
          {hint}
        </span>
      )}
    </p>
  );
}

/* ── Raccourci « Piloter » : pill compacte — la version ligne éditoriale
      (titre + description) repoussait le dashboard à deux écrans ── */
function PilotPill({
  icon: Icon,
  label,
  count,
  onClick,
  dataTour,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  onClick: () => void;
  dataTour?: string;
}) {
  return (
    <button
      data-tour={dataTour}
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border text-sm text-foreground hover:border-bordeaux/40 hover:text-bordeaux transition-colors"
    >
      <Icon className="h-4 w-4 text-bordeaux/70 shrink-0" strokeWidth={1.75} />
      {label}
      {count != null && count > 0 && (
        <span className="font-mono-ui text-2xs font-semibold text-bordeaux bg-rose-soft rounded-full px-1.5 py-px">
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Ta prochaine étape", text: "Chaque jour, l'outil te recommande l'action qui aura le plus d'impact. Pas besoin de réfléchir par où commencer : c'est ici.", position: "bottom" as const },
  { target: "card-ideas", title: "Tes idées sauvegardées", text: "Toutes les idées que tu mets de côté atterrissent ici. Tu peux les transformer en contenu en un clic.", position: "top" as const },
  { target: "card-missions", title: "Tes premiers pas", text: "Quelques petites étapes pour bien démarrer. Avance à ton rythme, coche au fur et à mesure. Rien d'obligatoire, tout est utile.", position: "bottom" as const },
  { target: "card-assistant", title: "Ta coach de com'", text: "Un doute, une question, besoin d'un coup de pouce ? Elle connaît ton projet et te répond de façon personnalisée.", position: "bottom" as const },
];

/* ── Channel pills → raccourcis création par canal ── */
const CHANNEL_PILLS = [
  { label: "Instagram", icon: Instagram, canal: "instagram" },
  { label: "LinkedIn", icon: Linkedin, canal: "linkedin" },
  { label: "Newsletter", icon: Mail, canal: "newsletter" },
  { label: "Pinterest", icon: Pin, canal: "pinterest" },
];

/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeWorkspace, activeRole } = useWorkspace();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));
  const [recycleOpen, setRecycleOpen] = useState(false);

  // Ideas count
  const workspaceId = activeWorkspace?.id ?? null;
  const wsFilter = useWorkspaceFilter();
  // Les erreurs de chargement remontent (isError) au lieu d'être maquillées en
  // données vides : un réseau qui tombe ne doit pas afficher « 0 idée » sans rien dire.
  const { data: ideaCount = 0, isError: ideasError } = useQuery<number>({
    queryKey: ["adaptive-home-ideas-count", user?.id, workspaceId],
    queryFn: async () => {
      if (!user) return 0;
      const filterCol = workspaceId ? "workspace_id" : "user_id";
      const filterVal = workspaceId ?? user.id;
      const { count, error } = await supabase
        .from("saved_ideas")
        .select("*", { count: "exact", head: true })
        .eq(filterCol, filterVal);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // Photos : compteur de la pill « Mes photos » (accès direct à la bibliothèque).
  // La bibliothèque est toujours cloisonnée par workspace_id (cf. useUserPhotos).
  const { data: photoCount = 0 } = useQuery<number>({
    queryKey: ["adaptive-home-photos-count", user?.id, workspaceId],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("user_photos")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId ?? user.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // Contenus à venir : assez pour remplir la bande semaine + connaître le
  // prochain contenu même s'il tombe après les 7 jours affichés.
  const { data: upcomingPosts = [], isLoading: upcomingLoading, isError: postsError } = useQuery<WeekPost[]>({
    queryKey: ["adaptive-home-upcoming-posts-week", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      const todayStr = toLocalDateStr(new Date());
      const { data, error } = await (supabase as any)
        .from("calendar_posts")
        .select("date, theme, format, canal, status")
        .eq(wsFilter.column, wsFilter.value)
        .gte("date", todayStr)
        .neq("status", "idea")
        .order("date", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as WeekPost[];
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

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

  const handleNavigate = (route: string) => {
    if (route === "/creer" && profileSummary.brandingTotal < 50) {
      toast("Tes contenus seront plus personnalisés une fois que tu auras posé tes bases 💡");
    }
    navigate(route);
  };

  // ── Hero : « adapter tôt, stabiliser après » ──
  // Tant que l'onboarding n'est pas terminé, le hero suit la recommandation
  // (ex. « Termine ton diagnostic » → /onboarding) pour guider la mise en route.
  // Une fois lancée, l'action centrale reste stablement « Créer un contenu » :
  // on ne laisse jamais le bouton principal du dashboard bouger d'un jour à l'autre.
  const cleanText = (s: string) => s.replace(/&nbsp;/g, " ");
  const launched = profileSummary.onboardingComplete;
  const hero = launched
    ? {
        eyebrow: "✨ On crée quoi aujourd'hui ?",
        title: "Créer mon prochain contenu",
        ctaLabel: "Créer un contenu",
        route: "/creer",
        showChannels: true,
      }
    : {
        eyebrow: "👉 Ta prochaine étape",
        title: cleanText(recommendation.title),
        ctaLabel: cleanText(recommendation.ctaLabel).replace(/\s*→\s*$/, ""),
        route: recommendation.ctaRoute,
        showChannels: false,
      };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-[720px] mx-auto px-4 py-12">
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
      <main className="max-w-[720px] mx-auto px-4 py-8 space-y-7">

        {/* Erreur de chargement visible (pattern /profil) : sans ce bandeau, un
            réseau qui tombe affiche un dashboard « normal » à zéro, sans indice. */}
        {(ideasError || postsError) && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              Impossible de charger certaines de tes données — ce que tu vois peut être incomplet.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full shrink-0"
              onClick={() => queryClient.invalidateQueries()}
            >
              Réessayer
            </Button>
          </div>
        )}

        {/* Bandeau premiers pas — owner uniquement : les missions guident le
            setup de SON espace. Un·e manager sur l'espace d'une cliente ne doit
            pas voir « Tes premiers pas » (audit workspace/membres 09/07). */}
        {activeRole === "owner" && <OnboardingBanner onNavigate={handleNavigate} />}

        {/* Greeting + pastille coach — sans sous-titre : chaque ligne doit
            gagner sa place pour que la page tienne dans une fenêtre */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-3xl sm:text-4xl text-foreground leading-tight">
            Salut {profileSummary.firstName} ! 👋
          </h1>

          <button
            data-tour="card-assistant"
            aria-label="Parler à ma coach de com'"
            onClick={() => handleNavigate("/dashboard/guide")}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Parler à ma coach</span>
          </button>
        </div>

        {/* Hero — bordeaux foncé : seule tache sombre de la page, impossible à
            rater sur le fond grège (le rose pâle d'avant se fondait dedans) */}
        <div
          data-tour="card-next-step"
          className="group rounded-3xl bg-[hsl(var(--bento-dark))] p-6 sm:p-7 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] transition-shadow duration-[300ms] ease-out cursor-pointer"
          onClick={() => handleNavigate(hero.route)}
        >
          <p className="font-mono-ui text-2xs text-rose-soft/90 uppercase tracking-[0.14em] font-semibold mb-3">
            {hero.eyebrow}
          </p>

          <h2 className="font-display text-[26px] sm:text-[28px] leading-[1.15] text-white">
            {hero.title}
          </h2>

          {/* L'explication ne s'affiche que pendant la mise en route : une fois
              lancée, « Créer un contenu » se passe de justification — chaque
              ligne du hero repousse le reste sous la ligne de flottaison. */}
          {!launched && (
            <p className="text-base text-white/70 mt-3 leading-relaxed line-clamp-2">
              {cleanText(recommendation.explanation)}
            </p>
          )}

          {/* Pills canaux + CTA sur une même ligne (le CTA à droite) */}
          <div className="flex flex-wrap items-center gap-2 mt-5">
            {hero.showChannels &&
              CHANNEL_PILLS.map(({ label, icon: Icon, canal }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={`Créer un contenu ${label}`}
                  onClick={(e) => { e.stopPropagation(); navigate(`/creer?canal=${canal}`); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent border border-white/25 text-xs text-white/80 hover:bg-white hover:text-bordeaux hover:border-white transition-colors"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}

            <Button
              className="w-full sm:w-auto sm:ml-auto h-11 px-6 rounded-full bg-white hover:bg-rose-pale text-bordeaux text-base font-semibold shadow-sm hover:shadow-md transition-all"
              onClick={(e) => { e.stopPropagation(); handleNavigate(hero.route); }}
            >
              {hero.ctaLabel}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>

          {isAurianaDemoEmail(user?.email) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFlowState();
                saveFlowState({ ...AURIANA_DEMO_FLOW, ts: Date.now() });
                navigate("/creer", { state: { demo: true, demoScenario: "auriana-carousel" } });
              }}
              className="mt-3 ml-3 inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 bg-transparent border border-white/25 text-white/70 rounded-lg hover:border-white/60 hover:text-white transition-all"
            >
              🎬 Lancer la démo carrousel
            </button>
          )}
        </div>

        {/* Zone Cette semaine — la bande semaine EST le calendrier : ce qui est
            prévu (réseau + format) et ce qui est libre, lisible en une seconde */}
        <section>
          <SectionLabel hint="ce qui est prévu, ce qui est libre">Cette semaine</SectionLabel>
          <WeekStrip posts={upcomingPosts} isLoading={upcomingLoading} />
        </section>

        {/* Zone Idées de la semaine — le rendez-vous du rituel hebdo, dans l'app
            et plus seulement dans l'e-mail (V2 rétention). Même rotation
            déterministe que l'e-mail (weekly-ideas.ts ↔ email-trigger) : on
            n'en AFFICHE que 3 sur 5 pour tenir dans une fenêtre, la rotation
            et l'e-mail ne changent pas. */}
        <section>
          <SectionLabel hint="le rendez-vous de ton rituel — un clic et on la rédige ensemble">
            Tes idées de la semaine
          </SectionLabel>
          <div className="divide-y divide-border/70">
            {weeklyIdeas().slice(0, 3).map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => navigate(`/creer?sujet=${encodeURIComponent(idea)}`)}
                className="group flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/30"
              >
                <Lightbulb className="h-4 w-4 shrink-0 text-bordeaux/60" />
                <span className="flex-1 text-sm text-foreground">{idea}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-bordeaux" />
              </button>
            ))}
          </div>
        </section>

        {/* Zone Piloter — pills compactes. La section « Approfondir » (identité
            de marque, audits) a été retirée du dashboard (validé Laetitia 05/07) :
            ces entrées existent déjà dans la sidebar et les pages réseaux, et le
            branding arrive désormais quasi complet dès l'onboarding. */}
        <section>
          <SectionLabel hint="ton quotidien">Piloter</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <PilotPill
              dataTour="card-ideas"
              icon={Lightbulb}
              label="Mes idées"
              count={ideaCount}
              onClick={() => navigate("/idees")}
            />
            <PilotPill
              icon={ImageIcon}
              label="Mes photos"
              count={photoCount}
              onClick={() => navigate("/photos")}
            />
            <PilotPill
              icon={Upload}
              label="Programmer un contenu prêt"
              onClick={() => navigate("/calendrier?import=1")}
            />
            <PilotPill
              icon={RecycleIcon}
              label="Recycler un post qui a marché"
              onClick={() => setRecycleOpen(true)}
            />
          </div>
        </section>

        {/* Recyclage intelligent : les meilleurs posts passés, prêts à ré-angler */}
        <RecycleDialog open={recycleOpen} onOpenChange={setRecycleOpen} />

        {/* Guidage 1re visite : UNIQUEMENT le coachmark GuidedTour. L'overlay
            4 slides « ton espace est prêt » a été retiré (validé Laetitia 04/07) :
            c'était le 3e récapitulatif d'affilée après le diagnostic et le welcome. */}
        {!tourDone && !isLoading && activeRole === "owner" &&
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
