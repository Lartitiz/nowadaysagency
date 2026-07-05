import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  Pin,
  Lightbulb,
  MessageCircle,
  Palette,
  Search,
  Rocket,
  Recycle as RecycleIcon,
  Upload,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { isAurianaDemoEmail, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";
import { weeklyIdeas } from "@/lib/weekly-ideas";
import RecycleDialog from "@/components/dashboard/RecycleDialog";
import { saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { getBrandingCompletionWithStatus } from "@/lib/branding-completion";
import { toLocalDateStr } from "@/lib/utils";

/* ── Helpers ── */
function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  return `il y a ${diff} jours`;
}

/* ── Score → couleur par palier (sémantique : vert ≥75, ambre 50-74, rouge <50) ── */
function scoreToneClass(score: number): string {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}

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
            <p className="font-mono-ui text-2xs uppercase tracking-[0.14em] text-foreground/50 font-semibold">
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
      <span className="font-mono-ui text-2xs uppercase tracking-[0.18em] text-foreground/60 font-semibold">
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

/* ── Ligne éditoriale : remplace les cartes-boîtes par une ligne calme
      (titre serif + description) avec la donnée vivante en métadonnée à droite ── */
function EditorialRow({
  icon: Icon,
  title,
  desc,
  meta,
  onClick,
  dataTour,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  desc: React.ReactNode;
  meta?: React.ReactNode;
  onClick: () => void;
  dataTour?: string;
}) {
  return (
    <button
      data-tour={dataTour}
      onClick={onClick}
      className="group w-full text-left flex items-center gap-4 py-5 px-3 -mx-3 rounded-xl hover:bg-rose-pale/50 transition-colors duration-200"
    >
      <Icon className="h-[18px] w-[18px] text-bordeaux/70 shrink-0" strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-lg text-foreground leading-snug">{title}</h3>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed truncate">{desc}</p>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        {meta}
        <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-bordeaux group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}

/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Ta prochaine étape", text: "Chaque jour, l'outil te recommande l'action qui aura le plus d'impact. Pas besoin de réfléchir par où commencer : c'est ici.", position: "bottom" as const },
  { target: "card-ideas", title: "Tes idées sauvegardées", text: "Toutes les idées que tu mets de côté atterrissent ici. Tu peux les transformer en contenu en un clic.", position: "top" as const },
  { target: "card-mini-actions", title: "Approfondir", text: "Affine ton identité de marque et lance des audits pour aller plus loin quand tu en as l'envie.", position: "top" as const },
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
  const { activeWorkspace } = useWorkspace();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));
  const [auditPickerOpen, setAuditPickerOpen] = useState(false);
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

  // Latest saved idea
  type LatestIdea = { titre: string | null; accroche_short: string | null; content_draft: string | null; created_at: string };
  const { data: latestIdea = null, isError: latestIdeaError } = useQuery<LatestIdea | null>({
    queryKey: ["adaptive-home-latest-idea", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("saved_ideas")
        .select("titre, accroche_short, content_draft, created_at")
        .eq(wsFilter.column, wsFilter.value)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as LatestIdea | null) ?? null;
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // Branding completion percent. On laisse l'erreur de chargement remonter
  // (isError) plutôt que de la masquer en 0 % : un branding complet ne doit pas
  // afficher une barre vide à 0 % sur une simple erreur réseau transitoire.
  const { data: brandingPercent = 0, isError: brandingLoadError } = useQuery<number>({
    queryKey: ["adaptive-home-branding-completion", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      const r = await getBrandingCompletionWithStatus({ column: wsFilter.column, value: wsFilter.value });
      if (r.error) throw r.error;
      return r.percent;
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // Latest audit (most recent between instagram_audit and website_audit)
  type LatestAudit = { score_global: number; created_at: string; type: "Instagram" | "Site" } | null;
  const { data: latestAudit = null } = useQuery<LatestAudit>({
    queryKey: ["adaptive-home-latest-audit", wsFilter.column, wsFilter.value],
    queryFn: async (): Promise<LatestAudit> => {
      try {
        const [ig, web] = await Promise.all([
          (supabase as any)
            .from("instagram_audit")
            .select("score_global, created_at")
            .eq(wsFilter.column, wsFilter.value)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (supabase as any)
            .from("website_audit")
            .select("score_global, created_at")
            .eq(wsFilter.column, wsFilter.value)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const igRow = ig.data as { score_global: number | null; created_at: string } | null;
        const webRow = web.data as { score_global: number | null; created_at: string } | null;
        const candidates: NonNullable<LatestAudit>[] = [];
        if (igRow && igRow.score_global != null) {
          candidates.push({ score_global: igRow.score_global, created_at: igRow.created_at, type: "Instagram" });
        }
        if (webRow && webRow.score_global != null) {
          candidates.push({ score_global: webRow.score_global, created_at: webRow.created_at, type: "Site" });
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return candidates[0];
      } catch {
        return null;
      }
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
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
    if (route === "__choose_audit__") {
      setAuditPickerOpen(true);
      return;
    }
    if (route === "/creer" && profileSummary.brandingTotal < 50) {
      toast("Tes contenus seront plus personnalisés une fois que tu auras posé tes bases 💡");
    }
    navigate(route);
  };

  const handleAuditChoice = (route: "/instagram/audit" | "/site/audit") => {
    setAuditPickerOpen(false);
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
      <main className="max-w-[720px] mx-auto px-4 py-10 space-y-10">

        {/* Erreur de chargement visible (pattern /profil) : sans ce bandeau, un
            réseau qui tombe affiche un dashboard « normal » à zéro, sans indice. */}
        {(ideasError || postsError || latestIdeaError || brandingLoadError) && (
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

        {/* Bandeau premiers pas */}
        <OnboardingBanner onNavigate={handleNavigate} />

        {/* Greeting + pastille coach */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl text-foreground leading-tight">
              Salut {profileSummary.firstName} ! 👋
            </h1>
            <p className="text-muted-foreground mt-2 text-base">
              Prête à faire rayonner tes projets ?
            </p>
          </div>

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
          className="group rounded-3xl bg-[hsl(var(--bento-dark))] p-7 sm:p-10 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] transition-shadow duration-[300ms] ease-out cursor-pointer"
          onClick={() => handleNavigate(hero.route)}
        >
          <p className="font-mono-ui text-2xs text-rose-soft/90 uppercase tracking-[0.14em] font-semibold mb-4">
            {hero.eyebrow}
          </p>

          <h2 className="font-display text-[28px] sm:text-[32px] leading-[1.15] text-white">
            {hero.title}
          </h2>

          <p className="text-base text-white/70 mt-3 leading-relaxed line-clamp-2">
            {cleanText(recommendation.explanation)}
          </p>

          {/* Raccourcis création par canal — uniquement une fois lancée */}
          {hero.showChannels && (
            <div className="flex flex-wrap gap-2 mt-4">
              {CHANNEL_PILLS.map(({ label, icon: Icon, canal }) => (
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
            </div>
          )}

          <Button
            className="mt-7 w-full sm:w-auto h-12 px-7 rounded-full bg-white hover:bg-rose-pale text-bordeaux text-base font-semibold shadow-sm hover:shadow-md transition-all"
            onClick={(e) => { e.stopPropagation(); handleNavigate(hero.route); }}
          >
            {hero.ctaLabel}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>

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
            déterministe que l'e-mail (weekly-ideas.ts ↔ email-trigger). */}
        <section>
          <SectionLabel hint="le rendez-vous de ton rituel — un clic et on la rédige ensemble">
            Tes idées de la semaine
          </SectionLabel>
          <div className="divide-y divide-border/70">
            {weeklyIdeas().map((idea) => (
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

        {/* Zone Piloter — liste éditoriale : la donnée vivante porte une
            étiquette (« Dernière pépite ») au lieu de se fondre dans la phrase */}
        <section>
          <SectionLabel hint="ton quotidien">Piloter</SectionLabel>
          <div className="divide-y divide-border/70">
            <EditorialRow
              dataTour="card-ideas"
              icon={Lightbulb}
              title={
                <>
                  Piocher dans mes idées
                  {ideaCount > 0 && (
                    <span className="font-body text-sm text-muted-foreground not-italic">
                      {" "}— {ideaCount} en réserve
                    </span>
                  )}
                </>
              }
              desc={
                ideaCount > 0 && latestIdea ? (
                  <>
                    <span className="inline-block align-middle mr-1.5 px-2 py-px rounded-full bg-rose-soft text-bordeaux text-[11px] font-medium">
                      Dernière pépite
                    </span>
                    {latestIdea.titre ?? latestIdea.accroche_short ?? latestIdea.content_draft ?? ""}
                  </>
                ) : (
                  "Aucune idée encore — lance un brainstorm avec ta coach."
                )
              }
              onClick={() => navigate("/idees")}
            />
            <EditorialRow
              icon={Upload}
              title="Programmer un contenu déjà prêt"
              desc="Un visuel fait sur Canva ou ailleurs ? Pose-le sur une date."
              onClick={() => navigate("/calendrier?import=1")}
            />
            <EditorialRow
              icon={RecycleIcon}
              title="Recycler un contenu qui a marché"
              desc="Tes meilleurs posts méritent une seconde vie — on les ré-angle."
              onClick={() => setRecycleOpen(true)}
            />
          </div>
        </section>

        {/* Zone Approfondir — même liste, un ton en dessous */}
        <section>
          <SectionLabel hint="quand tu veux aller plus loin">Approfondir</SectionLabel>
          <div data-tour="card-mini-actions" className="divide-y divide-border/70">
            <EditorialRow
              icon={Palette}
              title="Affiner mon identité de marque"
              desc={
                brandingPercent === 100
                  ? "Ton identité de marque est complète ✨"
                  : "Ton histoire, ton persona, ta voix."
              }
              meta={
                !brandingLoadError && brandingPercent < 100 ? (
                  <span className="flex items-center gap-2">
                    <Progress value={brandingPercent} className="h-1 w-16 hidden sm:block" />
                    <span className="font-mono-ui text-2xs text-foreground/60 font-semibold">
                      {brandingPercent}%
                    </span>
                  </span>
                ) : undefined
              }
              onClick={() => handleNavigate("/branding")}
            />
            <EditorialRow
              icon={Search}
              title="Lancer un audit"
              desc={
                latestAudit
                  ? `Dernier audit ${latestAudit.type} — ${formatRelative(latestAudit.created_at)}`
                  : "Instagram ou site web."
              }
              meta={
                latestAudit ? (
                  <span className={`font-display italic text-xl leading-none ${scoreToneClass(latestAudit.score_global)}`}>
                    {latestAudit.score_global}
                    <span className="text-sm text-foreground/50">/100</span>
                  </span>
                ) : undefined
              }
              onClick={() => handleNavigate("__choose_audit__")}
            />
          </div>
        </section>

        {/* Audit picker */}
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

        {/* Recyclage intelligent : les meilleurs posts passés, prêts à ré-angler */}
        <RecycleDialog open={recycleOpen} onOpenChange={setRecycleOpen} />

        {/* Guidage 1re visite : UNIQUEMENT le coachmark GuidedTour. L'overlay
            4 slides « ton espace est prêt » a été retiré (validé Laetitia 04/07) :
            c'était le 3e récapitulatif d'affilée après le diagnostic et le welcome. */}
        {!tourDone && !isLoading &&
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
