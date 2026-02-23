import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AiDisclaimerBanner from "@/components/AiDisclaimerBanner";
import { Progress } from "@/components/ui/progress";
import { useUserPlan } from "@/hooks/use-user-plan";
import { ArrowRight, Sparkles } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { useActiveChannels, ALL_CHANNELS } from "@/hooks/use-active-channels";
import { computePlan, type PlanData } from "@/lib/plan-engine";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";
import { useDemoContext } from "@/contexts/DemoContext";
import BrandingAuditCard, { DEMO_AUDIT, type AuditResult } from "@/components/dashboard/BrandingAuditCard";

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

/* ── Main component ── */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isPilot } = useUserPlan();
  const { isDemoMode } = useDemoContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coachingInfo, setCoachingInfo] = useState<{ phase: string; month: number; nextSession: { date: string; title: string } | null } | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [dashData, setDashData] = useState<DashboardData>({
    brandingCompletion: { storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 },
    igAuditScore: null, liAuditScore: null,
    contactCount: 0, prospectCount: 0, prospectConversation: 0, prospectOffered: 0,
    calendarPostCount: 0, weekPostsPublished: 0, weekPostsTotal: 0, nextPost: null,
    planData: null,
  });
  const { hasInstagram, hasLinkedin, hasWebsite, hasSeo, loading: channelsLoading, channels } = useActiveChannels();

  /* ── Fetch branding audit ── */
  const fetchAudit = async () => {
    if (isDemoMode) {
      setAuditResult(DEMO_AUDIT);
      return;
    }
    if (!user) return;
    setAuditLoading(true);
    try {
      const { data } = await supabase
        .from("branding_audits")
        .select("score_global, points_forts, points_faibles, plan_action, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && data.score_global != null) {
        const strengths = Array.isArray(data.points_forts)
          ? (data.points_forts as any[]).map((p: any) => typeof p === "string" ? p : p.titre || p.title || "")
          : [];
        const weaknesses = Array.isArray(data.points_faibles)
          ? (data.points_faibles as any[]).map((p: any) => typeof p === "string" ? p : p.titre || p.title || "")
          : [];
        const recommendations = Array.isArray(data.plan_action)
          ? (data.plan_action as any[]).map((a: any) => ({
              title: a.titre || a.title || "",
              priority: a.priorite || a.priority || "medium",
              category: a.module || a.category || "",
              action_route: a.route || a.action_route || "/branding",
            }))
          : [];

        setAuditResult({
          score: data.score_global,
          date: data.created_at,
          strengths,
          weaknesses,
          recommendations,
        });
      } else {
        setAuditResult(null);
      }
    } catch {
      setAuditResult(null);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (!user && !isDemoMode) return;

    if (isDemoMode) {
      setProfile({
        prenom: "Léa",
        activite: "Photographe portrait",
        type_activite: "photo",
        cible: "",
        probleme_principal: "",
        piliers: [],
        tons: [],
        plan_start_date: null,
      });
      setAuditResult(DEMO_AUDIT);
      return;
    }

    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

    const fetchAll = async () => {
      const [profRes, brandingData, igAuditRes, liAuditRes, contactRes, prospectRes, prospectConvRes, prospectOffRes, calendarRes, weekPostsRes, weekPublishedRes, nextPostRes, planConfigRes] = await Promise.all([
        supabase.from("profiles").select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date").eq("user_id", user!.id).single(),
        fetchBrandingData(user!.id),
        supabase.from("instagram_audit").select("score_global").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("linkedin_audit").select("score_global").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("contact_type", "network"),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("contact_type", "prospect"),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("contact_type", "prospect").eq("prospect_stage", "in_conversation"),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("contact_type", "prospect").eq("prospect_stage", "offer_sent"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user!.id).gte("date", weekStart).lte("date", weekEnd),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user!.id).gte("date", weekStart).lte("date", weekEnd).eq("status", "published"),
        supabase.from("calendar_posts").select("date, theme").eq("user_id", user!.id).gte("date", format(now, "yyyy-MM-dd")).order("date", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("user_plan_config").select("*").eq("user_id", user!.id).maybeSingle(),
      ]);

      if (profRes.data) setProfile(profRes.data as UserProfile);

      const bc = calculateBrandingCompletion(brandingData);
      const config = {
        weekly_time: (planConfigRes.data as any)?.weekly_time?.toString() || "2_5h",
        channels: (planConfigRes.data?.channels as string[]) || ["instagram"],
        main_goal: (planConfigRes.data as any)?.main_goal || "visibility",
      };
      let planData: PlanData | null = null;
      try { planData = await computePlan(user!.id, config); } catch {}

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

      // Coaching info for Now Pilot
      if (isPilot) {
        const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
          .select("current_phase, current_month, id")
          .eq("client_user_id", user!.id)
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
    fetchAudit();
  }, [user?.id, isDemoMode]);

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

  const brandingDone = dashData.brandingCompletion.total >= 100;
  const comingSoonChannels = ALL_CHANNELS.filter(c => c.comingSoon && channels.includes(c.id));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <AiDisclaimerBanner />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4 animate-fade-in">

        {/* ─── Welcome ─── */}
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

        {/* ─── 1. AUDIT DE MON BRANDING (première section) ─── */}
        <div className="mb-6">
          <BrandingAuditCard
            audit={auditResult}
            loading={auditLoading}
            userId={user?.id}
            onRelaunch={() => {
              setAuditLoading(true);
              // Navigate to the audit page to relaunch
              navigate("/branding/audit");
            }}
          />
        </div>

        {/* ─── 2. ACCOMPAGNEMENT (si Now Pilot) ─── */}
        {isPilot && (
          <div className="mb-6">
            <div
              onClick={() => navigate("/accompagnement")}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3 cursor-pointer
                hover:shadow-card transition-all duration-200"
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

        {/* ─── 3. MES ESPACES DE TRAVAIL ─── */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 font-mono-ui">
            Mes espaces
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!channelsLoading && hasInstagram && (
              <SpaceCard
                emoji="📱" title="Instagram"
                desc="Audite ton profil, génère des contenus, optimise ta bio : tout pour qu'Instagram bosse pour toi."
                onClick={() => navigate("/instagram")}
              />
            )}
            {!channelsLoading && hasWebsite && (
              <SpaceCard
                emoji="🌐" title="Site Web"
                desc="Analyse ton site, améliore ton SEO, retravaille tes pages pour que Google te trouve."
                onClick={() => navigate("/site")}
              />
            )}
            {!channelsLoading && hasLinkedin && (
              <SpaceCard
                emoji="💼" title="LinkedIn"
                desc="Optimise ton profil, crée des posts pro, développe ton réseau : LinkedIn c'est pas ennuyeux, promis."
                onClick={() => navigate("/linkedin")}
              />
            )}
            {!channelsLoading && hasSeo && (
              <SpaceCard
                emoji="🔍" title="SEO"
                desc="Trouve tes mots-clés, optimise tes pages, améliore ta visibilité sans pub."
                onClick={() => window.open("https://referencement-seo.lovable.app/", "_blank")}
                external
              />
            )}
          </div>
        </div>

        {/* ─── 4. MON CALENDRIER + CRÉER ─── */}
        <div
          className="rounded-2xl p-6 mb-4 cursor-pointer group
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
                  hover:bg-accent hover:border-accent hover:text-accent-foreground
                  transition-all duration-150"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── BRANDING — Compact banner ─── */}
        <div className="mb-4">
          {brandingDone ? (
            <div
              onClick={() => navigate("/branding")}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 cursor-pointer
                hover:shadow-card hover:-translate-y-px transition-all duration-200"
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
              className="flex items-center justify-between rounded-2xl border border-accent/40 bg-accent/10 px-5 py-3.5 cursor-pointer
                hover:shadow-card hover:-translate-y-px transition-all duration-200"
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

        {/* ─── COMING SOON ─── */}
        {comingSoonChannels.length > 0 && (
          <div className="mb-8 rounded-2xl bg-gradient-to-r from-rose-pale via-card to-accent/10 border border-border p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🚀</span>
              <h3 className="font-display text-sm font-bold text-foreground">
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

/* ═══════════════════════════════════════════════════════════ */
/*  Sub-components                                            */
/* ═══════════════════════════════════════════════════════════ */

/* ── Space Card (with description, no progress bar) ── */
function SpaceCard({ emoji, title, desc, onClick, external }: {
  emoji: string; title: string; desc: string; onClick: () => void; external?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-4 cursor-pointer
        hover:shadow-card hover:-translate-y-px transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
          {external && <span className="text-[10px] font-mono-ui text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">Externe</span>}
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-primary" />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
