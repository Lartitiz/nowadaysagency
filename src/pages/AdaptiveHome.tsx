import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Instagram,
  Linkedin,
  Mail,
  Pin,
  Lightbulb,
  MessageCircle,
  Rocket,
  Recycle as RecycleIcon,
  Send,
  Image as ImageIcon,
  Bell,
  type LucideIcon,
} from "lucide-react";

import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useOnboardingMissions, OnboardingMission } from "@/hooks/use-onboarding-missions";

import GuidedTour from "@/components/GuidedTour";
import AppHeader from "@/components/AppHeader";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import { isAurianaDemoEmail, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";
import { weeklyIdeas } from "@/lib/weekly-ideas";
import RecycleDialog from "@/components/dashboard/RecycleDialog";
import { saveFlowState, clearFlowState } from "@/hooks/use-flow-persistence";
import ClientOnboarding from "@/components/client/ClientOnboarding";
import { useStorytellingList, usePersona } from "@/hooks/use-branding";
import { useBrandProfile } from "@/hooks/use-profile";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useUserPlan } from "@/hooks/use-user-plan";
import { toLocalDateStr } from "@/lib/utils";
import { getSignedPhotoUrls } from "@/lib/photo-storage";
import { trackPorte } from "@/lib/dashboard-portes";
import { useIsMobile } from "@/hooks/use-mobile";

/* ── Collapsible missions ── */
const COLLAPSED_KEY = "lac_missions_collapsed";
const FIRST_SEEN_KEY = "lac_missions_first_seen";

/**
 * `heroOwnsNextStep` : quand le hero affiche déjà « 👉 Ta prochaine étape », le
 * bandeau ne doit PAS en annoncer une seconde. Constaté le 01/08 : le bandeau
 * disait « Crée ton premier contenu » et le hero, 150 px plus bas, « Fais ton
 * diagnostic » — deux réponses à la même question. Une seule voix à la fois :
 * ici le bandeau retombe sur sa barre de progression (et son dépliage).
 */
function OnboardingBanner({ onNavigate, heroOwnsNextStep }: { onNavigate: (route: string) => void; heroOwnsNextStep: boolean }) {
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
        <span className="font-body text-sm font-bold text-foreground shrink-0">
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
      {collapsed && nextMission && !heroOwnsNextStep && (
        <button
          onClick={() => onNavigate(nextMission.route)}
          className="mt-3 w-full text-left rounded-xl border border-primary/40 bg-card p-3 flex items-center gap-3 hover:border-primary transition-colors"
        >
          <span className="text-lg shrink-0">{nextMission.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-mono-ui text-2xs uppercase tracking-[0.14em] text-foreground/70 font-semibold">
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
      <span className="font-mono-ui text-2xs uppercase tracking-[0.18em] text-foreground/70 font-semibold">
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

/* ── Raccourci « Piloter » : pill compacte — la version ligne éditoriale
      (titre + description) repoussait le dashboard à deux écrans ── */
function PilotPill({
  icon: Icon,
  label,
  count,
  onClick,
  dataTour,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  onClick: () => void;
  dataTour?: string;
}) {
  return (
    <button
      data-tour={dataTour}
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border text-sm text-foreground hover:border-bordeaux/40 hover:text-bordeaux transition-colors"
    >
      <Icon className="h-4 w-4 text-bordeaux/70 shrink-0" strokeWidth={1.75} />
      {label}
      {count != null && count > 0 && (
        <span className="font-mono-ui text-2xs font-semibold text-bordeaux bg-rose-soft rounded-full px-1.5 py-px">
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Ta prochaine étape", text: "Chaque jour, l'outil te recommande l'action qui aura le plus d'impact. Pas besoin de réfléchir par où commencer : c'est ici.", position: "bottom" as const },
  { target: "card-ideas", title: "Tes idées sauvegardées", text: "Toutes les idées que tu mets de côté atterrissent ici. Tu peux les transformer en contenu en un clic.", position: "top" as const },
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

/* ── Porte « Programmer » ── */
interface UpcomingPost {
  date: string;
  theme: string | null;
  format: string | null;
  canal: string | null;
  status: string | null;
  auto_publish: boolean | null;
  scheduled_publish_at: string | null;
}

const CANAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  newsletter: "Newsletter",
  pinterest: "Pinterest",
};

/** « lun. 10 » — sans année ni ponctuation superflue. */
function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function publishHour(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeWorkspace, activeRole } = useWorkspace();
  const { isBinome } = useUserPlan();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();
  const isMobile = useIsMobile();
  // Au doigt, chaque ligne de rappel coûte ~30 px devant le hero : on en montre
  // 2 (le lien « voir les N autres » emmène au calendrier), 5 au large.
  const FORGOTTEN_PREVIEW = isMobile ? 2 : 5;

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));
  const [recycleOpen, setRecycleOpen] = useState(false);

  // Le flag « tour vu » vit en localStorage (par navigateur) : sur un nouvel
  // appareil il est vide. On ne remontre donc le tour qu'aux comptes récents —
  // une utilisatrice installée qui change de navigateur ne le revoit pas.
  const isRecentAccount = user?.created_at
    ? Date.now() - new Date(user.created_at).getTime() < 14 * 24 * 3600 * 1000
    : false;

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

  // Photos : compteur de la pill « Mes photos » (accès direct à la bibliothèque).
  // La bibliothèque est toujours cloisonnée par workspace_id (cf. useUserPhotos).
  const { data: photoCount = 0 } = useQuery<number>({
    queryKey: ["adaptive-home-photos-count", user?.id, workspaceId],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("user_photos")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId ?? user.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // Contenus à venir : le prochain qui part + de quoi dire ce qui suit.
  // auto_publish/scheduled_publish_at distinguent « partira tout seul » d'un
  // simple « prévu au calendrier » (la carte Programmer ne doit pas sur-promettre).
  const { data: upcomingPosts = [], isLoading: upcomingLoading, isError: postsError } = useQuery<UpcomingPost[]>({
    queryKey: ["adaptive-home-upcoming-posts-week", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      const todayStr = toLocalDateStr(new Date());
      const { data, error } = await (supabase as any)
        .from("calendar_posts")
        .select("date, theme, format, canal, status, auto_publish, scheduled_publish_at")
        .eq(wsFilter.column, wsFilter.value)
        .gte("date", todayStr)
        .neq("status", "idea")
        .order("date", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as UpcomingPost[];
    },
    enabled: !!wsFilter.value,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // Vignettes de la porte « Mes photos » : les 3 dernières, en URL signées
  // (bucket privé). Un échec de signature n'est pas bloquant : la carte
  // retombe sur le compteur seul.
  const { data: photoThumbs = [] } = useQuery<string[]>({
    queryKey: ["adaptive-home-photo-thumbs", workspaceId ?? user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_photos")
        .select("storage_path, status")
        .eq("workspace_id", workspaceId ?? user!.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      const paths = (data ?? []).map((p) => p.storage_path).filter(Boolean) as string[];
      if (!paths.length) return [];
      const map = await getSignedPhotoUrls(paths, 3600);
      return paths.map((p) => map.get(p)).filter(Boolean) as string[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Brouillons oubliés : contenus réels (content_draft rempli), posés au
  // calendrier via « Juste dans le calendrier » (audit de simplicité, la plus
  // grosse chute du tunnel : 26 % au calendrier → 2 % publiés), dont la date est
  // passée sans jamais être partis — ni auto-publiés (publish_status), ni cochés
  // publiés à la main. Sans ce rappel, rien ne ramène jamais dessus.
  const { data: forgottenDrafts = [] } = useQuery<
    { id: string; date: string; canal: string | null; theme: string | null }[]
  >({
    queryKey: ["adaptive-home-forgotten-drafts", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      const todayStr = toLocalDateStr(new Date());
      const { data, error } = await (supabase as any)
        .from("calendar_posts")
        // `theme` = le sujet du contenu. Sans lui, les lignes se lisaient toutes
        // « 15 août · instagram » et rien ne les distinguait (regard du 17/08).
        .select("id, date, canal, theme")
        .eq(wsFilter.column, wsFilter.value)
        .lt("date", todayStr)
        .neq("status", "published")
        .not("content_draft", "is", null)
        .neq("content_draft", "")
        .or("publish_status.is.null,publish_status.eq.failed")
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as { id: string; date: string; canal: string | null; theme: string | null }[];
    },
    enabled: !!wsFilter.value,
    staleTime: 5 * 60 * 1000,
    retry: 1,
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
    if (route.startsWith("/creer") && profileSummary.brandingTotal < 50) {
      toast("Tes contenus seront plus personnalisés une fois que tu auras posé tes bases 💡");
    }
    navigate(route);
  };

  // Compteurs des trois portes : le clic est compté PUIS on navigue (l'insert
  // est fire-and-forget, il ne retarde jamais la navigation).
  const porte = (name: Parameters<typeof trackPorte>[0]) =>
    trackPorte(name, user?.id, workspaceId);

  const nextPost = upcomingPosts[0] ?? null;
  const nextAuto = !!nextPost?.auto_publish && !!nextPost?.scheduled_publish_at;

  // ── Espace cliente vide (rôle manager) : l'onboarding client vivait dans la
  // vue complète supprimée ; il est re-hébergé ici pour ne pas perdre le geste.
  const isClientWorkspace = !!activeWorkspace && activeRole === "manager";
  const { data: storytellingList } = useStorytellingList();
  const { data: personaData } = usePersona();
  const { data: brandProfileData } = useBrandProfile();
  const skippedOnboarding = isClientWorkspace && typeof window !== "undefined" &&
    localStorage.getItem(`onboarding_skipped_${activeWorkspace?.id}`) === "true";
  const clientHasData = !isClientWorkspace || skippedOnboarding ? true :
    (Array.isArray(storytellingList) ? storytellingList.length : 0) + (personaData ? 1 : 0) > 0 || !!brandProfileData;

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
        // ?new=1 sinon un brouillon terminé restauré silencieusement atterrit
        // direct sur l'étape résultat, sans aucun champ pour repartir de zéro.
        route: "/creer?new=1",
        showChannels: true,
      }
    : {
        eyebrow: "👉 Ta prochaine étape",
        title: cleanText(recommendation.title),
        ctaLabel: cleanText(recommendation.ctaLabel).replace(/\s*→\s*$/, ""),
        route: recommendation.ctaRoute,
        showChannels: false,
      };

  if (isClientWorkspace && !clientHasData) {
    return (
      <div className="min-h-screen bg-rose-pale">
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
            queryClient.invalidateQueries();
          }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-rose-pale">
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
    <div className="min-h-screen bg-rose-pale">
      <AppHeader />
      {/* Rythme resserré au doigt (py-5/space-y-5) : au large on garde l'air
          d'origine. Cumulé aux 2 lignes de rappel, ça ramène le CTA du hero
          AU-DESSUS de la barre d'onglets sur un 390×844 (regard du 17/08). */}
      <main className="max-w-[720px] mx-auto px-4 py-5 sm:py-8 space-y-5 sm:space-y-7">

        {/* Erreur de chargement visible (pattern /profil) : sans ce bandeau, un
            réseau qui tombe affiche un dashboard « normal » à zéro, sans indice. */}
        {(ideasError || postsError) && (
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

        {/* Bandeau premiers pas — owner uniquement : les missions guident le
            setup de SON espace. Un·e manager sur l'espace d'une cliente ne doit
            pas voir « Tes premiers pas » (audit workspace/membres 09/07). */}
        {activeRole === "owner" && (
          <OnboardingBanner onNavigate={handleNavigate} heroOwnsNextStep={!launched} />
        )}

        {/* Rappel des brouillons oubliés — la case « premier contenu » et le
            calendrier savent déjà qu'un contenu existe ; ce qu'ils ne disaient
            jamais, c'est qu'il est resté sans suite. Discret (pas de couleur
            d'alerte, c'est un oubli, pas une erreur), toujours au-dessus du
            hero pour rester visible sans dominer la page.
            Chaque ligne mène directement au post concerné (?date=&post=), au
            lieu de renvoyer vers un calendrier générique qu'il fallait fouiller
            mois par mois (audit du 14/08 : jusqu'à 3 semaines pour retomber dessus).
            Aperçu court (2 lignes) : au doigt, 5 lignes + le bandeau premiers pas
            repoussaient le CTA du hero SOUS la barre d'onglets (regard du 17/08). */}
        {forgottenDrafts.length > 0 && (
          <div className="w-full rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {forgottenDrafts.length === 1
                    ? "1 contenu prêt, jamais publié"
                    : `${forgottenDrafts.length} contenus prêts, jamais publiés`}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Posés au calendrier, leur date est passée sans qu'ils partent.
                </span>
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-0.5">
              {forgottenDrafts.slice(0, FORGOTTEN_PREVIEW).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => {
                    porte("programmer");
                    navigate(`/calendrier?date=${post.date}&post=${post.id}`);
                  }}
                  className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {post.theme?.trim() ? (
                      <>
                        {post.theme.trim()}
                        <span className="text-muted-foreground">
                          {" — "}
                          {new Date(post.date + "T00:00:00").toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        {new Date(post.date + "T00:00:00").toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                        {post.canal ? ` · ${post.canal}` : ""}
                      </>
                    )}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                </button>
              ))}
              {forgottenDrafts.length > FORGOTTEN_PREVIEW && (
                <button
                  type="button"
                  onClick={() => { porte("programmer"); navigate("/calendrier"); }}
                  className="w-full text-left px-2 py-1.5 text-xs text-primary hover:underline"
                >
                  Voir les {forgottenDrafts.length - FORGOTTEN_PREVIEW} autres au calendrier
                </button>
              )}
            </div>
          </div>
        )}

        {/* Greeting + pastille coach — sans sous-titre : chaque ligne doit
            gagner sa place pour que la page tienne dans une fenêtre */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-3xl sm:text-4xl text-foreground leading-tight">
            Salut {profileSummary.firstName} !
          </h1>

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
          className="group rounded-[18px_28px_14px_24px] bg-[hsl(var(--bento-dark))] p-6 sm:p-7 shadow-[var(--shadow-bento)] hover:shadow-[var(--shadow-bento-hover)] transition-shadow duration-[300ms] ease-out cursor-pointer"
          onClick={() => { if (hero.route.startsWith("/creer")) porte("creer"); handleNavigate(hero.route); }}
        >
          <p className="font-mono-ui text-2xs text-rose-soft/90 uppercase tracking-[0.14em] font-semibold mb-3">
            {hero.eyebrow}
          </p>

          <h2 className="font-display text-[26px] sm:text-[28px] leading-[1.15] text-white">
            {hero.title}
          </h2>

          {/* L'explication ne s'affiche que pendant la mise en route : une fois
              lancée, « Créer un contenu » se passe de justification — chaque
              ligne du hero repousse le reste sous la ligne de flottaison. */}
          {!launched && (
            <p className="text-base text-white/70 mt-3 leading-relaxed line-clamp-2">
              {cleanText(recommendation.explanation)}
            </p>
          )}

          {/* Pills canaux + CTA sur une même ligne (le CTA à droite) */}
          <div className="flex flex-wrap items-center gap-2 mt-5">
            {hero.showChannels &&
              CHANNEL_PILLS.map(({ label, icon: Icon, canal }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={`Créer un contenu ${label}`}
                  onClick={(e) => { e.stopPropagation(); porte("creer"); navigate(`/creer?canal=${canal}&new=1`); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-transparent border border-white/25 text-xs text-white/80 hover:bg-white hover:text-bordeaux hover:border-white transition-colors"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}

            <Button
              className="w-full sm:w-auto sm:ml-auto h-11 px-6 rounded-full bg-white hover:bg-rose-pale text-bordeaux text-base font-semibold shadow-sm hover:shadow-md transition-all"
              onClick={(e) => { e.stopPropagation(); if (hero.route.startsWith("/creer")) porte("creer"); handleNavigate(hero.route); }}
            >
              {hero.ctaLabel}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>

          {/* Une idée n'est pas une rubrique à part : c'est une façon d'entrer
              dans la création. Le rendez-vous hebdo (même rotation que
              l'e-mail, weekly-ideas.ts) vit donc DANS la porte Créer. */}
          {launched && (
            <div className="mt-5 pt-4 border-t border-white/15" onClick={(e) => e.stopPropagation()}>
              <p className="font-mono-ui text-2xs uppercase tracking-[0.14em] font-semibold text-accent mb-1">
                Ou pars d'une idée de la semaine
              </p>
              {weeklyIdeas().slice(0, 2).map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => { porte("creer"); navigate(`/creer?sujet=${encodeURIComponent(idea)}`); }}
                  className="group/idea flex w-full items-center gap-2 py-1.5 text-left"
                >
                  <span className="flex-1 text-sm text-white/90 group-hover/idea:text-white transition-colors">{idea}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-accent/80 transition-transform group-hover/idea:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}

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

        {/* Les deux autres portes — Programmer (la vraie promesse : ça part
            tout seul) et Mes photos (le différenciant). La grille complète du
            calendrier reste sur /calendrier : ici on ne dit que ce qui déclenche
            une décision (prochain départ, rien ensuite, contenus sans date). */}
        <div className="grid sm:grid-cols-2 gap-4">

          {/* Porte 2 — Programmer */}
          <section
            className="min-w-0 rounded-[14px_22px_12px_18px] bg-card border border-secondary p-5 cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => { porte("programmer"); navigate("/calendrier"); }}
          >
            <SectionLabel>Programmer</SectionLabel>
            {upcomingLoading ? (
              <div className="h-16 rounded-xl bg-muted animate-pulse" />
            ) : nextPost ? (
              <>
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-pale px-3 py-2.5 mb-2.5">
                  <Send className="h-4 w-4 shrink-0 text-primary mt-0.5" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="font-body font-bold text-sm text-foreground">
                      {shortDate(nextPost.date)}
                      {nextAuto && ` · ${publishHour(nextPost.scheduled_publish_at!)}`}
                      {nextPost.canal && CANAL_LABELS[nextPost.canal] && ` · ${CANAL_LABELS[nextPost.canal]}`}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {nextPost.theme || nextPost.format || "Contenu prévu"}
                    </p>
                    <p className={`text-xs mt-0.5 ${nextAuto ? "text-bordeaux font-semibold" : "text-muted-foreground"}`}>
                      {nextAuto ? "partira tout seul" : "prévu au calendrier : à publier toi-même"}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {upcomingPosts.length > 1
                    ? `Puis ${upcomingPosts.length - 1} autre${upcomingPosts.length > 2 ? "s" : ""} à venir.`
                    : "Ensuite : rien de prévu."}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                Rien de prévu pour l'instant. Donne une date à un contenu prêt : il partira à ta place.
              </p>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); porte("programmer"); navigate("/calendrier?import=1"); }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-bordeaux transition-colors"
            >
              Programmer un contenu prêt
              <ArrowRight className="h-4 w-4" />
            </button>
          </section>

          {/* Porte 3 — Mes photos */}
          <section
            className="min-w-0 rounded-[16px_12px_20px_14px] bg-card border border-secondary p-5 cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => { porte("photos"); navigate("/photos"); }}
          >
            <SectionLabel>Mes photos</SectionLabel>
            {photoThumbs.length > 0 ? (
              <div className="flex items-center gap-2 mb-2.5">
                {photoThumbs.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 rounded-lg object-cover border border-secondary"
                  />
                ))}
                {photoCount > photoThumbs.length && (
                  <span className="h-14 w-14 rounded-lg bg-rose-pale border border-secondary flex items-center justify-center font-mono-ui text-2xs font-semibold text-bordeaux">
                    +{photoCount - photoThumbs.length}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl bg-rose-pale px-3 py-2.5 mb-2.5">
                <ImageIcon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                <p className="text-sm text-muted-foreground">
                  Ta bibliothèque est vide : ajoute tes premières photos.
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-3">
              {photoCount > 0
                ? `${photoCount} photo${photoCount > 1 ? "s" : ""} dans ta bibliothèque.`
                : "Elles nourrissent tes posts, carrousels et stories."}
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              Mettre mes photos aux couleurs de ma marque
              <ArrowRight className="h-4 w-4" />
            </span>
          </section>
        </div>

        {/* Raccourcis restants — ce qui n'est pas une porte mais sert au quotidien */}
        <div className="flex flex-wrap gap-2">
          <PilotPill
            dataTour="card-ideas"
            icon={Lightbulb}
            label="Mes idées"
            count={ideaCount}
            onClick={() => navigate("/idees")}
          />
          <PilotPill
            icon={RecycleIcon}
            label="Recycler un post qui a marché"
            onClick={() => setRecycleOpen(true)}
          />
        </div>

        {/* Le coaching n'est plus un pavé permanent : une ligne discrète suffit
            (décision maquettes 07/08). Les Binôme ont déjà leur accompagnement. */}
        {!isBinome && (
          <p className="text-center text-sm text-muted-foreground pt-1">
            Envie d'être accompagnée ?{" "}
            <a
              href="https://calendly.com/laetitia-mattioli/appel-decouverte"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary-text hover:text-bordeaux underline underline-offset-2 transition-colors"
            >
              Réserver un appel découverte
            </a>
          </p>
        )}

        {/* Recyclage intelligent : les meilleurs posts passés, prêts à ré-angler */}
        <RecycleDialog open={recycleOpen} onOpenChange={setRecycleOpen} />

        {/* Guidage 1re visite : UNIQUEMENT le coachmark GuidedTour. L'overlay
            4 slides « ton espace est prêt » a été retiré (validé Laetitia 04/07) :
            c'était le 3e récapitulatif d'affilée après le diagnostic et le welcome.
            Réservé aux comptes récents : constaté en audit (09-10/07) qu'il
            revenait à chaque visite et interceptait les clics du dashboard. */}
        {!tourDone && !isLoading && activeRole === "owner" && isRecentAccount &&
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
