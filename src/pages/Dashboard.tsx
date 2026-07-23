import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useUserPhase } from "@/hooks/use-user-phase";
import { X, ArrowLeft, Lightbulb, Image as ImageIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/contexts/SessionContext";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { useStorytellingList, usePersona } from "@/hooks/use-branding";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import ClientOnboarding from "@/components/client/ClientOnboarding";

import { Progress } from "@/components/ui/progress";
import { useUserPlan } from "@/hooks/use-user-plan";
import { Sparkles } from "lucide-react";
import FirstTimeTooltip from "@/components/FirstTimeTooltip";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { useActiveChannels, ALL_CHANNELS } from "@/hooks/use-active-channels";
import { computePlan, type PlanData } from "@/lib/plan-engine";
import BentoGrid from "@/components/dashboard/BentoGrid";
import BentoCard from "@/components/dashboard/BentoCard";
import SpaceBentoCard from "@/components/dashboard/SpaceBentoCard";
import { spaceModules } from "@/config/dashboardModules";
import BadgesWidget from "@/components/dashboard/BadgesWidget";
import WeekCalendarWidget from "@/components/dashboard/WeekCalendarWidget";
import PlanWeekWidget from "@/components/dashboard/PlanWeekWidget";
import MonthlyStatsWidget from "@/components/dashboard/MonthlyStatsWidget";
import LaetitiaCoachingCard from "@/components/dashboard/LaetitiaCoachingCard";
import DiscoveryCoachingCard from "@/components/dashboard/DiscoveryCoachingCard";
import { checkBadges } from "@/lib/badges";
import { trackError } from "@/lib/error-tracker";
import OnboardingMissions from "@/components/dashboard/OnboardingMissions";
import { isAurianaDemoEmail, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";
import { saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";

import SessionFocusWidget from "@/components/dashboard/SessionFocusWidget";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import { DashboardViewToggle } from "@/components/dashboard/DashboardViewToggle";
import { isModuleVisible, isModuleHidden } from "@/config/feature-flags";

/* ── Types ── */
export interface UserProfile {
  prenom: string;
  activite: string;
  type_activite: string;
  cible: string;
  probleme_principal: string;
  piliers: string[];
  tons: string[];
  plan_start_date: string | null;
  mission?: string;
  offre?: string;
  croyances_limitantes?: string;
  verbatims?: string;
  expressions_cles?: string;
  ce_quon_evite?: string;
  style_communication?: string[];
  canaux?: string[];
}

interface DashboardData {
  brandingCompletion: BrandingCompletion;
  igAuditScore: number | null;
  liAuditScore: number | null;
  contactCount: number;
  prospectCount: number;
  prospectConversation: number;
  prospectOffered: number;
  calendarPostCount: number;
  weekPostsPublished: number;
  weekPostsTotal: number;
  nextPost: { date: string; theme: string } | null;
  planData: PlanData | null;
  recommendations: { id: string; titre: string | null; route: string; completed: boolean | null }[];
  ideaCount: number;
  photoCount: number;
}

/* ── Welcome messages ── */
const WELCOME_MESSAGES = [
  "on avance sur quoi aujourd'hui ?",
  "prête à créer du contenu qui claque ?",
  "ta com' t'attend, et elle va être belle.",
  "allez, on s'y met ?",
  "qu'est-ce qu'on construit aujourd'hui ?",
];

function getWelcomeMessage(): string {
  const idx = new Date().getDate() % WELCOME_MESSAGES.length;
  return WELCOME_MESSAGES[idx];
}

const BANNER_DISMISSED_KEY = "lac_full_tools_banner_dismissed";

function GuideBanner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fromGuide = searchParams.get("from") === "guide";
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(BANNER_DISMISSED_KEY) === "1"; } catch { return false; }
  });

  if (!fromGuide || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(BANNER_DISMISSED_KEY, "1"); } catch {}
  };

  return (
    <div className="flex items-center gap-3 bg-muted/40 border border-border/40 rounded-xl px-4 py-3 mb-4">
      <p className="flex-1 text-sm text-muted-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        C'est ici que tu retrouves tous les modules. Ton assistant reste disponible depuis le menu.
      </p>
      <button
        onClick={() => navigate("/dashboard")}
        className="text-xs text-primary hover:underline whitespace-nowrap flex items-center gap-1"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        <ArrowLeft className="h-3 w-3" />
        Retour à mon assistant
      </button>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground p-1" aria-label="Fermer">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const PHASE_CONFIG = {
  construction: { emoji: "🌱", label: "Je pose mes bases", className: "bg-success-bg text-success" },
  action: { emoji: "🚀", label: "Je passe à l’action", className: "bg-warning-bg text-warning" },
  pilotage: { emoji: "⭐", label: "Je pilote", className: "bg-pink-100 text-pink-700" },
} as const;

function PhaseBadge() {
  const { phase, isLoading } = useUserPhase();
  if (isLoading) return <div />;
  const cfg = PHASE_CONFIG[phase];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-medium cursor-default ${cfg.className}`}
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {cfg.emoji} {cfg.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-xs">
          Ton outil s'adapte à ton niveau. Plus tu avances, plus de fonctionnalités apparaissent.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const navigate = useNavigate();
  const { isBinome } = useUserPlan();
  const { column, value } = useWorkspaceFilter();
  const { activeWorkspace, activeRole } = useWorkspace();
  const { hasInstagram, hasLinkedin, hasWebsite, hasSeo, loading: channelsLoading, channels } = useActiveChannels();
  const queryClient = useQueryClient();

  const isClientWorkspace = !!activeWorkspace && activeRole === "manager";
  const [contentCoachingOpen, setContentCoachingOpen] = useState(false);

  const { startSession, isActive: sessionActive } = useSession();

  const welcomeMessage = useMemo(() => getWelcomeMessage(), []);
  // ── Profile query ──
  const { data: profileRaw, isError: profileError } = useProfile();
  const { data: brandProfileRaw } = useBrandProfile();
  const { data: storytellingListHook } = useStorytellingList();
  const { data: personaHook } = usePersona();
  const hasBrandProfile = !!brandProfileRaw;
  const profile = useMemo<UserProfile | null>(() => {
    if (isDemoMode && demoData) {
      return {
        prenom: demoData.profile.first_name,
        activite: demoData.profile.activity,
        type_activite: demoData.profile.activity_type,
        cible: demoData.persona.metier,
        probleme_principal: demoData.persona.frustrations,
        piliers: demoData.branding.editorial.pillars.map(p => p.name),
        tons: demoData.branding.tone.keywords as unknown as string[],
        plan_start_date: null,
      };
    }
    return (profileRaw as UserProfile | null) ?? null;
  }, [profileRaw, isDemoMode, demoData]);

  // Un squelette ne doit JAMAIS être un état FINAL.
  // Le profil peut ne jamais arriver SANS qu'aucune erreur ne soit levée :
  // `useProfile` est `enabled: !!value`, et `value` (l'id résolu via le
  // workspace) reste vide quand les requêtes échouent → la query n'est même pas
  // lancée, donc `isError` reste faux et on restait sur le squelette
  // indéfiniment. `profileError` seul ne suffisait donc pas.
  // On borne l'attente, comme les fetch de #637. Trouvé par `ecran-fige-sonde`.
  const [profilIntrouvable, setProfilIntrouvable] = useState(false);
  useEffect(() => {
    if (profile) {
      setProfilIntrouvable(false);
      return;
    }
    const t = setTimeout(() => setProfilIntrouvable(true), 12_000);
    return () => clearTimeout(t);
  }, [profile]);

  const defaultDashData: DashboardData = {
    brandingCompletion: { storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, offers: 0, charter: 0, total: 0 },
    igAuditScore: null, liAuditScore: null,
    contactCount: 0, prospectCount: 0, prospectConversation: 0, prospectOffered: 0,
    calendarPostCount: 0, weekPostsPublished: 0, weekPostsTotal: 0, nextPost: null,
    planData: null, recommendations: [],
    ideaCount: 0,
    photoCount: 0,
  };

  // ── Dashboard data query ──
  // isError remonte au bandeau : un 500 ne doit pas afficher un dashboard « normal » à zéro.
  const { data: dashData = defaultDashData, isError: dashError } = useQuery<DashboardData>({
    queryKey: ["dashboard-data", user?.id, column, value, isDemoMode],
    queryFn: async () => {
      if (isDemoMode && demoData) {
        return {
          ...defaultDashData,
          brandingCompletion: { storytelling: 20, persona: 20, proposition: 20, tone: 15, strategy: 10, offers: 0, charter: 0, total: demoData.branding.completion },
          igAuditScore: demoData.audit.score,
          calendarPostCount: demoData.calendar_posts.length,
          weekPostsTotal: 3,
          weekPostsPublished: 1,
          contactCount: demoData.contacts.length,
          prospectCount: demoData.contacts.filter(c => c.type === "prospect").length,
          ideaCount: demoData.saved_ideas?.length || 0,
          recommendations: [
            { id: "demo-rec-1", titre: "Optimise ta bio Instagram", route: "/instagram/profil/bio", completed: false },
            { id: "demo-rec-2", titre: "Crée un calendrier de publication régulier", route: "/calendrier", completed: false },
            { id: "demo-rec-3", titre: "Ajoute des CTA dans tes légendes", route: "/creer", completed: false },
          ],
        };
      }
      if (!user) return defaultDashData;

      const wsId = activeWorkspace?.id || null;

      const [summaryRes, brandingData, ideasCountRes, photosCountRes] = await Promise.all([
        supabase.rpc("get_dashboard_summary", {
          p_user_id: user.id,
          p_workspace_id: wsId,
        } as any),
        fetchBrandingData({ column, value }),
        supabase.from("saved_ideas").select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("workspace_id", wsId ?? user.id),
        supabase.from("user_photos").select("*", { count: "exact", head: true })
          .eq("workspace_id", wsId ?? user.id),
      ]);

      if (summaryRes.error) throw summaryRes.error;

      const s = (summaryRes.data as any) || {};
      const bc = calculateBrandingCompletion(brandingData);

      const config = {
        weekly_time: s.plan_config?.weekly_time?.toString() || "2_5h",
        channels: (s.plan_config?.channels as string[]) || ["instagram"],
        main_goal: s.plan_config?.main_goal || "visibility",
      };
      let planData: PlanData | null = null;
      try { planData = await computePlan({ column, value }, config); } catch (e) { trackError(e, { page: "Dashboard", action: "computePlan" }); }

      // Check badges on load
      checkBadges({ column, value }, user.id, bc.total);

      return {
        brandingCompletion: bc,
        igAuditScore: s.ig_audit_score ?? null,
        liAuditScore: s.li_audit_score ?? null,
        contactCount: s.contact_count ?? 0,
        prospectCount: s.prospect_count ?? 0,
        prospectConversation: s.prospect_conversation ?? 0,
        prospectOffered: s.prospect_offered ?? 0,
        calendarPostCount: s.calendar_post_count ?? 0,
        weekPostsTotal: s.week_posts_total ?? 0,
        weekPostsPublished: s.week_posts_published ?? 0,
        nextPost: s.next_post ? { date: s.next_post.date, theme: s.next_post.theme } : null,
        planData,
        recommendations: s.recommendations || [],
        ideaCount: ideasCountRes.count ?? 0,
        photoCount: photosCountRes.count ?? 0,
      };
    },
    enabled: !!user || isDemoMode,
    staleTime: 2 * 60 * 1000, // 2 min cache
    retry: 1,
  });

  // ── Coaching month query ──
  const { data: coachingMonth = null } = useQuery<number | null>({
    queryKey: ["coaching-month", user?.id],
    queryFn: async () => {
      if (isDemoMode && demoData?.coaching) return demoData.coaching.current_month;
      if (!user) return null;
      const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
        .select("current_month")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return prog?.current_month ?? null;
    },
    enabled: (!!user && isBinome) || (isDemoMode && !!demoData?.coaching),
  });

  const comingSoonChannels = useMemo(() => ALL_CHANNELS.filter(c => c.comingSoon && channels.includes(c.id)), [channels]);

  // ── Client workspace empty detection ──
  const skippedOnboarding = isClientWorkspace && typeof window !== "undefined" && localStorage.getItem(`onboarding_skipped_${activeWorkspace?.id}`) === "true";
  const { data: clientHasData } = useQuery({
    queryKey: ["client-has-data", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return true;
      const storyCount = Array.isArray(storytellingListHook) ? storytellingListHook.length : 0;
      const personaCount = personaHook ? 1 : 0;
      return storyCount + personaCount > 0 || hasBrandProfile;
    },
    enabled: !!activeWorkspace?.id && isClientWorkspace && !skippedOnboarding,
  });

  const toggleRecommendation = useCallback(async (id: string, currentCompleted: boolean | null) => {
    if (isDemoMode) return;
    const newCompleted = !currentCompleted;
    await supabase.from("audit_recommendations").update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq("id", id);
    queryClient.setQueryData<DashboardData>(["dashboard-data", user?.id, isDemoMode], (prev) => {
      if (!prev) return prev;
      return { ...prev, recommendations: prev.recommendations.map(r => r.id === id ? { ...r, completed: newCompleted } : r) };
    });
  }, [isDemoMode, user?.id, queryClient]);

  const activeSpaces = useMemo(() => spaceModules.filter(s => {
    if (channelsLoading) return false;
    // Feature flag: hide disabled modules for non-admin
    if (s.moduleFlag && !isModuleVisible(s.moduleFlag, isAdmin)) return false;
    if (s.id === "branding") return true;
    if (s.id === "instagram") return hasInstagram;
    if (s.id === "website") return hasWebsite;
    if (s.id === "linkedin") return hasLinkedin;
    if (s.id === "seo") return hasSeo;
    return s.enabled;
  }), [channelsLoading, hasInstagram, hasLinkedin, hasWebsite, hasSeo, isAdmin]);

  // ── Client onboarding for empty workspace ──
  if (isClientWorkspace && clientHasData === false && !skippedOnboarding) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <ClientOnboarding
          workspaceName={activeWorkspace?.name || "Client"}
          workspaceId={activeWorkspace!.id}
          onComplete={() => {
            localStorage.setItem(`onboarding_skipped_${activeWorkspace!.id}`, "true");
            queryClient.invalidateQueries();
          }}
          onSkip={() => {
            localStorage.setItem(`onboarding_skipped_${activeWorkspace!.id}`, "true");
            queryClient.invalidateQueries({ queryKey: ["client-has-data"] });
          }}
        />
      </div>
    );
  }

  // Le profil a ÉCHOUÉ à charger : sans ce cas, on retombait sur le squelette
  // ci-dessous — qui s'affichait alors indéfiniment, sans message ni recours
  // (trouvé par `e2e-visite/ecran-fige-sonde.spec.ts` le 23/07 : squelette
  // toujours là 30 s après un 500). Même famille que le spinner infini #631.
  if (!profile && (profileError || profilIntrouvable)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 sm:py-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              Impossible de charger ton profil — réessaie dans un instant.
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["profile"] })}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              Réessayer
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 sm:py-8">
          <div className="mb-8">
            <div className="h-7 w-64 rounded-md bg-muted animate-pulse mb-2" />
            <div className="h-4 w-48 rounded-md bg-muted animate-pulse" />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-4 mb-6">
            <SkeletonCard variant="large" />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-4 mb-6">
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-4 mb-6">
            <SkeletonCard variant="medium" />
            <SkeletonCard variant="medium" />
          </div>
        </main>
      </div>
    );
  }

  let delayIdx = 0;
  const nextDelay = () => { delayIdx++; return delayIdx * 0.05; };

  return (
    <div className="min-h-screen bg-background">
      
      <AppHeader />
      
      <main id="main-content" role="main" className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 sm:py-8">

        {/* ─── Guide banner (from=guide) ─── */}
        <GuideBanner />

        {/* Erreur de chargement visible : sans ce bandeau, un 500 affiche un
            dashboard « normal » avec tout à zéro, sans indice ni recours. */}
        {dashError && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              Impossible de charger tes données — ce que tu vois peut être incomplet.
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["dashboard-data"] })}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* ─── View toggle + Phase badge ─── */}
        <div className="flex items-center justify-between mb-4">
          <PhaseBadge />
          <DashboardViewToggle current="complete" />
        </div>

        {/* ─── Greeting ─── */}
        <div className="mb-6 sm:mb-8">
          <h1 className="font-heading text-lg sm:text-2xl md:text-3xl font-bold text-foreground leading-tight">
            Hey <span className="text-primary">{profile.prenom}</span>,{" "}
            {isBinome && coachingMonth
              ? <>accompagnement Binôme · Mois {coachingMonth}/6 🤝</>
              : <>{welcomeMessage}</>
            }
          </h1>
          <p className="mt-1 text-sm sm:text-sm text-muted-foreground font-body">
            Ton espace coaching + outils de com'.
          </p>
        </div>

        <OnboardingMissions prenom={profile.prenom} />

        {/* ═══════════════════════════════════════
           ROW 1 — Hero "Créer un contenu" + Session focus
           ═══════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 sm:mb-8">
          <div className="md:col-span-2">
            <FirstTimeTooltip id="dashboard-create" text="Crée des posts, carrousels, Reels... L'IA t'aide à rédiger." className="h-full">
              <BentoCard
                title=""
                colSpan={12}
                rowSpan={2}
                variant="highlight"
                onClick={() => navigate("/creer")}
                animationDelay={nextDelay()}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground">Créer un contenu</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                  Post, carousel, reel, article... c'est parti.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Post Instagram", route: "/creer" },
                    { label: "Carousel", route: "/creer?format=carousel" },
                    { label: "Reel", route: "/creer?format=reel" },
                    { label: "Post LinkedIn", route: "/creer?canal=linkedin" },
                    ...(isModuleVisible("site", isAdmin) ? [{ label: "Article de blog", route: "/site/accueil" }] : []),
                  ].map((item) => (
                    <button
                      key={item.route + item.label}
                      onClick={(e) => { e.stopPropagation(); navigate(item.route); }}
                      className="text-xs font-medium px-3.5 py-2 rounded-xl
                        bg-card/80 border border-primary/15 text-foreground
                        hover:bg-primary hover:text-primary-foreground hover:border-primary
                        transition-all duration-150"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); setContentCoachingOpen(true); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors self-start"
                  >
                    🤔 Je sais pas quoi poster...
                  </button>
                  {isAurianaDemoEmail(user?.email) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearFlowState();
                        saveFlowState({ ...AURIANA_DEMO_FLOW, ts: Date.now() });
                        navigate("/creer", { state: { demo: true, demoScenario: "auriana-carousel" } });
                      }}
                      className="self-start text-sm font-semibold px-4 py-2.5 rounded-xl
                        bg-primary text-primary-foreground
                        hover:bg-primary/90
                        transition-all duration-150 shadow-sm"
                    >
                      🎬 Lancer la démo carrousel
                    </button>
                  )}
                </div>
              </BentoCard>
            </FirstTimeTooltip>
          </div>
          <div className="md:col-span-1 order-first md:order-last flex flex-col gap-4">
            {/* ─── Mes idées ─── */}
            <div
              onClick={() => navigate("/idees")}
              className="rounded-[20px] p-5 sm:p-5
                shadow-[var(--shadow-bento)]
                hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
                active:translate-y-0 active:shadow-[var(--shadow-bento)]
                transition-all duration-[250ms] ease-out
                cursor-pointer
                opacity-0 animate-reveal-up
                bg-gradient-to-br from-[hsl(var(--bento-lavande))] to-[hsl(270_50%_97%)]
                border border-border/50 text-foreground
                flex flex-col justify-between min-h-[130px]"
              style={{ animationDelay: `${nextDelay()}s`, animationFillMode: "forwards" }}
            >
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 rounded-xl bg-white/60 backdrop-blur-sm border border-white/40 flex items-center justify-center">
                  <Lightbulb className="h-5 w-5 text-primary" />
                </div>
                {dashData.ideaCount > 0 && (
                  <span className="bg-black/5 px-2 py-0.5 rounded-md text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                    {dashData.ideaCount} idée{dashData.ideaCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground leading-tight">Mes idées</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Boîte à idées</p>
              </div>
            </div>

            {/* ─── Mes photos ─── */}
            <div
              onClick={() => navigate("/photos")}
              className="rounded-[20px] p-5 sm:p-5
                shadow-[var(--shadow-bento)]
                hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px]
                active:translate-y-0 active:shadow-[var(--shadow-bento)]
                transition-all duration-[250ms] ease-out
                cursor-pointer
                opacity-0 animate-reveal-up
                bg-gradient-to-br from-[hsl(var(--bento-mint))] to-[hsl(160_50%_97%)]
                border border-border/50 text-foreground
                flex flex-col justify-between min-h-[130px]"
              style={{ animationDelay: `${nextDelay()}s`, animationFillMode: "forwards" }}
            >
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 rounded-xl bg-white/60 backdrop-blur-sm border border-white/40 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-primary" />
                </div>
                {dashData.photoCount > 0 && (
                  <span className="bg-black/5 px-2 py-0.5 rounded-md text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                    {dashData.photoCount} photo{dashData.photoCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground leading-tight">Mes photos</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Ma bibliothèque</p>
              </div>
            </div>

            <SessionFocusWidget
              brandingCompletion={dashData.brandingCompletion}
              igAuditScore={dashData.igAuditScore}
              liAuditScore={dashData.liAuditScore}
              calendarPostCount={dashData.calendarPostCount}
              weekPostsPublished={dashData.weekPostsPublished}
              weekPostsTotal={dashData.weekPostsTotal}
              contactCount={dashData.contactCount}
              animationDelay={nextDelay()}
            />
          </div>
        </div>


        {/* ═══════════════════════════════════════
           MES ESPACES
           ═══════════════════════════════════════ */}
        {activeSpaces.length > 0 && (
          <BentoGrid sectionLabel="MES ESPACES">
            {activeSpaces.map((space) => (
              <SpaceBentoCard
                key={space.id}
                title={space.title}
                subtitle={space.id === "branding" && dashData.brandingCompletion.total > 0
                  ? `Complété à ${dashData.brandingCompletion.total}%`
                  : space.subtitle}
                icon={space.icon}
                gradient={space.gradient}
                badge={space.moduleFlag && isModuleHidden(space.moduleFlag) ? "Masqué" : space.badge}
                onClick={() => {
                  if (space.external) window.open(space.route, "_blank");
                  else navigate(space.route);
                }}
                animationDelay={nextDelay()}
              />
            ))}
          </BentoGrid>
        )}

        {/* ═══════════════════════════════════════
           ROW 2 — Calendrier + Engagement + Stats
           ═══════════════════════════════════════ */}
        <BentoGrid>
          <FirstTimeTooltip id="dashboard-calendar" text="Planifie tes contenus de la semaine. Fini le 'je poste quoi aujourd'hui'." className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-3">
            <WeekCalendarWidget animationDelay={nextDelay()} />
          </FirstTimeTooltip>
          <FirstTimeTooltip id="dashboard-plan-week" text="L'IA te propose un planning de contenus personnalisé pour la semaine." className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-1">
            <PlanWeekWidget animationDelay={nextDelay()} />
          </FirstTimeTooltip>
          <FirstTimeTooltip id="dashboard-stats" text="Tes chiffres du mois. Publications, engagement, objectifs." className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-2">
            <MonthlyStatsWidget animationDelay={nextDelay()} />
          </FirstTimeTooltip>
        </BentoGrid>

        {/* ═══════════════════════════════════════
           ROW 3 — Action blocks (SEO + Homepage)
           ═══════════════════════════════════════ */}
        <BentoGrid>

          {/* Améliorer mon SEO */}
          {hasSeo && isModuleVisible("seo", isAdmin) && (
            <BentoCard
              title=""
              colSpan={4}
              rowSpan={2}
              variant="default"
              borderColor="hsl(var(--primary))"
              onClick={() => navigate("/seo")}
              animationDelay={nextDelay()}
            >
              <span className="text-2xl mb-2 block">🔍</span>
              <h3 className="font-heading text-base font-bold text-foreground mb-1">Améliorer mon SEO</h3>
              <p className="text-sm text-muted-foreground mb-4">Référencement & mots-clés.</p>
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {["visibilité", "mots-clés", "ranking"].map(kw => (
                  <span key={kw} className="text-2xs font-mono-ui font-medium px-2 py-1 rounded-lg bg-rose-pale text-primary">
                    {kw}
                  </span>
                ))}
              </div>
            </BentoCard>
          )}

          {/* Rédiger ma page d'accueil */}
          {hasWebsite && isModuleVisible("site", isAdmin) && (
            <BentoCard
              title=""
              colSpan={hasSeo ? 4 : 8}
              rowSpan={2}
              bgColor="bg-gradient-to-br from-[hsl(var(--bento-lavande))] to-rose-pale border border-border/50 text-foreground"
              onClick={() => navigate("/site/accueil")}
              animationDelay={nextDelay()}
            >
              <span className="text-2xl mb-2 block">🌐</span>
              <h3 className="font-heading text-base font-bold text-foreground mb-1">Rédiger ma page d'accueil</h3>
              <p className="text-sm text-muted-foreground">Textes et structure de ta home.</p>
            </BentoCard>
          )}

          {/* Branding is now in Mes Espaces */}
        </BentoGrid>

        {/* ═══════════════════════════════════════
           COACHING CARD — Laetitia or Discovery
           ═══════════════════════════════════════ */}
        {isBinome ? (
          <LaetitiaCoachingCard animationDelay={nextDelay()} />
        ) : (
          <DiscoveryCoachingCard animationDelay={nextDelay()} />
        )}

        {/* ─── Coming Soon ─── */}
        {comingSoonChannels.length > 0 && (
          <div
            className="rounded-[20px] bg-gradient-to-r from-rose-pale via-card to-accent/10 border border-border p-3 sm:p-5 mb-6 sm:mb-8 shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up"
            style={{ animationDelay: `${nextDelay()}s`, animationFillMode: "forwards" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🚀</span>
              <h3 className="font-heading text-sm font-bold text-foreground">
                Bientôt : {comingSoonChannels.map(c => c.label).join(" & ")}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3 font-mono-ui">
              On y travaille pour toi.
            </p>
            <button className="text-xs font-medium px-3.5 py-2 rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity">
              Me prévenir →
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <Link to="/profil" className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono-ui">
            📱 Tu veux ajouter un canal ? <span className="underline">Modifier dans le profil →</span>
          </Link>
        </div>
      </main>
      <ContentCoachingDialog open={contentCoachingOpen} onOpenChange={setContentCoachingOpen} />
    </div>
  );
}
