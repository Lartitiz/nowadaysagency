import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AiDisclaimerBanner from "@/components/AiDisclaimerBanner";
import { Progress } from "@/components/ui/progress";
import { useUserPlan } from "@/hooks/use-user-plan";
import { ArrowRight } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { useActiveChannels, ALL_CHANNELS, type ChannelId } from "@/hooks/use-active-channels";
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

/* ── Quick actions ── */
interface QuickAction { label: string; emoji: string; route: string; priority: number }

function getQuickActions(data: DashboardData): QuickAction[] {
  const actions: QuickAction[] = [];
  actions.push({ label: "Créer un post", emoji: "✨", route: "/instagram/creer", priority: 1 });
  actions.push({ label: "Routine engagement", emoji: "💬", route: "/instagram/routine", priority: 2 });
  actions.push({ label: "Voir mon calendrier", emoji: "📅", route: "/calendrier", priority: 3 });
  // "Relancer un prospect" removed
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

/* ── Dynamic tip — now uses activity examples as fallback ── */
function getDynamicTip(data: DashboardData, activityTip?: string): string {
  if (data.brandingCompletion.total < 30) return "Commence par le Branding, c'est la base de tout le reste.";
  if (data.brandingCompletion.total < 100) return "Continue ton branding ! Plus il est complet, plus l'IA te connaît.";
  if (data.igAuditScore == null) return "Maintenant que ton branding est posé, fais ton audit pour savoir où tu en es.";
  if (data.calendarPostCount === 0) return "Tes fondations sont solides. C'est le moment de planifier tes premiers contenus !";
  return activityTip || "Continue comme ça ! Pense à checker tes stats pour voir ce qui marche.";
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
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const igCompletion = getIgCompletion(dashData);
  const liCompletion = getLiCompletion(dashData);
  const brandingDone = dashData.brandingCompletion.total >= 100;
  const quickActions = getQuickActions(dashData);
  const tip = getDynamicTip(dashData, activityExamples.dashboard_tip);

  // Coming soon channels that are active in profile
  const comingSoonChannels = ALL_CHANNELS.filter(c => c.comingSoon && channels.includes(c.id));

  // Branding next step
  const brandingNextStep = (() => {
    const bc = dashData.brandingCompletion;
    if (bc.storytelling === 0) return "Écrire ton histoire";
    if (bc.persona === 0) return "Définir ta cible";
    if (bc.proposition === 0) return "Affiner ta proposition de valeur";
    if (bc.tone === 0) return "Définir ton ton & tes combats";
    if (bc.strategy === 0) return "Créer ta stratégie de contenu";
    return null;
  })();

  function getBrandingMissing(bc: BrandingCompletion): string | undefined {
    const missing: string[] = [];
    if (bc.storytelling === 0) missing.push("ton histoire");
    if (bc.persona === 0) missing.push("ta cible");
    if (bc.proposition === 0) missing.push("ta proposition de valeur");
    if (bc.tone === 0) missing.push("ton ton de voix");
    if (bc.strategy === 0) missing.push("ta ligne éditoriale");
    if (missing.length === 0 || bc.total === 0) return undefined;
    return missing.slice(0, 2).join(", ");
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <AiDisclaimerBanner />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">

        {/* 1. Header */}
        <div className="mb-4">
          <h1 className="font-display text-[22px] sm:text-[30px] font-bold text-foreground">
            Hey <span className="text-primary">{profile.prenom}</span>,{" "}
            {isPilot && coachingInfo
              ? <>programme Now Pilot · Mois {coachingInfo.month}/6 🤝</>
              : <>on avance sur quoi aujourd'hui ?</>
            }
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {isPilot ? "Ton espace coaching + outils de com'." : "Choisis un pilier ou lance une action rapide."}
          </p>
        </div>

        {/* Now Pilot coaching card */}
        {isPilot && (
          <div
            onClick={() => navigate("/accompagnement")}
            className="rounded-xl border-2 border-primary/30 bg-card p-4 mb-6 cursor-pointer hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤝</span>
                <span className="text-sm font-bold text-foreground">Mon accompagnement</span>
                {coachingInfo && (
                  <span className="text-xs text-muted-foreground">
                    · Phase {coachingInfo.phase === "strategy" ? "Stratégie" : "Binôme"}
                  </span>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
            {coachingInfo?.nextSession ? (
              <p className="text-xs text-muted-foreground ml-7">
                Prochaine session : {format(new Date(coachingInfo.nextSession.date), "d MMM", { locale: fr })}
                {coachingInfo.nextSession.title ? ` · ${coachingInfo.nextSession.title}` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground ml-7">Pas de session programmée pour le moment.</p>
            )}
            {coachingInfo && coachingInfo.actionsTotal > 0 && (
              <p className="text-xs text-muted-foreground ml-7">
                Actions : {coachingInfo.actionsDone}/{coachingInfo.actionsTotal} faites
              </p>
            )}
          </div>
        )}

        {/* 2. Conseil du jour */}
        <div className="rounded-[10px] bg-rose-pale px-4 py-3 mb-6">
          <p className="text-[13px] text-muted-foreground">💡 <span className="font-bold text-bordeaux">{tip}</span></p>
        </div>

        {/* 3. Actions rapides */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">⚡ Actions rapides</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
            {quickActions.map((a) => (
              <button key={a.route + a.label} onClick={() => navigate(a.route)}
                className="shrink-0 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 hover:border-primary/50 transition-colors">
                <span>{a.emoji}</span>{a.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Fondations — après actions rapides, avant canaux */}
        <div className="mb-6">
          {brandingDone ? (
            <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-1.5">
              <div onClick={() => navigate("/branding")}
                className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎨</span>
                  <span className="text-sm font-semibold text-foreground">Mon Branding</span>
                  <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-1.5 py-0.5 rounded">✅</span>
                </div>
                <span className="text-xs text-primary font-medium">Voir ma synthèse →</span>
              </div>
              {dashData.igAuditScore != null && (
                <div onClick={() => navigate("/instagram/audit")}
                  className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔍</span>
                    <span className="text-sm text-muted-foreground">Dernier audit : <span className="font-semibold text-foreground">{dashData.igAuditScore}/100</span></span>
                  </div>
                  <span className="text-xs text-primary font-medium">Voir →</span>
                </div>
              )}
            </div>
          ) : (
            <div onClick={() => navigate("/branding")}
              className="rounded-xl border border-border bg-card px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎨</span>
                  <span className="text-sm font-semibold text-foreground">Mon Branding</span>
                  <span className="text-xs text-muted-foreground">· {dashData.brandingCompletion.total}%</span>
                </div>
                <span className="text-xs text-primary font-medium">{dashData.brandingCompletion.total > 0 ? "Continuer →" : "Commencer →"}</span>
              </div>
              <p className="text-[12px] text-muted-foreground mt-1">Pose les bases de ta communication.</p>
            </div>
          )}
        </div>

        {/* 5. Cards canaux */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Instagram card */}
          {!channelsLoading && hasInstagram && (
            igCompletion >= 100
              ? <ChannelDailyCard channel="instagram" data={dashData} />
              : <ChannelSetupCard emoji="📱" title="Mon Instagram" completion={igCompletion}
                  nextStep={dashData.igAuditScore == null ? "Faire ton audit Instagram" : "Planifier ton premier contenu"}
                  route="/instagram" descKey="instagram" />
          )}

          {/* LinkedIn card */}
          {!channelsLoading && hasLinkedin && (
            liCompletion >= 100
              ? <ChannelDailyCard channel="linkedin" data={dashData} />
              : <ChannelSetupCard emoji="💼" title="Mon LinkedIn" completion={liCompletion}
                  nextStep={dashData.liAuditScore == null ? "Auditer ton profil LinkedIn" : "Optimiser ton profil"}
                  route="/linkedin" descKey="linkedin" />
          )}

          {/* Site Web / Blog card */}
          {!channelsLoading && hasWebsite && <WebsiteCard />}

          {/* SEO card (external tool) */}
          {!channelsLoading && hasSeo && <SeoExternalCard />}
        </div>

        {/* 6. Bientôt disponibles */}
        {comingSoonChannels.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">🔜 Bientôt disponibles</p>
            <div className="space-y-1.5">
              {comingSoonChannels.map(c => (
                <p key={c.id} className="text-sm text-muted-foreground">
                  {c.emoji} <span className="font-medium text-foreground">{c.label}</span> · On y travaille, tu seras prévenu·e
                </p>
              ))}
            </div>
          </div>
        )}

        {/* 7. Lien modifier mes canaux */}
        <div className="text-center py-4">
          <Link to="/profil" className="text-xs text-muted-foreground hover:text-primary transition-colors">
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

/* ── Channel descriptions ── */
const CHANNEL_DESCRIPTIONS: Record<string, { setup: string; ready: string | null }> = {
  instagram: {
    setup: "Optimise ton profil, génère tes contenus et développe ta communauté sur Instagram.",
    ready: "Crée tes contenus, suis tes stats et développe ta communauté sur Instagram.",
  },
  linkedin: {
    setup: "Travaille ta présence professionnelle : profil optimisé, posts stratégiques et réseau ciblé.",
    ready: "Publie du contenu stratégique et développe ton réseau professionnel sur LinkedIn.",
  },
  website: {
    setup: "Rédige les textes de ton site : page d'accueil, à propos, pages de vente et articles de blog.",
    ready: "Rédige et améliore les textes de ton site : pages, articles de blog, pages de vente.",
  },
  seo: {
    setup: "Améliore ton référencement naturel pour être trouvée sur Google par tes client·es idéales.",
    ready: "Améliore ton référencement naturel pour être trouvée sur Google par tes client·es idéales.",
  },
  branding: {
    setup: "Pose les bases de ta communication : positionnement, cible idéale, ton de voix, histoire et offres.",
    ready: null,
  },
};

/* ── Channel Setup Card (< 100%) ── */
function ChannelSetupCard({ emoji, title, completion, nextStep, route, descKey, missingLabel }: {
  emoji: string; title: string; completion: number; nextStep: string; route: string; descKey?: string; missingLabel?: string;
}) {
  const navigate = useNavigate();
  const desc = descKey ? CHANNEL_DESCRIPTIONS[descKey]?.setup : null;
  return (
    <div onClick={() => navigate(route)}
      className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{completion}%</span>
      </div>
      <Progress value={completion} className="h-2 mb-3" />
      {desc && <p className="text-[13px] text-muted-foreground mb-3">{desc}</p>}
      {missingLabel ? (
        <p className="text-[13px] text-muted-foreground mb-1">Il te manque : <span className="text-foreground font-medium">{missingLabel}</span></p>
      ) : (
        <p className="text-[13px] text-muted-foreground mb-1">Prochaine étape : <span className="text-foreground font-medium">{nextStep}</span></p>
      )}
      <p className="text-sm font-semibold text-primary mt-1">{completion > 0 ? "Continuer →" : "Commencer →"}</p>
    </div>
  );
}

/* ── Channel Daily Card (100%) ── */
function ChannelDailyCard({ channel, data }: { channel: "instagram" | "linkedin"; data: DashboardData }) {
  const navigate = useNavigate();

  if (channel === "instagram") {
    return (
      <div onClick={() => navigate("/instagram")} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📱</span>
            <h3 className="font-display text-base font-bold text-foreground">Mon Instagram</h3>
          </div>
          <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-2 py-0.5 rounded-full">✅ Prêt</span>
        </div>
        <p className="text-[13px] text-muted-foreground mb-3">{CHANNEL_DESCRIPTIONS.instagram.ready}</p>
        <div className="space-y-1 mb-3 text-[13px] text-muted-foreground">
          {data.igAuditScore != null && <p>📊 Dernier audit : <span className="font-medium text-foreground">{data.igAuditScore}/100</span></p>}
          <p>📅 Cette semaine : <span className="font-medium text-foreground">{data.weekPostsPublished}/{data.weekPostsTotal} posts publiés</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MiniBtn label="✨ Créer un contenu" onClick={() => navigate("/instagram/creer")} />
          <MiniBtn label="🔍 Analyser mon profil" onClick={() => navigate("/instagram/audit")} />
          <MiniBtn label="💬 Routine engagement" onClick={() => navigate("/contacts")} />
          <MiniBtn label="📅 Calendrier édito" onClick={() => navigate("/calendrier")} />
          <MiniBtn label="📊 Mes stats" onClick={() => navigate("/instagram/stats")} />
        </div>
      </div>
    );
  }

  // LinkedIn
  return (
    <div onClick={() => navigate("/linkedin")} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">💼</span>
          <h3 className="font-display text-base font-bold text-foreground">Mon LinkedIn</h3>
        </div>
        <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-2 py-0.5 rounded-full">✅ Prêt</span>
      </div>
      <p className="text-[13px] text-muted-foreground mb-3">{CHANNEL_DESCRIPTIONS.linkedin.ready}</p>
      <div className="space-y-1 mb-3 text-[13px] text-muted-foreground">
        {data.liAuditScore != null && <p>📊 Dernier audit : <span className="font-medium text-foreground">{data.liAuditScore}/100</span></p>}
        <p>📅 Cette semaine : <span className="font-medium text-foreground">0/1 post publié</span></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <MiniBtn label="✨ Créer un post LinkedIn" onClick={() => navigate("/linkedin/post")} />
        <MiniBtn label="📅 Calendrier édito" onClick={() => navigate("/calendrier?canal=linkedin")} />
        <MiniBtn label="📊 Mes stats" onClick={() => navigate("/linkedin/audit")} />
      </div>
    </div>
  );
}

/* ── Mini button for daily cards ── */
function MiniBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 text-primary hover:bg-primary/5 transition-colors">
      {label}
    </button>
  );
}

/* ── Website Card ── */
function WebsiteCard() {
  const navigate = useNavigate();
  // TODO: could fetch actual page count from DB to switch between setup/ready
  const isReady = false; // placeholder — flip when pages are written
  return (
    <div onClick={() => navigate("/site")}
      className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌐</span>
          <h3 className="font-display text-base font-bold text-foreground">Mon Site Web</h3>
        </div>
        {isReady && <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-2 py-0.5 rounded-full">✅ Prêt</span>}
      </div>
      <p className="text-[13px] text-muted-foreground mb-3">
        {isReady ? CHANNEL_DESCRIPTIONS.website.ready : CHANNEL_DESCRIPTIONS.website.setup}
      </p>
      {!isReady && (
        <>
          <Progress value={0} className="h-2 mb-3" />
          <p className="text-[13px] text-muted-foreground mb-1">Prochaine étape : <span className="text-foreground font-medium">Rédiger ta page d'accueil</span></p>
          <p className="text-sm font-semibold text-primary mt-1">Commencer →</p>
        </>
      )}
      {isReady && (
        <div className="flex flex-wrap gap-2">
          <MiniBtn label="📄 Page d'accueil" onClick={() => navigate("/site/accueil")} />
          <MiniBtn label="📄 À propos" onClick={() => navigate("/site/a-propos")} />
          <MiniBtn label="📄 Mes offres" onClick={() => navigate("/site/capture")} />
          <MiniBtn label="✨ Écrire un article de blog" onClick={() => navigate("/site/accueil")} />
        </div>
      )}
    </div>
  );
}

/* ── SEO External Card ── */
function SeoExternalCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🔍</span>
          <h3 className="font-display text-base font-bold text-foreground">Mon SEO</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">🔗 Externe</span>
      </div>
      <p className="text-[13px] text-muted-foreground mb-3">{CHANNEL_DESCRIPTIONS.seo.setup}</p>
      <a
        href="https://referencement-seo.lovable.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 text-primary hover:bg-primary/5 transition-colors inline-flex items-center gap-1"
      >
        🔗 Ouvrir le SEO Toolkit →
      </a>
    </div>
  );
}


/* ── Foundation Row (mini) ── */
function FoundationRow({ emoji, label, detail, route, linkLabel }: {
  emoji: string; label: string; detail: string; route: string; linkLabel: string;
}) {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(route)}
      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{emoji}</span>
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-1.5 py-0.5 rounded">✅ {detail}</span>
      </div>
      <span className="text-xs text-primary font-medium">{linkLabel}</span>
    </div>
  );
}
