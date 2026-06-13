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
  Calendar as CalendarIcon,
  MessageCircle,
  Palette,
  Search,
  Rocket,
} from "lucide-react";

import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useOnboardingMissions, OnboardingMission } from "@/hooks/use-onboarding-missions";

import WelcomeOverlay from "@/components/dashboard/WelcomeOverlay";
import GuidedTour from "@/components/GuidedTour";
import AppHeader from "@/components/AppHeader";
import { useToast } from "@/hooks/use-toast";
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
import { saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { getBrandingCompletion } from "@/lib/branding-completion";
import { toLocalDateStr } from "@/lib/utils";

/* ── Helpers ── */
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

function formatPill(format?: string | null, canal?: string | null): { label: string; cls: string } {
  const f = (format ?? "").toLowerCase();
  let label = "Post";
  if (f.includes("carrousel") || f.includes("carousel")) label = "Carrousel";
  else if (f.includes("story") || f.includes("storie")) label = "Story";
  else if (f.includes("reel")) label = "Reel";
  else if (f.includes("newsletter")) label = "Newsletter";
  else if (f.includes("pin")) label = "Pin";
  else if (f.includes("post")) label = "Post";
  const isInsta = (canal ?? "").toLowerCase().includes("insta");
  const cls = isInsta
    ? "bg-rose-soft text-bordeaux"
    : "bg-rose-pale text-bordeaux";
  return { label, cls };
}

/* ── Collapsible missions ── */
const COLLAPSED_KEY = "lac_missions_collapsed";
const FIRST_SEEN_KEY = "lac_missions_first_seen";

function OnboardingBanner({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { missions, completedCount, allDone, nextMission, dismissed, isLoading } = useOnboardingMissions();

  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === null) return false;
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

  const remaining = 5 - completedCount;
  const counterLabel = remaining === 1 ? `4/5 — plus qu'une !` : `${completedCount}/5`;

  return (
    <div
      data-tour="card-missions"
      className="rounded-2xl border border-yellow/40 bg-yellow/40 p-3 sm:p-4 shadow-sm"
    >
      <button onClick={toggle} className="w-full flex items-center gap-3">
        <Rocket className="h-4 w-4 text-foreground shrink-0" />
        <span className="font-heading text-sm font-bold text-foreground shrink-0">
          Tes premiers pas
        </span>
        <Progress value={(completedCount / 5) * 100} className="h-1.5 flex-1" />
        <span className="text-xs font-medium text-foreground/80 shrink-0">
          {counterLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-foreground/60 transition-transform shrink-0 ${collapsed ? "" : "rotate-180"}`}
        />
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-2">
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
          ? "border-green-200 bg-green-50/50 opacity-70"
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
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono-ui text-[11px] uppercase tracking-[0.18em] text-foreground/60 font-semibold mb-3">
      {children}
    </p>
  );
}

/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Ta prochaine étape", text: "Chaque jour, l'outil te recommande l'action qui aura le plus d'impact. Pas besoin de réfléchir par où commencer : c'est ici.", position: "bottom" as const },
  { target: "card-ideas", title: "Tes idées sauvegardées", text: "Toutes les idées que tu mets de côté atterrissent ici. Tu peux les transformer en contenu en un clic.", position: "top" as const },
  { target: "card-mini-actions", title: "Approfondir", text: "Affine ton identité de marque et lance des audits pour aller plus loin quand tu en as l'envie.", position: "top" as const },
  { target: "nav-creer", title: "Créer", text: "C'est ici que tu génères tes contenus : posts, carrousels, newsletters, Reels. L'IA connaît ton branding et écrit avec ta voix.", position: "bottom" as const },
  { target: "nav-calendrier", title: "Organiser", text: "Ton calendrier éditorial. Tu planifies tes contenus, tu vois ta semaine d'un coup d'œil, et tu sais toujours quoi poster.", position: "bottom" as const },
  { target: "card-missions", title: "Tes premiers pas", text: "5 petites étapes pour bien démarrer. Avance à ton rythme, coche au fur et à mesure. Rien d'obligatoire, tout est utile.", position: "bottom" as const },
  { target: "card-assistant", title: "Ta coach de com'", text: "Un doute, une question, besoin d'un coup de pouce ? Elle connaît ton projet et te répond de façon personnalisée.", position: "bottom" as const },
];

/* ── Channel pills (decorative) ── */
const CHANNEL_PILLS = [
  { label: "Instagram", icon: Instagram },
  { label: "LinkedIn", icon: Linkedin },
  { label: "Newsletter", icon: Mail },
  { label: "Pinterest", icon: Pin },
];

/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));
  const [welcomeDone, setWelcomeDone] = useState(() => localStorage.getItem("lac_welcome_seen") === "true");
  const [auditPickerOpen, setAuditPickerOpen] = useState(false);

  // Ideas count
  const workspaceId = activeWorkspace?.id ?? null;
  const wsFilter = useWorkspaceFilter();
  const { data: ideaCount = 0 } = useQuery<number>({
    queryKey: ["adaptive-home-ideas-count", user?.id, workspaceId],
    queryFn: async () => {
      if (!user) return 0;
      const filterCol = workspaceId ? "workspace_id" : "user_id";
      const filterVal = workspaceId ?? user.id;
      const { count } = await supabase
        .from("saved_ideas")
        .select("*", { count: "exact", head: true })
        .eq(filterCol, filterVal);
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // Upcoming posts (next 2)
  type UpcomingPost = { date: string; theme: string | null; format: string | null; canal: string | null };
  const { data: upcomingPosts = [], isLoading: upcomingLoading } = useQuery<UpcomingPost[]>({
    queryKey: ["adaptive-home-upcoming-posts", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      try {
        const todayStr = toLocalDateStr(new Date());
        const { data, error } = await (supabase as any)
          .from("calendar_posts")
          .select("date, theme, format, canal, status")
          .eq(wsFilter.column, wsFilter.value)
          .gte("date", todayStr)
          .neq("status", "idea")
          .order("date", { ascending: true })
          .limit(2);
        if (error) return [];
        return (data ?? []) as UpcomingPost[];
      } catch {
        return [];
      }
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
  });

  // Latest saved idea
  type LatestIdea = { titre: string | null; accroche_short: string | null; content_draft: string | null; created_at: string };
  const { data: latestIdea = null } = useQuery<LatestIdea | null>({
    queryKey: ["adaptive-home-latest-idea", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("saved_ideas")
          .select("titre, accroche_short, content_draft, created_at")
          .eq(wsFilter.column, wsFilter.value)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return null;
        return (data as LatestIdea | null) ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
  });

  // Branding completion percent
  const { data: brandingPercent = 0 } = useQuery<number>({
    queryKey: ["adaptive-home-branding-completion", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      try {
        const r = await getBrandingCompletion({ column: wsFilter.column, value: wsFilter.value });
        return r?.percent ?? 0;
      } catch {
        return 0;
      }
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
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

  useEffect(() => {
    const check = () => setWelcomeDone(localStorage.getItem("lac_welcome_seen") === "true");
    const interval = setInterval(check, 500);
    const fallback = setTimeout(() => setWelcomeDone(true), 2000);
    return () => { clearInterval(interval); clearTimeout(fallback); };
  }, []);

  const handleNavigate = (route: string) => {
    if (route === "__choose_audit__") {
      setAuditPickerOpen(true);
      return;
    }
    if (route === "/creer" && profileSummary.brandingTotal < 50) {
      toast({ title: "Tes contenus seront plus personnalisés une fois que tu auras posé tes bases 💡" });
    }
    navigate(route);
  };

  const handleAuditChoice = (route: "/instagram/audit" | "/site/audit") => {
    setAuditPickerOpen(false);
    navigate(route);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-[860px] mx-auto px-4 py-12">
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
      <main className="max-w-[860px] mx-auto px-4 py-8 space-y-8">

        {/* Bandeau premiers pas */}
        <OnboardingBanner onNavigate={handleNavigate} />

        {/* Greeting + pastille coach */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] text-foreground leading-tight">
              Salut {profileSummary.firstName} ! 👋
            </h1>
            <p className="text-muted-foreground mt-1 text-[15px]">
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

        {/* Hero */}
        <div
          data-tour="card-next-step"
          className="group rounded-2xl bg-gradient-to-br from-rose-pale/40 to-card border border-border/60 p-6 sm:p-8 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[3px] hover:border-border transition-all duration-[300ms] ease-out cursor-pointer"
          onClick={() => handleNavigate("/creer")}
        >
          <p className="font-mono-ui text-[10.5px] text-foreground/60 uppercase tracking-[0.12em] font-semibold mb-3">
            ✨ On crée quoi aujourd'hui&nbsp;?
          </p>

          <h2 className="font-display text-[26px] sm:text-3xl leading-[1.15] text-foreground">
            Créer mon prochain contenu
          </h2>

          <p className="text-[15px] text-foreground/70 mt-2 leading-relaxed line-clamp-1">
            {recommendation.explanation}
          </p>

          {/* Channel pills (decorative) */}
          <div className="flex flex-wrap gap-2 mt-4" aria-hidden="true">
            {CHANNEL_PILLS.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-pale border border-border/40 text-xs text-foreground/70 pointer-events-none"
              >
                <Icon className="h-3 w-3" />
                {label}
              </span>
            ))}
          </div>

          <Button
            className="mt-6 w-full sm:w-auto h-12 px-6 rounded-xl bg-bordeaux hover:bg-primary text-white text-[15px] font-semibold shadow-sm hover:shadow-md transition-all"
            onClick={(e) => { e.stopPropagation(); handleNavigate("/creer"); }}
          >
            Créer un contenu
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
              className="mt-3 ml-3 inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 bg-card/80 border border-border text-foreground/70 rounded-lg hover:border-primary/40 hover:text-primary transition-all"
            >
              🎬 Lancer la démo carrousel
            </button>
          )}
        </div>

        {/* Zone Piloter */}
        <section>
          <SectionLabel>Piloter</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleNavigate("/calendrier")}
              className="group text-left rounded-2xl bg-card border border-border/60 p-5 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[2px] hover:border-primary/30 transition-all duration-[250ms] ease-out"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-pale flex items-center justify-center shrink-0">
                  <CalendarIcon className="h-5 w-5 text-bordeaux" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-[17px] text-foreground leading-tight">
                    Voir mon calendrier
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Planifie tes contenus et garde une vue claire de ta semaine.
                  </p>
                  <div className="mt-3 space-y-1.5 min-h-[42px]">
                    {upcomingLoading ? (
                      <>
                        <div className="h-4 w-full bg-muted/50 rounded animate-pulse" />
                        <div className="h-4 w-3/4 bg-muted/50 rounded animate-pulse" />
                      </>
                    ) : upcomingPosts.length > 0 ? (
                      upcomingPosts.map((p, i) => {
                        const pill = formatPill(p.format, p.canal);
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs min-w-0">
                            <span className={`shrink-0 px-2 py-0.5 rounded-full ${pill.cls} text-[10px] font-semibold uppercase tracking-wide`}>
                              {pill.label}
                            </span>
                            <span className="shrink-0 text-foreground/70">{formatShortDate(p.date)}</span>
                            <span className="truncate text-muted-foreground">{p.theme ?? ""}</span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Rien de prévu pour l'instant — et si on créait ton prochain post ?
                      </p>
                    )}
                  </div>
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-bordeaux group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
              </div>
            </button>

            <button
              data-tour="card-ideas"
              onClick={() => navigate("/idees")}
              className="group text-left rounded-2xl bg-card border border-border/60 p-5 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[2px] hover:border-primary/30 transition-all duration-[250ms] ease-out"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono-ui text-[10px] text-foreground/60 uppercase tracking-[0.18em] font-semibold">
                  Inspiration
                </span>
                <span className="font-display italic text-bordeaux text-2xl leading-none">
                  {ideaCount}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-pale flex items-center justify-center shrink-0">
                  <Lightbulb className="h-5 w-5 text-bordeaux" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-[17px] text-foreground leading-tight">
                    Piocher dans mes idées
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {ideaCount > 0
                      ? "Retrouve tes pépites et transforme-les en posts."
                      : "Aucune idée encore — lance un brainstorm avec ta coach."}
                  </p>
                  {ideaCount > 0 && latestIdea && (
                    <div className="mt-3 rounded-lg bg-rose-pale/60 px-3 py-2">
                      <p className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-foreground/60 font-semibold">
                        Dernière pépite
                      </p>
                      <p className="text-xs italic text-foreground/80 truncate mt-0.5">
                        {latestIdea.titre ?? latestIdea.accroche_short ?? latestIdea.content_draft ?? ""}
                      </p>
                    </div>
                  )}
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-bordeaux group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
              </div>
            </button>
          </div>
        </section>

        {/* Zone Approfondir */}
        <section>
          <SectionLabel>Approfondir</SectionLabel>
          <div data-tour="card-mini-actions" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleNavigate("/branding")}
              className="group text-left rounded-2xl bg-card border border-border/60 p-5 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[2px] hover:border-primary/30 transition-all duration-[250ms] ease-out"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-pale flex items-center justify-center shrink-0">
                  <Palette className="h-5 w-5 text-bordeaux" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-[17px] text-foreground leading-tight">
                    Affiner mon identité de marque
                  </h3>
                  {brandingPercent === 100 ? (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Ton identité de marque est complète ✨
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Ton histoire, ton persona, ta voix.
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Progress value={brandingPercent} className="h-1.5 flex-1" />
                    <span className="font-mono-ui text-[11px] text-foreground/60 font-semibold shrink-0">
                      {brandingPercent}%
                    </span>
                  </div>
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-bordeaux group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
              </div>
            </button>

            <button
              onClick={() => handleNavigate("__choose_audit__")}
              className="group text-left rounded-2xl bg-card border border-border/60 p-5 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] hover:-translate-y-[2px] hover:border-primary/30 transition-all duration-[250ms] ease-out"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-pale flex items-center justify-center shrink-0">
                  <Search className="h-5 w-5 text-bordeaux" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-[17px] text-foreground leading-tight">
                    Lancer un audit
                  </h3>
                  {latestAudit ? (
                    <>
                      <p className="font-display italic text-bordeaux text-2xl leading-none mt-1">
                        {latestAudit.score_global}<span className="text-base text-foreground/50">/100</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Dernier audit {latestAudit.type} — {formatRelative(latestAudit.created_at)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Instagram ou site web.
                    </p>
                  )}
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-bordeaux group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
              </div>
            </button>
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

        {/* WelcomeOverlay + GuidedTour */}
        <WelcomeOverlay prenom={profileSummary.firstName} />

        {!tourDone && !isLoading && welcomeDone &&
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
