import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AiDisclaimerBanner from "@/components/AiDisclaimerBanner";
import { Progress } from "@/components/ui/progress";
import { ArrowRight } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { useActiveChannels, ALL_CHANNELS, type ChannelId } from "@/hooks/use-active-channels";
import { computePlan, type PlanData } from "@/lib/plan-engine";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";

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
  if (data.prospectCount > 0) actions.push({ label: "Relancer un prospect", emoji: "📩", route: "/contacts", priority: 4 });
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

/* ── Dynamic tip ── */
function getDynamicTip(data: DashboardData): string {
  if (data.brandingCompletion.total < 30) return "Commence par le Branding, c'est la base de tout le reste.";
  if (data.brandingCompletion.total < 100) return "Continue ton branding ! Plus il est complet, plus l'IA te connaît.";
  if (data.igAuditScore == null) return "Maintenant que ton branding est posé, fais ton audit pour savoir où tu en es.";
  if (data.calendarPostCount === 0) return "Tes fondations sont solides. C'est le moment de planifier tes premiers contenus !";
  return "Continue comme ça ! Pense à checker tes stats pour voir ce qui marche.";
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
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
  const tip = getDynamicTip(dashData);

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <AiDisclaimerBanner />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">

        {/* 1. Header */}
        <div className="mb-2">
          <h1 className="font-display text-[22px] sm:text-[30px] font-bold text-foreground">
            Hey <span className="text-primary">{profile.prenom}</span>, on avance sur quoi aujourd'hui ?
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Choisis un pilier ou lance une action rapide.</p>
        </div>

        {/* 2. Conseil du jour */}
        <div className="rounded-[10px] bg-rose-pale px-4 py-3 mb-6">
          <p className="text-[13px] text-muted-foreground">💡 <span className="font-bold text-bordeaux">{tip}</span></p>
        </div>

        {/* 3. Actions rapides */}
        <div className="mb-8">
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

        {/* 4. Section principale */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Instagram card */}
          {!channelsLoading && hasInstagram && (
            igCompletion >= 100
              ? <ChannelDailyCard channel="instagram" data={dashData} />
              : <ChannelSetupCard emoji="📱" title="Mon Instagram" completion={igCompletion}
                  nextStep={dashData.igAuditScore == null ? "Faire ton audit Instagram" : "Planifier ton premier contenu"}
                  route="/instagram" />
          )}

          {/* LinkedIn card */}
          {!channelsLoading && hasLinkedin && (
            liCompletion >= 100
              ? <ChannelDailyCard channel="linkedin" data={dashData} />
              : <ChannelSetupCard emoji="💼" title="Mon LinkedIn" completion={liCompletion}
                  nextStep={dashData.liAuditScore == null ? "Auditer ton profil LinkedIn" : "Optimiser ton profil"}
                  route="/linkedin" />
          )}

          {/* Site Web / Blog card */}
          {!channelsLoading && hasWebsite && <WebsiteCard />}

          {/* SEO card (external tool) */}
          {!channelsLoading && hasSeo && <SeoExternalCard />}

          {/* Branding (seulement si pas complété) */}
          {!brandingDone && (
            <ChannelSetupCard emoji="🎨" title="Mon Branding" completion={dashData.brandingCompletion.total}
              nextStep={brandingNextStep || "Continuer le branding"} route="/branding" />
          )}
        </div>

        {/* 5. Fondations (si branding complété) */}
        {brandingDone && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">🧱 Mes fondations</p>
            <div className="space-y-2">
              <FoundationRow emoji="🎨" label="Branding" detail="Complet" route="/branding" linkLabel="Voir ma synthèse →" />
              {dashData.igAuditScore != null && (
                <FoundationRow emoji="🔍" label="Audit Instagram" detail={`${dashData.igAuditScore}/100`} route="/instagram/audit" linkLabel="Voir l'audit →" />
              )}
              {dashData.liAuditScore != null && (
                <FoundationRow emoji="💼" label="Audit LinkedIn" detail={`${dashData.liAuditScore}/100`} route="/linkedin/audit" linkLabel="Voir l'audit →" />
              )}
            </div>
          </div>
        )}

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

        {/* 7. Lien ajouter un canal */}
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

/* ── Channel Setup Card (< 100%) ── */
function ChannelSetupCard({ emoji, title, completion, nextStep, route }: {
  emoji: string; title: string; completion: number; nextStep: string; route: string;
}) {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(route)}
      className="rounded-2xl border border-border bg-card p-4 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{completion}%</span>
      </div>
      <Progress value={completion} className="h-2 mb-2" />
      <p className="text-[13px] text-muted-foreground">
        Prochaine étape : <span className="text-foreground font-medium">{nextStep}</span>
      </p>
      <p className="text-sm font-semibold text-primary mt-1">Continuer →</p>
    </div>
  );
}

/* ── Channel Daily Card (100%) ── */
function ChannelDailyCard({ channel, data }: { channel: "instagram" | "linkedin"; data: DashboardData }) {
  const navigate = useNavigate();

  if (channel === "instagram") {
    return (
      <div onClick={() => navigate("/instagram")} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📱</span>
            <h3 className="font-display text-base font-bold text-foreground">Mon Instagram</h3>
          </div>
          <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-2 py-0.5 rounded-full">✅ Prêt</span>
        </div>
        <div className="space-y-1 mb-3 text-[13px] text-muted-foreground">
          {data.igAuditScore != null && <p>📊 Dernier audit : <span className="font-medium text-foreground">{data.igAuditScore}/100</span></p>}
          <p>📅 Cette semaine : <span className="font-medium text-foreground">{data.weekPostsPublished}/{data.weekPostsTotal} posts publiés</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MiniBtn label="✨ Créer un contenu" onClick={() => navigate("/instagram/creer")} />
          <MiniBtn label="🔍 Analyser mon profil" onClick={() => navigate("/instagram/audit")} />
          <MiniBtn label="💬 Routine d'engagement" onClick={() => navigate("/contacts")} />
          <MiniBtn label="📅 Calendrier édito" onClick={() => navigate("/calendrier")} />
          <MiniBtn label="📊 Mes stats" onClick={() => navigate("/instagram/stats")} />
        </div>
      </div>
    );
  }

  // LinkedIn
  return (
    <div onClick={() => navigate("/linkedin")} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">💼</span>
          <h3 className="font-display text-base font-bold text-foreground">Mon LinkedIn</h3>
        </div>
        <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-2 py-0.5 rounded-full">✅ Prêt</span>
      </div>
      <div className="space-y-1 mb-3 text-[13px] text-muted-foreground">
        {data.liAuditScore != null && <p>📊 Dernier audit : <span className="font-medium text-foreground">{data.liAuditScore}/100</span></p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <MiniBtn label="✨ Créer un post LI" onClick={() => navigate("/linkedin/post")} />
        <MiniBtn label="🔍 Refaire l'audit" onClick={() => navigate("/linkedin/audit")} />
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
  // TODO: could fetch actual page count from DB; for now show setup mode
  return (
    <div onClick={() => navigate("/site")}
      className="rounded-2xl border border-border bg-card p-4 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🌐</span>
          <h3 className="font-display text-base font-bold text-foreground">Mon Site Web</h3>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground mb-2">
        Rédige les textes de ton site : page d'accueil, à propos, pages de vente.
      </p>
      <div className="flex flex-wrap gap-2">
        <MiniBtn label="📄 Page d'accueil" onClick={() => navigate("/site/accueil")} />
        <MiniBtn label="📄 À propos" onClick={() => navigate("/site/a-propos")} />
        <MiniBtn label="📄 Témoignages" onClick={() => navigate("/site/temoignages")} />
      </div>
      <p className="text-sm font-semibold text-primary mt-2">Commencer →</p>
    </div>
  );
}

/* ── SEO External Card ── */
function SeoExternalCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🔍</span>
          <h3 className="font-display text-base font-bold text-foreground">Mon SEO</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">🔗 Externe</span>
      </div>
      <p className="text-[13px] text-muted-foreground mb-3">Ton SEO Toolkit est disponible en ligne.</p>
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
