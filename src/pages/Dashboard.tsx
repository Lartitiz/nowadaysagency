import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AiDisclaimerBanner from "@/components/AiDisclaimerBanner";
import { Progress } from "@/components/ui/progress";
import { useUserPlan } from "@/hooks/use-user-plan";
import { ArrowRight, Calendar, BarChart3, Globe, Sparkles } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { useActiveChannels, ALL_CHANNELS } from "@/hooks/use-active-channels";
import { computePlan, type PlanData } from "@/lib/plan-engine";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";
import { useActivityExamples } from "@/hooks/use-activity-examples";

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

/* ── Channel completion helpers ── */
function getIgCompletion(d: DashboardData): number {
  let score = 0, total = 0;
  total += 1; if (d.igAuditScore != null) score += 1;
  total += 1; if (d.calendarPostCount > 0) score += 1;
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

function getLiCompletion(d: DashboardData): number {
  return d.liAuditScore != null ? 50 : 0;
}

/* ── Main component ── */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const activityExamples = useActivityExamples();
  const { isPilot } = useUserPlan();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coachingInfo, setCoachingInfo] = useState<{ phase: string; month: number; nextSession: { date: string; title: string } | null; actionsDone: number; actionsTotal: number } | null>(null);
  const [dashData, setDashData] = useState<DashboardData>({
    brandingCompletion: { storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 },
    igAuditScore: null, liAuditScore: null,
    contactCount: 0, prospectCount: 0, prospectConversation: 0, prospectOffered: 0,
    calendarPostCount: 0, weekPostsPublished: 0, weekPostsTotal: 0, nextPost: null,
    planData: null,
  });
  const { hasInstagram, hasLinkedin, hasPinterest, hasWebsite, hasNewsletter, hasSeo, loading: channelsLoading, channels } = useActiveChannels();

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

    const fetchAll = async () => {
      const [profRes, brandingData, igAuditRes, liAuditRes, contactRes, prospectRes, prospectConvRes, prospectOffRes, calendarRes, weekPostsRes, weekPublishedRes, nextPostRes, planConfigRes] = await Promise.all([
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
      });

      // Fetch coaching info for Now Pilot
      if (isPilot) {
        const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
          .select("current_phase, current_month, id")
          .eq("client_user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        if (prog) {
          const [nextSessRes, actionsRes, actionsDoneRes] = await Promise.all([
            (supabase.from("coaching_sessions" as any) as any)
              .select("scheduled_date, title")
              .eq("program_id", prog.id)
              .eq("status", "scheduled")
              .order("scheduled_date", { ascending: true })
              .limit(1)
              .maybeSingle(),
            (supabase.from("coaching_actions" as any) as any)
              .select("id", { count: "exact", head: true })
              .eq("program_id", prog.id),
            (supabase.from("coaching_actions" as any) as any)
              .select("id", { count: "exact", head: true })
              .eq("program_id", prog.id)
              .eq("completed", true),
          ]);
          setCoachingInfo({
            phase: prog.current_phase,
            month: prog.current_month,
            nextSession: nextSessRes.data ? { date: nextSessRes.data.scheduled_date, title: nextSessRes.data.title } : null,
            actionsDone: actionsDoneRes.count ?? 0,
            actionsTotal: actionsRes.count ?? 0,
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

  const igCompletion = getIgCompletion(dashData);
  const liCompletion = getLiCompletion(dashData);
  const brandingDone = dashData.brandingCompletion.total >= 100;
  const comingSoonChannels = ALL_CHANNELS.filter(c => c.comingSoon && channels.includes(c.id));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <AiDisclaimerBanner />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4 animate-fade-in">

        {/* ─── 2. Welcome ─── */}
        <div className="mb-6">
          <h1 className="font-display text-[22px] sm:text-[28px] font-bold text-foreground leading-tight">
            Hey <span className="text-primary">{profile.prenom}</span>,{" "}
            {isPilot && coachingInfo
              ? <>programme Now Pilot · Mois {coachingInfo.month}/6 🤝</>
              : <>{getWelcomeMessage()}</>
            }
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground font-mono-ui">
            Ton espace coaching + outils de com'.
          </p>
        </div>

        {/* ─── 3. HUB D'ACTIONS ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          {/* Main card — Créer un contenu */}
          <div
            className="lg:col-span-3 rounded-2xl p-6 cursor-pointer group
              bg-gradient-to-br from-rose-pale via-secondary to-rose-medium/30
              border border-primary/10 hover:shadow-strong hover:-translate-y-0.5 transition-all duration-200"
            onClick={() => navigate("/instagram/creer")}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold text-foreground">Créer un contenu</h2>
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
          </div>

          {/* 3 secondary cards */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {/* Calendrier */}
            <HubCard
              icon={<Calendar className="h-4 w-4 text-primary" />}
              title="Mon calendrier édito"
              subtitle="Planifie et visualise tes publications"
              badge={`${dashData.weekPostsPublished}/${dashData.weekPostsTotal} publiés cette semaine`}
              onClick={() => navigate("/calendrier")}
            />
            {/* Site & SEO */}
            <HubCard
              icon={<Globe className="h-4 w-4 text-primary" />}
              title="Mon site & SEO"
              subtitle="Pages, articles, référencement"
              onClick={() => navigate("/site")}
            />
            {/* Stats & Audits */}
            <HubCard
              icon={<BarChart3 className="h-4 w-4 text-primary" />}
              title="Mes stats & audits"
              subtitle="Analyse ta visibilité et ta progression"
              badge={dashData.igAuditScore != null ? `Score audit : ${dashData.igAuditScore}/100` : undefined}
              badgeProgress={dashData.igAuditScore ?? undefined}
              onClick={() => navigate("/instagram/audit")}
            />
          </div>
        </div>

        {/* ─── 4. ESPACES DE TRAVAIL ─── */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 font-mono-ui">
            Mes espaces de travail
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Instagram */}
            {!channelsLoading && hasInstagram && (
              igCompletion >= 100
                ? <WorkspaceReadyCard
                    emoji="📱" title="Instagram" score={dashData.igAuditScore}
                    weekLabel={`${dashData.weekPostsPublished}/${dashData.weekPostsTotal} posts publiés`}
                    actions={[
                      { label: "Créer un contenu", route: "/instagram/creer" },
                      { label: "Analyser mon profil", route: "/instagram/audit" },
                      { label: "Routine engagement", route: "/instagram/routine" },
                      { label: "Calendrier édito", route: "/calendrier" },
                      { label: "Mes stats", route: "/instagram/stats" },
                    ]}
                    onCardClick={() => navigate("/instagram")}
                  />
                : <WorkspaceSetupCard
                    emoji="📱" title="Instagram" completion={igCompletion}
                    desc="Optimise ton profil, génère tes contenus et développe ta communauté."
                    nextStep={dashData.igAuditScore == null ? "Faire ton audit Instagram" : "Planifier ton premier contenu"}
                    route="/instagram"
                  />
            )}

            {/* Site Web */}
            {!channelsLoading && hasWebsite && (
              <WorkspaceSetupCard
                emoji="🌐" title="Site Web" completion={0}
                desc="Rédige les textes de ton site : page d'accueil, à propos, pages de vente."
                nextStep="Rédiger ta page d'accueil"
                route="/site"
              />
            )}

            {/* LinkedIn */}
            {!channelsLoading && hasLinkedin && (
              liCompletion >= 100
                ? <WorkspaceReadyCard
                    emoji="💼" title="LinkedIn" score={dashData.liAuditScore}
                    weekLabel="0/1 post publié"
                    actions={[
                      { label: "Créer un post", route: "/linkedin/post" },
                      { label: "Calendrier édito", route: "/calendrier?canal=linkedin" },
                      { label: "Mes stats", route: "/linkedin/audit" },
                    ]}
                    onCardClick={() => navigate("/linkedin")}
                  />
                : <WorkspaceSetupCard
                    emoji="💼" title="LinkedIn" completion={liCompletion}
                    desc="Travaille ta présence professionnelle : profil, posts stratégiques et réseau."
                    nextStep={dashData.liAuditScore == null ? "Auditer ton profil LinkedIn" : "Optimiser ton profil"}
                    route="/linkedin"
                  />
            )}

            {/* SEO */}
            {!channelsLoading && hasSeo && (
              <div className="rounded-2xl border border-border bg-card p-5 opacity-[0.92]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🔍</span>
                    <h3 className="font-display text-base font-bold text-foreground">SEO</h3>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">🔗 Externe</span>
                </div>
                <p className="text-[13px] text-muted-foreground mb-3">Améliore ton référencement pour être trouvée sur Google.</p>
                <a
                  href="https://referencement-seo.lovable.app/"
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium px-3 py-1.5 rounded-xl border border-primary/20 text-primary hover:bg-primary/5 transition-colors inline-flex items-center gap-1"
                >
                  Ouvrir le SEO Toolkit →
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ─── 5. BRANDING ─── */}
        <div className="mb-6">
          {brandingDone ? (
            <div
              onClick={() => navigate("/branding")}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">🎨</span>
                <span className="text-sm font-bold text-foreground">Mon Branding</span>
                <span className="text-xs font-semibold text-[hsl(142,71%,45%)] bg-[hsl(142,76%,92%)] px-2 py-0.5 rounded-lg">
                  Score : {dashData.brandingCompletion.total}/100
                </span>
              </div>
              <span className="text-xs text-primary font-medium flex items-center gap-1">
                Voir ma synthèse <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          ) : (
            <div
              onClick={() => navigate("/branding")}
              className="rounded-2xl border border-primary/20 bg-gradient-to-r from-rose-pale to-card px-5 py-4 cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🎨</span>
                  <span className="text-sm font-bold text-foreground">Mon Branding</span>
                  <span className="text-xs text-muted-foreground font-mono-ui">{dashData.brandingCompletion.total}%</span>
                </div>
                <span className="text-xs text-primary font-medium flex items-center gap-1">
                  {dashData.brandingCompletion.total > 0 ? "Continuer" : "Poser mon branding"} <ArrowRight className="h-3 w-3" />
                </span>
              </div>
              <Progress value={dashData.brandingCompletion.total} className="h-1.5" />
            </div>
          )}
        </div>

        {/* ─── 6. ACCOMPAGNEMENT ─── */}
        {isPilot && (
          <div className="mb-6">
            <div
              onClick={() => navigate("/accompagnement")}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3 cursor-pointer hover:shadow-card transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-base">🤝</span>
                {coachingInfo?.nextSession ? (
                  <span className="text-sm text-muted-foreground">
                    Prochaine session : <span className="font-medium text-foreground">
                      {format(new Date(coachingInfo.nextSession.date), "d MMM", { locale: fr })}
                      {coachingInfo.nextSession.title ? ` · ${coachingInfo.nextSession.title}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Pas de session prévue — <span className="text-primary font-medium">Réserver un créneau</span>
                  </span>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-primary shrink-0" />
            </div>
          </div>
        )}

        {/* ─── 7. COMING SOON ─── */}
        {comingSoonChannels.length > 0 && (
          <div className="mb-8 rounded-2xl bg-gradient-to-r from-rose-pale via-card to-accent/10 border border-border p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🚀</span>
              <h3 className="font-display text-sm font-bold text-foreground">
                Bientôt : {comingSoonChannels.map(c => c.label).join(" & ")}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3 font-mono-ui">
              On y travaille pour toi. Bientôt dans ton Assistant.
            </p>
            <button className="text-xs font-medium px-3.5 py-2 rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity">
              Me prévenir →
            </button>
          </div>
        )}

        {/* Footer link */}
        <div className="text-center py-4">
          <Link to="/profil" className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono-ui">
            📱 Tu veux ajouter un canal ? <span className="underline">Modifier dans le profil →</span>
          </Link>
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Sub-components                                            */
/* ═══════════════════════════════════════════════════════════ */

/* ── Hub Card (secondary) ── */
function HubCard({ icon, title, subtitle, badge, badgeProgress, onClick }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  badgeProgress?: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="rounded-2xl border border-primary/10 bg-card p-4 cursor-pointer
        hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
      {badge && (
        <p className="text-xs text-muted-foreground font-mono-ui">{badge}</p>
      )}
      {badgeProgress != null && (
        <Progress value={badgeProgress} className="h-1 mt-1.5" />
      )}
    </div>
  );
}

/* ── Workspace Setup Card ── */
function WorkspaceSetupCard({ emoji, title, completion, desc, nextStep, route }: {
  emoji: string; title: string; completion: number; desc: string; nextStep: string; route: string;
}) {
  const navigate = useNavigate();
  const notStarted = completion === 0;
  return (
    <div
      onClick={() => navigate(route)}
      className={`rounded-2xl border border-border bg-card p-5 cursor-pointer
        hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200
        ${notStarted ? "opacity-[0.88]" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
        </div>
        {notStarted ? (
          <span className="text-xs text-muted-foreground font-mono-ui">🔒 Pas commencé</span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground font-mono-ui">{completion}%</span>
        )}
      </div>
      <Progress value={completion} className="h-1.5 mb-3" />
      <p className="text-[13px] text-muted-foreground mb-2">{desc}</p>
      <p className="text-[13px] text-muted-foreground">
        Prochaine étape : <span className="text-foreground font-medium">{nextStep}</span>
      </p>
      <p className="text-sm font-semibold text-primary mt-2 flex items-center gap-1">
        {completion > 0 ? "Continuer" : "Commencer"} <ArrowRight className="h-3.5 w-3.5" />
      </p>
    </div>
  );
}

/* ── Workspace Ready Card ── */
function WorkspaceReadyCard({ emoji, title, score, weekLabel, actions, onCardClick }: {
  emoji: string;
  title: string;
  score: number | null;
  weekLabel: string;
  actions: { label: string; route: string }[];
  onCardClick: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      onClick={onCardClick}
      className="rounded-2xl border border-border bg-card p-5 cursor-pointer
        hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
        </div>
        <span className="text-xs font-semibold text-[hsl(142,71%,45%)] bg-[hsl(142,76%,92%)] px-2 py-0.5 rounded-lg">✅ Prêt</span>
      </div>
      <div className="space-y-1 mb-3 text-[13px] text-muted-foreground">
        {score != null && (
          <div>
            <p className="mb-1">📊 Dernier audit : <span className="font-medium text-foreground">{score}/100</span></p>
            <Progress value={score} className="h-1" />
          </div>
        )}
        <p>📅 Cette semaine : <span className="font-medium text-foreground">{weekLabel}</span></p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.route + a.label}
            onClick={(e) => { e.stopPropagation(); navigate(a.route); }}
            className="text-xs font-medium px-3 py-1.5 rounded-xl border border-primary/20 text-primary hover:bg-primary/5 transition-colors"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
