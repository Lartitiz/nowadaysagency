import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AiDisclaimerBanner from "@/components/AiDisclaimerBanner";
import { Progress } from "@/components/ui/progress";
import { useUserPlan } from "@/hooks/use-user-plan";
import { ArrowRight, Sparkles, Check } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { useActiveChannels, ALL_CHANNELS } from "@/hooks/use-active-channels";
import { computePlan, type PlanData } from "@/lib/plan-engine";
import { startOfWeek, endOfWeek, format, getDay, addDays, isToday, isBefore } from "date-fns";
import { fr } from "date-fns/locale";
import BentoGrid from "@/components/dashboard/BentoGrid";
import BentoCard from "@/components/dashboard/BentoCard";
import SpaceBentoCard from "@/components/dashboard/SpaceBentoCard";
import { spaceModules } from "@/config/dashboardModules";

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
  weekCalendarDays: string[];
  streakDays: boolean[];
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
  const navigate = useNavigate();
  const { isPilot } = useUserPlan();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coachingInfo, setCoachingInfo] = useState<{ phase: string; month: number; nextSession: { date: string; title: string } | null } | null>(null);
  const [dashData, setDashData] = useState<DashboardData>({
    brandingCompletion: { storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 },
    igAuditScore: null, liAuditScore: null,
    contactCount: 0, prospectCount: 0, prospectConversation: 0, prospectOffered: 0,
    calendarPostCount: 0, weekPostsPublished: 0, weekPostsTotal: 0, nextPost: null,
    planData: null, recommendations: [],
    weekCalendarDays: [], streakDays: Array(7).fill(false),
  });
  const { hasInstagram, hasLinkedin, hasWebsite, hasSeo, loading: channelsLoading, channels } = useActiveChannels();

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

    const fetchAll = async () => {
      const [profRes, brandingData, igAuditRes, liAuditRes, contactRes, prospectRes, prospectConvRes, prospectOffRes, calendarRes, weekPostsRes, weekPublishedRes, nextPostRes, planConfigRes, recsRes, weekCalRes, streakRes] = await Promise.all([
        supabase.from("profiles").select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date").eq("user_id", user.id).single(),
        fetchBrandingData(user.id),
        supabase.from("instagram_audit").select("score_global").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("linkedin_audit").select("score_global").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("contact_type", "network"),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("contact_type", "prospect"),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("contact_type", "prospect").eq("prospect_stage", "in_conversation"),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("contact_type", "prospect").eq("prospect_stage", "offer_sent"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("date", weekStart).lte("date", weekEnd),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("date", weekStart).lte("date", weekEnd).eq("status", "published"),
        supabase.from("calendar_posts").select("date, theme").eq("user_id", user.id).gte("date", format(now, "yyyy-MM-dd")).order("date", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("user_plan_config").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("audit_recommendations").select("id, titre, route, completed").eq("user_id", user.id).order("position", { ascending: true }).limit(5),
        // Week calendar posts (dates with content)
        supabase.from("calendar_posts").select("date").eq("user_id", user.id).gte("date", weekStart).lte("date", weekEnd),
        // Streak data
        supabase.from("engagement_checklist_logs").select("log_date").eq("user_id", user.id).gte("log_date", weekStart).lte("log_date", weekEnd),
      ]);

      if (profRes.data) setProfile(profRes.data as UserProfile);

      const bc = calculateBrandingCompletion(brandingData);
      const config = {
        weekly_time: (planConfigRes.data as any)?.weekly_time?.toString() || "2_5h",
        channels: (planConfigRes.data?.channels as string[]) || ["instagram"],
        main_goal: (planConfigRes.data as any)?.main_goal || "visibility",
      };
      let planData: PlanData | null = null;
      try { planData = await computePlan(user.id, config); } catch {}

      // Build week calendar days with content
      const weekCalDays = (weekCalRes.data || []).map((p: any) => p.date);

      // Build streak days (Mon-Sun)
      const streakDates = (streakRes.data || []).map((d: any) => d.log_date);
      const monday = startOfWeek(now, { weekStartsOn: 1 });
      const streak = Array(7).fill(false).map((_, i) => {
        const day = format(addDays(monday, i), "yyyy-MM-dd");
        return streakDates.includes(day);
      });

      setDashData({
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
        weekCalendarDays: weekCalDays,
        streakDays: streak,
      });

      // Coaching info for Now Pilot
      if (isPilot) {
        const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
          .select("current_phase, current_month, id")
          .eq("client_user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        if (prog) {
          const { data: nextSess } = await (supabase.from("coaching_sessions" as any) as any)
            .select("scheduled_date, title")
            .eq("program_id", prog.id)
            .eq("status", "scheduled")
            .order("scheduled_date", { ascending: true })
            .limit(1)
            .maybeSingle();
          setCoachingInfo({
            phase: prog.current_phase,
            month: prog.current_month,
            nextSession: nextSess ? { date: nextSess.scheduled_date, title: nextSess.title } : null,
          });
        }
      }
    };
    fetchAll();
  }, [user?.id]);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const comingSoonChannels = ALL_CHANNELS.filter(c => c.comingSoon && channels.includes(c.id));

  const toggleRecommendation = async (id: string, currentCompleted: boolean | null) => {
    const newCompleted = !currentCompleted;
    await supabase.from("audit_recommendations").update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq("id", id);
    setDashData(prev => ({
      ...prev,
      recommendations: prev.recommendations.map(r => r.id === id ? { ...r, completed: newCompleted } : r),
    }));
  };

  // Mini calendar data
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const weekDays = Array(7).fill(null).map((_, i) => {
    const d = addDays(monday, i);
    return {
      label: format(d, "EEEEE", { locale: fr }).toUpperCase(),
      date: format(d, "yyyy-MM-dd"),
      isToday: isToday(d),
      hasContent: dashData.weekCalendarDays.includes(format(d, "yyyy-MM-dd")),
      isPast: isBefore(d, now) && !isToday(d),
    };
  });

  const auditScore = dashData.igAuditScore ?? 71;
  const scorePercent = auditScore;

  let delayIdx = 0;
  const nextDelay = () => { delayIdx++; return delayIdx * 0.05; };

  // Determine which spaces to show
  const activeSpaces = spaceModules.filter(s => {
    if (channelsLoading) return false;
    if (s.id === "instagram") return hasInstagram;
    if (s.id === "website") return hasWebsite;
    if (s.id === "linkedin") return hasLinkedin;
    if (s.id === "seo") return hasSeo;
    return s.enabled;
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <AiDisclaimerBanner />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">

        {/* ─── Greeting ─── */}
        <div className="mb-8">
          <h1 className="font-heading text-[22px] sm:text-[28px] font-bold text-foreground leading-tight">
            Hey <span className="text-primary">{profile.prenom}</span>,{" "}
            {isPilot && coachingInfo
              ? <>programme Now Pilot · Mois {coachingInfo.month}/6 🤝</>
              : <>{getWelcomeMessage()}</>
            }
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground font-body">
            Ton espace coaching + outils de com'.
          </p>
        </div>

        {/* ═══════════════════════════════════════
           ROW 1 — Hero "Créer un contenu"
           ═══════════════════════════════════════ */}
        <BentoGrid>
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
        </BentoGrid>

        {/* ═══════════════════════════════════════
           ROW 2 — Calendrier + Engagement + Stats
           ═══════════════════════════════════════ */}
        <BentoGrid>
          {/* Calendrier édito — left column */}
          <BentoCard
            title=""
            colSpan={6}
            rowSpan={3}
            variant="default"
            onClick={() => navigate("/calendrier")}
            animationDelay={nextDelay()}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-xl bg-accent/30 w-9 h-9 flex items-center justify-center rounded-xl">📅</span>
              <h3 className="font-heading text-base font-bold text-foreground">Calendrier édito</h3>
            </div>

            {/* Mini calendar grid */}
            <div className="grid grid-cols-7 gap-1.5 mb-5">
              {weekDays.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono-ui text-muted-foreground">{d.label}</span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-medium transition-colors
                    ${d.isToday ? "bg-primary text-primary-foreground" : ""}
                    ${d.hasContent && !d.isToday ? "bg-rose-pale text-primary" : ""}
                    ${!d.hasContent && !d.isToday ? "bg-muted/50 text-muted-foreground" : ""}
                  `}>
                    {format(new Date(d.date), "d")}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto">
              <p className="text-muted-foreground text-sm">
                <span className="font-heading text-2xl font-bold text-primary mr-1">{dashData.weekPostsPublished}</span>
                <span className="text-muted-foreground">/{dashData.weekPostsTotal} publiés cette semaine</span>
              </p>
            </div>
          </BentoCard>

          {/* Routine d'engagement — right top */}
          <BentoCard
            title=""
            colSpan={6}
            rowSpan={1}
            variant="default"
            onClick={() => navigate("/instagram/routine")}
            animationDelay={nextDelay()}
          >
            <h3 className="font-heading text-base font-bold text-foreground mb-3">💬 Routine d'engagement</h3>
            <div className="flex items-center justify-between gap-2">
              {["L", "M", "M", "J", "V", "S", "D"].map((day, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-mono-ui text-muted-foreground">{day}</span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors
                    ${dashData.streakDays[i]
                      ? "bg-rose-pale border border-primary/20"
                      : "bg-muted/40 border border-border"
                    }`}
                  >
                    {dashData.streakDays[i] && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Explorer mes stats — right bottom (dark) */}
          <BentoCard
            title=""
            colSpan={6}
            rowSpan={2}
            variant="dark"
            onClick={() => navigate("/instagram/stats")}
            animationDelay={nextDelay()}
          >
            <h3 className="font-body text-sm font-medium text-white/60 mb-2">Explorer mes stats</h3>
            <div className="mb-4">
              <span className="font-heading text-[3.5rem] font-bold text-white leading-none">{auditScore}</span>
              <span className="text-white/40 text-xl font-heading ml-1">/100</span>
            </div>
            <div className="w-full h-2.5 rounded-xl bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-xl bg-gradient-to-r from-accent to-primary transition-all duration-700"
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <p className="text-xs text-white/50 mt-2 font-body">Score audit Instagram</p>
          </BentoCard>
        </BentoGrid>

        {/* ═══════════════════════════════════════
           ROW 3 — Three action blocks
           ═══════════════════════════════════════ */}
        <BentoGrid>
          {/* Publier mon contenu */}
          <BentoCard
            title=""
            colSpan={4}
            rowSpan={2}
            variant="accent"
            onClick={() => navigate("/calendrier")}
            animationDelay={nextDelay()}
          >
            <span className="text-2xl mb-2 block">📝</span>
            <h3 className="font-heading text-base font-bold text-foreground mb-1">Publier mon contenu</h3>
            <p className="text-sm text-muted-foreground mb-4">Tes posts de la semaine.</p>
            <div className="mt-auto">
              <p className="font-heading text-2xl font-bold text-foreground">
                {dashData.weekPostsPublished}<span className="text-muted-foreground text-sm font-body">/{dashData.weekPostsTotal}</span>
              </p>
              <p className="text-xs text-muted-foreground mb-2">publiés</p>
              <Progress value={dashData.weekPostsTotal > 0 ? (dashData.weekPostsPublished / dashData.weekPostsTotal) * 100 : 0} className="h-1.5" />
            </div>
          </BentoCard>

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

          {/* Branding fallback if no SEO/website */}
          {!hasSeo && !hasWebsite && (
            <BentoCard
              title=""
              colSpan={8}
              rowSpan={2}
              variant="default"
              onClick={() => navigate("/branding")}
              animationDelay={nextDelay()}
            >
              <span className="text-2xl mb-2 block">🎨</span>
              <h3 className="font-heading text-base font-bold text-foreground mb-1">Mon Branding</h3>
              <p className="text-sm text-muted-foreground mb-3">La base de tout le reste.</p>
              <div className="flex items-center gap-3">
                <Progress value={dashData.brandingCompletion.total} className="h-1.5 flex-1" />
                <span className="text-xs font-mono-ui text-muted-foreground">{dashData.brandingCompletion.total}%</span>
              </div>
            </BentoCard>
          )}
        </BentoGrid>

        {/* ═══════════════════════════════════════
           DIAGNOSTIC RECAP (if recommendations exist)
           ═══════════════════════════════════════ */}
        {dashData.recommendations.length > 0 && (
          <div
            className="rounded-[20px] border border-border bg-card p-5 mb-6 shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up"
            style={{ animationDelay: `${nextDelay()}s`, animationFillMode: "forwards" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔍</span>
              <h2 className="font-heading text-sm font-bold text-foreground">Ton diagnostic</h2>
            </div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3 font-mono-ui">🎯 Tes priorités :</p>
            <div className="space-y-2.5">
              {dashData.recommendations.map(r => (
                <div key={r.id} className="flex items-center gap-3">
                  <button
                    onClick={() => toggleRecommendation(r.id, r.completed)}
                    className={`h-5 w-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                      r.completed ? "bg-primary border-primary" : "border-border hover:border-primary/50"
                    }`}
                  >
                    {r.completed && <span className="text-primary-foreground text-xs">✓</span>}
                  </button>
                  <span className={`text-sm flex-1 ${r.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {r.titre}
                  </span>
                  <button
                    onClick={() => navigate(r.route)}
                    className="text-xs text-primary font-medium shrink-0 hover:underline"
                  >
                    Y aller →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
           ROW 4 — Mes Espaces
           ═══════════════════════════════════════ */}
        {activeSpaces.length > 0 && (
          <BentoGrid sectionLabel="MES ESPACES">
            {activeSpaces.map((space) => (
              <SpaceBentoCard
                key={space.id}
                title={space.title}
                subtitle={space.subtitle}
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
           BRANDING BANNER
           ═══════════════════════════════════════ */}
        <div
          className="rounded-[20px] shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up mb-4"
          style={{ animationDelay: `${nextDelay()}s`, animationFillMode: "forwards" }}
        >
          {dashData.brandingCompletion.total >= 100 ? (
            <div
              onClick={() => navigate("/branding")}
              className="flex items-center justify-between rounded-[20px] border border-border bg-card px-5 py-3.5 cursor-pointer
                hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px] transition-all duration-[250ms]"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-lg shrink-0">🎨</span>
                <span className="text-sm font-bold text-foreground shrink-0">Mon Branding</span>
                <span className="text-xs font-mono-ui text-muted-foreground shrink-0">
                  Score : {dashData.brandingCompletion.total}/100
                </span>
                <Progress value={dashData.brandingCompletion.total} className="h-1.5 flex-1 max-w-[120px] ml-2" />
              </div>
              <span className="text-xs text-primary font-medium flex items-center gap-1 shrink-0 ml-3">
                Voir ma synthèse <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          ) : (
            <div
              onClick={() => navigate("/branding")}
              className="flex items-center justify-between rounded-[20px] border border-accent/40 bg-accent/10 px-5 py-3.5 cursor-pointer
                hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px] transition-all duration-[250ms]"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🎨</span>
                <div>
                  <span className="text-sm font-bold text-foreground">Pose ton branding, c'est la base de tout le reste</span>
                  {dashData.brandingCompletion.total > 0 && (
                    <p className="text-xs text-muted-foreground font-mono-ui mt-0.5">{dashData.brandingCompletion.total}% complété</p>
                  )}
                </div>
              </div>
              <span className="text-xs font-semibold text-accent-foreground bg-accent px-3 py-1.5 rounded-xl shrink-0 ml-3">
                {dashData.brandingCompletion.total > 0 ? "Continuer →" : "Commencer →"}
              </span>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════
           ACCOMPAGNEMENT (Now Pilot)
           ═══════════════════════════════════════ */}
        {isPilot && (
          <div
            className="rounded-[20px] shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up mb-4"
            style={{ animationDelay: `${nextDelay()}s`, animationFillMode: "forwards" }}
          >
            <div
              onClick={() => navigate("/accompagnement")}
              className="flex items-center justify-between rounded-[20px] border border-border bg-card px-5 py-3 cursor-pointer
                hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px] transition-all duration-[250ms]"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🤝</span>
                {coachingInfo?.nextSession ? (
                  <span className="text-sm text-muted-foreground">
                    📅 Prochaine session : <span className="font-medium text-foreground">
                      {format(new Date(coachingInfo.nextSession.date), "d MMM", { locale: fr })}
                      {coachingInfo.nextSession.title ? ` · ${coachingInfo.nextSession.title}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Pas de session prévue — <span className="text-primary font-medium">Réserver →</span>
                  </span>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-primary shrink-0" />
            </div>
          </div>
        )}

        {/* ─── Coming Soon ─── */}
        {comingSoonChannels.length > 0 && (
          <div
            className="rounded-[20px] bg-gradient-to-r from-rose-pale via-card to-accent/10 border border-border p-5 mb-8 shadow-[var(--shadow-bento)] opacity-0 animate-reveal-up"
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
