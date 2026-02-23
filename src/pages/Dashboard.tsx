import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AiDisclaimerBanner from "@/components/AiDisclaimerBanner";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Check, ExternalLink, Sparkles, MessageSquare, Mail, CalendarDays, Palette, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { useActiveChannels } from "@/hooks/use-active-channels";
import { computePlan, type PlanData, type PlanStep } from "@/lib/plan-engine";

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

/* ── Module definition ── */
interface DashboardModule {
  id: string;
  emoji: string;
  title: string;
  shortTitle: string;
  description: string;
  route: string;
  externalUrl?: string;
  channelRequired?: string; // if set, only show when this channel is active
  alwaysShow?: boolean;
  getCompletion?: (data: DashboardData) => number;
  getNextStep?: (data: DashboardData) => string | null;
  getCompletedDetail?: (data: DashboardData) => string | null;
  completedRoute?: string;
}

interface DashboardData {
  brandingCompletion: BrandingCompletion;
  igAuditScore: number | null;
  liAuditScore: number | null;
  contactCount: number;
  prospectCount: number;
  calendarPostCount: number;
  planData: PlanData | null;
}

const MODULES: DashboardModule[] = [
  {
    id: "branding",
    emoji: "🎨",
    title: "Mon Branding",
    shortTitle: "Branding",
    description: "Pose les bases de ta marque : ta mission, ton positionnement, ta cible, ton ton.",
    route: "/branding",
    alwaysShow: true,
    getCompletion: (d) => d.brandingCompletion.total,
    getNextStep: (d) => {
      if (d.brandingCompletion.storytelling === 0) return "Écrire ton histoire";
      if (d.brandingCompletion.persona === 0) return "Définir ta cible";
      if (d.brandingCompletion.proposition === 0) return "Affiner ta proposition de valeur";
      if (d.brandingCompletion.tone === 0) return "Définir ton ton & tes combats";
      if (d.brandingCompletion.strategy === 0) return "Créer ta stratégie de contenu";
      return null;
    },
    completedRoute: "/branding",
  },
  {
    id: "instagram",
    emoji: "📱",
    title: "Mon Instagram",
    shortTitle: "Instagram",
    description: "Optimise ton compte, trouve des idées de contenu, planifie tes posts.",
    route: "/instagram",
    channelRequired: "instagram",
    getCompletion: (d) => {
      let score = 0, total = 0;
      total += 1; if (d.igAuditScore != null) score += 1;
      total += 1; if (d.calendarPostCount > 0) score += 1;
      return total > 0 ? Math.round((score / total) * 100) : 0;
    },
    getNextStep: (d) => {
      if (d.igAuditScore == null) return "Faire ton audit Instagram";
      if (d.calendarPostCount === 0) return "Planifier ton premier contenu";
      return null;
    },
    getCompletedDetail: (d) => d.igAuditScore != null ? `Score audit : ${d.igAuditScore}/100` : null,
  },
  {
    id: "linkedin",
    emoji: "💼",
    title: "Mon LinkedIn",
    shortTitle: "LinkedIn",
    description: "Optimise ton profil et développe ton réseau professionnel.",
    route: "/linkedin",
    channelRequired: "linkedin",
    getCompletion: (d) => {
      if (d.liAuditScore != null) return 50;
      return 0;
    },
    getNextStep: (d) => {
      if (d.liAuditScore == null) return "Auditer ton profil LinkedIn";
      return "Optimiser ton profil";
    },
    getCompletedDetail: (d) => d.liAuditScore != null ? `Score : ${d.liAuditScore}/100` : null,
  },
  {
    id: "pinterest",
    emoji: "📌",
    title: "Mon Pinterest",
    shortTitle: "Pinterest",
    description: "Transforme tes visuels en trafic durable.",
    route: "/pinterest",
    channelRequired: "pinterest",
    getCompletion: () => 0,
    getNextStep: () => "Configurer ton compte",
  },
  {
    id: "calendar",
    emoji: "📅",
    title: "Mon Calendrier",
    shortTitle: "Calendrier",
    description: "Planifie tes contenus pour le mois. Vision claire de ce que tu publies.",
    route: "/calendrier",
    alwaysShow: true,
    getCompletion: (d) => d.calendarPostCount > 0 ? 100 : 0,
    getNextStep: () => "Créer ton calendrier éditorial",
    getCompletedDetail: (d) => d.calendarPostCount > 0 ? `${d.calendarPostCount} post${d.calendarPostCount > 1 ? "s" : ""} planifié${d.calendarPostCount > 1 ? "s" : ""}` : null,
  },
  {
    id: "contacts",
    emoji: "👥",
    title: "Mes Contacts",
    shortTitle: "Contacts",
    description: "Gère ton réseau stratégique et tes prospects.",
    route: "/contacts",
    alwaysShow: true,
    getCompletion: (d) => {
      if (d.contactCount >= 3 && d.prospectCount > 0) return 100;
      if (d.contactCount > 0 || d.prospectCount > 0) return 50;
      return 0;
    },
    getNextStep: (d) => {
      if (d.contactCount < 3) return "Ajouter tes contacts stratégiques";
      if (d.prospectCount === 0) return "Ajouter ton premier prospect";
      return null;
    },
  },
  {
    id: "content",
    emoji: "✨",
    title: "Créer un contenu",
    shortTitle: "Créer",
    description: "Génère un post, un carrousel ou un reel avec l'aide de l'IA.",
    route: "/instagram/creer",
    alwaysShow: true,
    getCompletion: () => 0, // Never "completed"
    getNextStep: () => null,
  },
  {
    id: "siteweb",
    emoji: "🌐",
    title: "Mon Site Web",
    shortTitle: "Site Web",
    description: "Rédige les textes de ton site : page d'accueil, à propos.",
    route: "/site",
    channelRequired: "site",
    getCompletion: () => 0,
    getNextStep: () => "Rédiger ta page d'accueil",
  },
];

/* ── Quick actions logic ── */
interface QuickAction {
  label: string;
  emoji: string;
  route: string;
  priority: number;
}

function getQuickActions(data: DashboardData): QuickAction[] {
  const actions: QuickAction[] = [];

  // Always: create content
  actions.push({ label: "Créer un post", emoji: "✨", route: "/instagram/creer", priority: 1 });

  // Contacts > 3 → comment
  if (data.contactCount >= 3) {
    actions.push({ label: "Commenter 3 comptes", emoji: "💬", route: "/contacts", priority: 2 });
  }

  // Prospects pending
  if (data.prospectCount > 0) {
    actions.push({ label: "Relancer un prospect", emoji: "📩", route: "/contacts", priority: 3 });
  }

  // Calendar has posts
  if (data.calendarPostCount > 0) {
    actions.push({ label: "Voir mon calendrier", emoji: "📅", route: "/calendrier", priority: 4 });
  }

  // Branding not done
  if (data.brandingCompletion.total < 100) {
    actions.push({ label: "Continuer mon branding", emoji: "🎨", route: "/branding", priority: 5 });
  }

  // No audit
  if (data.igAuditScore == null) {
    actions.push({ label: "Faire mon audit", emoji: "🔍", route: "/instagram/audit", priority: 6 });
  }

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

/* ── Main component ── */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dashData, setDashData] = useState<DashboardData>({
    brandingCompletion: { storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 },
    igAuditScore: null,
    liAuditScore: null,
    contactCount: 0,
    prospectCount: 0,
    calendarPostCount: 0,
    planData: null,
  });
  const { hasInstagram, hasLinkedin, hasPinterest, hasWebsite, loading: channelsLoading, channels } = useActiveChannels();

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const [profRes, brandingData, igAuditRes, liAuditRes, contactRes, prospectRes, calendarRes, planConfigRes] = await Promise.all([
        supabase.from("profiles").select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date").eq("user_id", user.id).single(),
        fetchBrandingData(user.id),
        supabase.from("instagram_audit").select("score_global").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("linkedin_audit").select("score_global").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("contact_type", "network"),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("contact_type", "prospect"),
        supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
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
        calendarPostCount: calendarRes.count ?? 0,
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

  // Filter modules by active channels
  const channelMap: Record<string, boolean> = {
    instagram: hasInstagram,
    linkedin: hasLinkedin,
    pinterest: hasPinterest,
    site: hasWebsite,
  };

  const visibleModules = channelsLoading
    ? MODULES.filter(m => m.alwaysShow)
    : MODULES.filter(m => {
        if (m.alwaysShow) return true;
        if (m.channelRequired) return channelMap[m.channelRequired] ?? false;
        return true;
      });

  // Split into active / completed
  const activeModules: (DashboardModule & { completion: number })[] = [];
  const completedModules: (DashboardModule & { completion: number })[] = [];

  for (const mod of visibleModules) {
    const completion = mod.getCompletion?.(dashData) ?? 0;
    // "Créer un contenu" is always active, never completed
    if (mod.id === "content") {
      activeModules.push({ ...mod, completion: 0 });
    } else if (completion >= 100) {
      completedModules.push({ ...mod, completion });
    } else {
      activeModules.push({ ...mod, completion });
    }
  }

  // Sort active: in progress first (higher completion), then todo
  activeModules.sort((a, b) => {
    // content always at end of active
    if (a.id === "content") return 1;
    if (b.id === "content") return -1;
    // In progress before todo
    if (a.completion > 0 && b.completion === 0) return -1;
    if (a.completion === 0 && b.completion > 0) return 1;
    // Higher completion first
    return b.completion - a.completion;
  });

  const quickActions = getQuickActions(dashData);
  const tip = getDynamicTip(dashData);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <AiDisclaimerBanner />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">

        {/* Header */}
        <div className="mb-2">
          <h1 className="font-display text-[22px] sm:text-[30px] font-bold text-foreground">
            Hey <span className="text-primary">{profile.prenom}</span>, on avance sur quoi aujourd'hui ?
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Choisis un pilier ou lance une action rapide.
          </p>
        </div>

        {/* Dynamic tip */}
        <div className="rounded-[10px] bg-rose-pale px-4 py-3 mb-6">
          <p className="text-[13px] text-muted-foreground">
            💡 <span className="font-bold text-bordeaux">{tip}</span>
          </p>
        </div>

        {/* Quick actions */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">⚡ Actions rapides</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
            {quickActions.map((action) => (
              <button
                key={action.route + action.label}
                onClick={() => navigate(action.route)}
                className="shrink-0 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 hover:border-primary/50 transition-colors"
              >
                <span>{action.emoji}</span>
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active modules grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {activeModules.map((mod) => (
            <ModuleCard key={mod.id} mod={mod} data={dashData} />
          ))}
        </div>

        {/* Completed modules */}
        {completedModules.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">✅ Terminés</p>
            <div className="space-y-2">
              {completedModules.map((mod) => (
                <CompletedModuleRow key={mod.id} mod={mod} data={dashData} />
              ))}
            </div>
          </div>
        )}

        {/* Add channel link */}
        <div className="text-center py-4">
          <Link to="/profil" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            📱 Tu veux ajouter un canal ? <span className="underline">Modifier dans le profil →</span>
          </Link>
        </div>
      </main>
    </div>
  );
}

/* ── Active Module Card (large or medium) ── */
function ModuleCard({ mod, data }: { mod: DashboardModule & { completion: number }; data: DashboardData }) {
  const navigate = useNavigate();
  const completion = mod.completion;
  const nextStep = mod.getNextStep?.(data);
  const isNotStarted = completion === 0 && mod.id !== "content";
  const isInProgress = completion > 0 && completion < 100;

  // "Créer un contenu" special card
  if (mod.id === "content") {
    return (
      <div
        onClick={() => navigate(mod.route)}
        className="rounded-2xl border-2 border-primary/30 bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all"
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{mod.emoji}</span>
          <h3 className="font-display text-lg font-bold text-foreground">{mod.title}</h3>
        </div>
        <p className="text-[13px] text-muted-foreground mb-3">{mod.description}</p>
        <p className="text-sm font-semibold text-primary">Créer un contenu →</p>
      </div>
    );
  }

  // Large card (not started)
  if (isNotStarted) {
    return (
      <div
        onClick={() => mod.externalUrl ? window.open(mod.externalUrl, "_blank") : navigate(mod.route)}
        className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all"
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{mod.emoji}</span>
          <h3 className="font-display text-lg font-bold text-foreground">{mod.title}</h3>
        </div>
        <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{mod.description}</p>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-muted-foreground">{mod.shortTitle} : 0% complété</span>
          </div>
          <Progress value={0} className="h-2" />
        </div>
        <p className="text-sm font-semibold text-primary flex items-center gap-1">
          {nextStep || `Commencer ${mod.shortTitle}`} <ArrowRight className="h-3.5 w-3.5" />
        </p>
      </div>
    );
  }

  // Medium card (in progress)
  return (
    <div
      onClick={() => navigate(mod.route)}
      className="rounded-2xl border border-border bg-card p-4 cursor-pointer hover:shadow-card-hover hover:-translate-y-px transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{mod.emoji}</span>
          <h3 className="font-display text-base font-bold text-foreground">{mod.title}</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{completion}%</span>
      </div>
      <Progress value={completion} className="h-2 mb-2" />
      {nextStep && (
        <p className="text-[13px] text-muted-foreground">
          Prochaine étape : <span className="text-foreground font-medium">{nextStep}</span>
        </p>
      )}
      <p className="text-sm font-semibold text-primary mt-1">Continuer →</p>
    </div>
  );
}

/* ── Completed module row (mini) ── */
function CompletedModuleRow({ mod, data }: { mod: DashboardModule & { completion: number }; data: DashboardData }) {
  const navigate = useNavigate();
  const detail = mod.getCompletedDetail?.(data);
  const route = mod.completedRoute || mod.route;

  return (
    <div
      onClick={() => navigate(route)}
      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{mod.emoji}</span>
        <span className="text-sm font-semibold text-foreground">{mod.shortTitle}</span>
        <span className="text-xs font-semibold text-[#2E7D32] bg-[#E8F5E9] px-1.5 py-0.5 rounded">✅ Complet</span>
        {detail && <span className="text-xs text-muted-foreground hidden sm:inline">{detail}</span>}
      </div>
      <span className="text-xs text-primary font-medium">Voir →</span>
    </div>
  );
}
