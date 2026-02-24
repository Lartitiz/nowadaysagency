import { useMemo, useCallback } from "react";
import { useSession } from "@/contexts/SessionContext";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
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
import { startOfWeek, endOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";
import BentoGrid from "@/components/dashboard/BentoGrid";
import BentoCard from "@/components/dashboard/BentoCard";
import SpaceBentoCard from "@/components/dashboard/SpaceBentoCard";
import { spaceModules } from "@/config/dashboardModules";
import BadgesWidget from "@/components/dashboard/BadgesWidget";
import WeekCalendarWidget from "@/components/dashboard/WeekCalendarWidget";
import EngagementRoutineWidget from "@/components/dashboard/EngagementRoutineWidget";
import MonthlyStatsWidget from "@/components/dashboard/MonthlyStatsWidget";
import LaetitiaCoachingCard from "@/components/dashboard/LaetitiaCoachingCard";
import DiscoveryCoachingCard from "@/components/dashboard/DiscoveryCoachingCard";
import { checkBadges } from "@/lib/badges";
import { trackError } from "@/lib/error-tracker";
import OnboardingMissions from "@/components/dashboard/OnboardingMissions";


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

/* ── Main component ── */
export default function Dashboard() {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const navigate = useNavigate();
  const { isPilot } = useUserPlan();
  const { column, value } = useWorkspaceFilter();
  const { activeWorkspace, activeRole } = useWorkspace();
  const { hasInstagram, hasLinkedin, hasWebsite, hasSeo, loading: channelsLoading, channels } = useActiveChannels();
  const queryClient = useQueryClient();

  const isClientWorkspace = !!activeWorkspace && activeRole === "manager";

  const { startSession, isActive: sessionActive } = useSession();

  const welcomeMessage = useMemo(() => getWelcomeMessage(), []);
  // ── Profile query ──
  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: ["profile", user?.id, column, value, isDemoMode],
    queryFn: async () => {
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
      if (!user) return null;
      const { data } = await (supabase.from("profiles") as any).select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date").eq(column, value).single();
      return data as UserProfile | null;
    },
    enabled: !!user || isDemoMode,
  });

  const defaultDashData: DashboardData = {
    brandingCompletion: { storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 },
    igAuditScore: null, liAuditScore: null,
    contactCount: 0, prospectCount: 0, prospectConversation: 0, prospectOffered: 0,
    calendarPostCount: 0, weekPostsPublished: 0, weekPostsTotal: 0, nextPost: null,
    planData: null, recommendations: [],
  };

  // ── Dashboard data query ──
  const { data: dashData = defaultDashData } = useQuery<DashboardData>({
    queryKey: ["dashboard-data", user?.id, column, value, isDemoMode],
    queryFn: async () => {
      if (isDemoMode && demoData) {
        return {
          ...defaultDashData,
          brandingCompletion: { storytelling: 20, persona: 20, proposition: 20, tone: 15, strategy: 10, total: demoData.branding.completion },
          igAuditScore: demoData.audit.score,
          calendarPostCount: demoData.calendar_posts.length,
          weekPostsTotal: 3,
          weekPostsPublished: 1,
          contactCount: demoData.contacts.length,
          prospectCount: demoData.contacts.filter(c => c.type === "prospect").length,
          recommendations: [
            { id: "demo-rec-1", titre: "Optimise ta bio Instagram", route: "/instagram/bio", completed: false },
            { id: "demo-rec-2", titre: "Crée un calendrier de publication régulier", route: "/calendrier", completed: false },
            { id: "demo-rec-3", titre: "Ajoute des CTA dans tes légendes", route: "/instagram/creer", completed: false },
          ],
        };
      }
      if (!user) return defaultDashData;

      const now = new Date();
      const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const [profRes, brandingData, igAuditRes, liAuditRes, contactRes, prospectRes, prospectConvRes, prospectOffRes, calendarRes, weekPostsRes, weekPublishedRes, nextPostRes, planConfigRes, recsRes] = await Promise.all([
        (supabase.from("profiles") as any).select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date").eq(column, value).single(),
        fetchBrandingData(user.id),
        (supabase.from("instagram_audit") as any).select("score_global").eq(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("linkedin_audit") as any).select("score_global").eq(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("contacts") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("contact_type", "network"),
        (supabase.from("contacts") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("contact_type", "prospect"),
        (supabase.from("contacts") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("contact_type", "prospect").eq("prospect_stage", "in_conversation"),
        (supabase.from("contacts") as any).select("id", { count: "exact", head: true }).eq(column, value).eq("contact_type", "prospect").eq("prospect_stage", "offer_sent"),
        (supabase.from("calendar_posts") as any).select("id", { count: "exact", head: true }).eq(column, value),
        (supabase.from("calendar_posts") as any).select("id", { count: "exact", head: true }).eq(column, value).gte("date", weekStart).lte("date", weekEnd),
        (supabase.from("calendar_posts") as any).select("id", { count: "exact", head: true }).eq(column, value).gte("date", weekStart).lte("date", weekEnd).eq("status", "published"),
        (supabase.from("calendar_posts") as any).select("date, theme").eq(column, value).gte("date", format(now, "yyyy-MM-dd")).order("date", { ascending: true }).limit(1).maybeSingle(),
        (supabase.from("user_plan_config") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("audit_recommendations") as any).select("id, titre, route, completed").eq(column, value).order("position", { ascending: true }).limit(5),
      ]);

      const bc = calculateBrandingCompletion(brandingData);
      const config = {
        weekly_time: (planConfigRes.data as any)?.weekly_time?.toString() || "2_5h",
        channels: (planConfigRes.data?.channels as string[]) || ["instagram"],
        main_goal: (planConfigRes.data as any)?.main_goal || "visibility",
      };
      let planData: PlanData | null = null;
      try { planData = await computePlan(user.id, config); } catch (e) { trackError(e, { page: "Dashboard", action: "computePlan" }); }

      // Check badges on load
      checkBadges(user.id, bc.total);

      return {
        brandingCompletion: bc,
        igAuditScore: igAuditRes.data?.score_global ?? null,
        liAuditScore: liAuditRes.data?.score_global ?? null,
        contactCount: contactRes.count ?? 0,
        prospectCount: prospectRes.count ?? 0,
        prospectConversation: prospectConvRes.count ?? 0,
        prospectOffered: prospectOffRes.count ?? 0,
        calendarPostCount: calendarRes.count ?? 0,
        weekPostsTotal: weekPostsRes.count ?? 0,
        weekPostsPublished: weekPublishedRes.count ?? 0,
        nextPost: nextPostRes.data ? { date: nextPostRes.data.date, theme: nextPostRes.data.theme } : null,
        planData,
        recommendations: recsRes.data || [],
      };
    },
    enabled: !!user || isDemoMode,
    staleTime: 2 * 60 * 1000, // 2 min cache
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
    enabled: (!!user && isPilot) || (isDemoMode && !!demoData?.coaching),
  });

  const comingSoonChannels = useMemo(() => ALL_CHANNELS.filter(c => c.comingSoon && channels.includes(c.id)), [channels]);

  // ── Client workspace empty detection ──
  const skippedOnboarding = isClientWorkspace && typeof window !== "undefined" && localStorage.getItem(`onboarding_skipped_${activeWorkspace?.id}`) === "true";
  const { data: clientHasData } = useQuery({
    queryKey: ["client-has-data", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return true;
      const [story, persona, profile] = await Promise.all([
        (supabase.from("storytelling") as any).select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspace.id),
        (supabase.from("persona") as any).select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspace.id),
        (supabase.from("brand_profile") as any).select("id", { count: "exact", head: true }).eq("workspace_id", activeWorkspace.id),
      ]);
      return (story.count || 0) + (persona.count || 0) + (profile.count || 0) > 0;
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
    if (s.id === "branding") return true;
    if (s.id === "instagram") return hasInstagram;
    if (s.id === "website") return hasWebsite;
    if (s.id === "linkedin") return hasLinkedin;
    if (s.id === "seo") return hasSeo;
    return s.enabled;
  }), [channelsLoading, hasInstagram, hasLinkedin, hasWebsite, hasSeo]);

  // ── Client onboarding for empty workspace ──
  if (isClientWorkspace && clientHasData === false && !skippedOnboarding) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <ClientOnboarding
          workspaceName={activeWorkspace?.name || "Client"}
          workspaceId={activeWorkspace!.id}
          onComplete={() => {
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
      
      <main id="main-content" className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 sm:py-8">

        {/* ─── Greeting ─── */}
        <div className="mb-6 sm:mb-8">
          <h1 className="font-heading text-lg sm:text-[22px] md:text-[28px] font-bold text-foreground leading-tight">
            Hey <span className="text-primary">{profile.prenom}</span>,{" "}
            {isPilot && coachingMonth
              ? <>programme Now Pilot · Mois {coachingMonth}/6 🤝</>
              : <>{welcomeMessage}</>
            }
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-muted-foreground font-body">
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
                onClick={() => navigate("/instagram/creer")}
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
                    { label: "Post Instagram", route: "/instagram/creer" },
                    { label: "Carousel", route: "/instagram/carousel" },
                    { label: "Reel", route: "/instagram/reels" },
                    { label: "Post LinkedIn", route: "/linkedin/post" },
                    { label: "Article de blog", route: "/site/accueil" },
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
              </BentoCard>
            </FirstTimeTooltip>
          </div>
          {!sessionActive && (
            <div className="md:col-span-1">
              <BentoCard
                title=""
                colSpan={12}
                rowSpan={2}
                animationDelay={nextDelay()}
                onClick={() => {
                  if (isDemoMode) {
                    toast({ title: "Les sessions sont disponibles avec ton compte 😉" });
                  } else {
                    startSession();
                  }
                }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⏱️</span>
                  <div className="min-w-0">
                    <p className="font-heading text-sm font-bold text-foreground truncate">
                      Session focus : 30 min
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      L'outil t'enchaîne les micro-tâches. Tu fais, tu avances, c'est fini.
                    </p>
                  </div>
                </div>
              </BentoCard>
            </div>
          )}
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
                badge={space.badge}
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
          <FirstTimeTooltip id="dashboard-routine" text="15 min/jour pour interagir avec ta communauté. L'habitude qui change tout." className="col-span-4 sm:col-span-6 lg:col-span-6 row-span-1">
            <EngagementRoutineWidget animationDelay={nextDelay()} />
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
          {hasSeo && (
            <BentoCard
              title=""
              colSpan={4}
              rowSpan={2}
              variant="default"
              borderColor="hsl(var(--primary))"
              onClick={() => window.open("https://referencement-seo.lovable.app/", "_blank")}
              animationDelay={nextDelay()}
            >
              <span className="text-2xl mb-2 block">🔍</span>
              <h3 className="font-heading text-base font-bold text-foreground mb-1">Améliorer mon SEO</h3>
              <p className="text-sm text-muted-foreground mb-4">Référencement & mots-clés.</p>
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {["visibilité", "mots-clés", "ranking"].map(kw => (
                  <span key={kw} className="text-[10px] font-mono-ui font-medium px-2 py-1 rounded-lg bg-rose-pale text-primary">
                    {kw}
                  </span>
                ))}
              </div>
            </BentoCard>
          )}

          {/* Rédiger ma page d'accueil */}
          {hasWebsite && (
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
        {isPilot ? (
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
    </div>
  );
}
