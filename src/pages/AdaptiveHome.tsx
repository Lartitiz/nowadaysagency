import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Clock,
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
import { saveFlowState, clearFlowState, loadFlowState, loadPhotos } from "@/hooks/use-flow-persistence";
import ClientOnboarding from "@/components/client/ClientOnboarding";
import { useStorytellingList, usePersona } from "@/hooks/use-branding";
import { useBrandProfile } from "@/hooks/use-profile";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import HomeCreatePanel from "@/components/dashboard/HomeCreatePanel";
import { toLocalDateStr } from "@/lib/utils";
import { getSignedPhotoUrls } from "@/lib/photo-storage";
import { trackPorte } from "@/lib/dashboard-portes";
import { useIsMobile } from "@/hooks/use-mobile";


/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Créer ton contenu", text: "Choisis ton canal pour commencer avec une idée, un texte ou tes photos. Ton brouillon reste accessible sur l’accueil.", position: "bottom" as const },
  { target: "card-ideas", title: "Tes idées sauvegardées", text: "Toutes les idées que tu mets de côté atterrissent ici. Tu peux les transformer en contenu en un clic.", position: "top" as const },
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

/* Deux vocabulaires de format cohabitent en base : celui du parcours /creer
   (« carousel », « story_serie »…) et celui du dialogue calendrier
   (« post_carrousel », « post_photo »…). On les ramène tous les deux à un
   libellé court — un format inconnu n'affiche rien plutôt qu'un mot technique. */
const FORMAT_SHORT_LABELS: Record<string, string> = {
  post: "Post",
  post_photo: "Post photo",
  post_carrousel: "Carrousel",
  carousel: "Carrousel",
  reel: "Reel",
  story: "Stories",
  story_serie: "Stories",
  live: "Live",
  linkedin: "Post",
  newsletter: "Newsletter",
  pinterest: "Épingle",
  pinterest_visual: "Épingle",
  pinterest_photo: "Épingle",
  pinterest_inspiration: "Épingle",
};

/* ── Rappel « contenus prêts, jamais publiés » ── */
interface ForgottenDraft {
  id: string;
  date: string;
  canal: string | null;
  theme: string | null;
  format: string | null;
  accroche: string | null;
  created_at: string | null;
  publish_status: string | null;
}

/** « lun. 10 » — sans année ni ponctuation superflue. */
function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

/** « 15 août » — la date posée au calendrier, sans année. */
function dayMonth(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** « 14 h 32 » — heure locale d'un horodatage (départ programmé, écriture…). */
function hourLabel(iso: string): string {
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
  const { profileSummary, isLoading } = useGuideRecommendation();
  const isMobile = useIsMobile();
  // Au doigt, chaque ligne de rappel coûte ~30 px devant le hero : on en montre
  // 2 (le lien « voir les N autres » emmène au calendrier), 5 au large.
  const FORGOTTEN_PREVIEW = isMobile ? 2 : 5;

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));

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
      // Seulement ce qui reste à faire : une idée déjà créée (posée au
      // calendrier) n'est plus un rappel.
      const { count, error } = await supabase
        .from("saved_ideas")
        .select("*", { count: "exact", head: true })
        .eq(filterCol, filterVal)
        .is("calendar_post_id", null)
        .or("status.is.null,status.not.in.(planned,published)");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // Photos : compteur de la pill « Mes photos » (accès direct à la bibliothèque).
  // La bibliothèque est toujours cloisonnée par workspace_id (cf. useUserPhotos).
  const { data: photoCount = 0, isError: photoCountError, isLoading: photoCountLoading } = useQuery<number>({
    queryKey: ["adaptive-home-photos-count", user?.id, workspaceId],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("user_photos")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId ?? user.id)
        .is("removed_from_library_at", null);
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
        .is("removed_from_library_at", null)
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
  const { data: forgottenDrafts = [] } = useQuery<ForgottenDraft[]>({
    queryKey: ["adaptive-home-forgotten-drafts", wsFilter.column, wsFilter.value],
    queryFn: async () => {
      const todayStr = toLocalDateStr(new Date());
      const { data, error } = await (supabase as any)
        .from("calendar_posts")
        // `theme` = le sujet du contenu. Sans lui, les lignes se lisaient toutes
        // « 15 août · instagram » et rien ne les distinguait (regard du 17/08).
        // `format`/`accroche`/`created_at`/`publish_status` : de quoi séparer
        // deux contenus qui partagent le MÊME sujet et la MÊME date (regard du
        // 22/08 : 5 lignes strictement identiques). On ne charge PAS
        // `content_draft` (le post entier ×50) : l'accroche suffit à distinguer.
        .select("id, date, canal, theme, format, accroche, created_at, publish_status")
        .eq(wsFilter.column, wsFilter.value)
        .lt("date", todayStr)
        .neq("status", "published")
        .not("content_draft", "is", null)
        .neq("content_draft", "")
        .or("publish_status.is.null,publish_status.eq.failed")
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ForgottenDraft[];
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

  // ── Rappel des brouillons : rendre chaque ligne reconnaissable ──
  // Plusieurs variantes d'un même sujet posées le même jour donnaient des lignes
  // au mot près identiques (« Les 3 erreurs… — 15 août » ×5, regard du 22/08) :
  // impossible de savoir laquelle ouvrir. On repère les lignes qui partagent
  // sujet + date, et on leur donne de quoi se distinguer.
  const forgottenPreview = forgottenDrafts.slice(0, FORGOTTEN_PREVIEW);
  const sameSubjectKey = (d: ForgottenDraft) => `${(d.theme ?? "").trim().toLowerCase()}|${d.date}`;
  const sameSubjectCount = forgottenPreview.reduce<Record<string, number>>((acc, d) => {
    const key = sameSubjectKey(d);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

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

  const draft = loadFlowState();
  const draftInSpace = draft && (!draft.workspaceId || draft.workspaceId === (workspaceId ?? user?.id));
  const currentDraft = draftInSpace ? draft : null;
  const hasLocalDraft = !!(currentDraft?.ideaText || currentDraft?.photoSubject || currentDraft?.photoDescription || currentDraft?.result || currentDraft?.editContent || currentDraft?.selectedFormat || loadPhotos().length);

  if (isClientWorkspace && !clientHasData) {
    return (
      <div className="min-h-screen bg-[#fcf8f9]">
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
      <div className="min-h-screen bg-[#fcf8f9]">
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
    <div className="min-h-screen bg-[#fcf8f9]">
      <AppHeader />
      <main className="max-w-[1000px] mx-auto px-4 pt-6 pb-24 sm:pt-8 flex flex-col gap-5 sm:gap-6">

        {/* Erreur de chargement visible (pattern /profil) : sans ce bandeau, un
            réseau qui tombe affiche un dashboard « normal » à zéro, sans indice. */}
        {(ideasError || postsError || photoCountError) && (
          <div className="order-first rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center justify-between gap-3">
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

        <div className="">
          <HomeCreatePanel incompleteBrand={profileSummary.brandingTotal < 50} onCreate={(path) => { porte("creer"); navigate(path); }} />
        </div>

        <section className="grid grid-cols-[64px_minmax(0,1fr)] items-center sm:flex gap-x-4 gap-y-5 sm:gap-5 rounded-2xl border border-border bg-[#f9e8ef] p-6 sm:p-8" aria-labelledby="home-photos-title">
          <div className="flex shrink-0 items-center -space-x-6 sm:space-x-2" aria-hidden="true">
            {photoThumbs.length > 0 ? photoThumbs.slice(0, 2).map((url, index) => <img key={url} src={url} alt="" className={`h-20 w-14 sm:h-24 sm:w-20 object-cover rounded-sm border-4 border-white shadow-sm ${index ? "rotate-6" : "-rotate-6"}`} />) : <ImageIcon className="h-14 w-14 text-bordeaux/60" strokeWidth={1} />}
          </div>
          <div className="flex-1">
            <h2 id="home-photos-title" className="!font-display !font-normal text-3xl sm:text-[34px] text-bordeaux">Donne vie à tes photos</h2>
            <p className="mt-2 text-sm text-muted-foreground">Tes produits, tes réalisations, tes portraits : améliore tes photos ou crée de nouveaux visuels.</p>
          </div>
          <button type="button" className="col-span-2 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--bento-dark))] px-5 py-3 text-sm font-medium text-white hover:bg-bordeaux focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordeaux" onClick={() => { porte("photos"); navigate("/photos"); }}>Choisir une photo <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
        </section>

        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-bordeaux">
          <button data-tour="card-ideas" type="button" onClick={() => navigate("/idees")} className="inline-flex items-center gap-2 underline underline-offset-4"><Lightbulb size={16} />Accéder à mes idées{!ideasError && ideaCount > 0 ? ` (${ideaCount})` : ""}</button>
          <button type="button" onClick={() => navigate("/photos")} className="inline-flex items-center gap-2 underline underline-offset-4"><ImageIcon size={16} />Ouvrir ma bibliothèque photo{!photoCountLoading && !photoCountError && photoCount > 0 ? ` (${photoCount})` : ""}</button>
        </div>

        {hasLocalDraft && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4">
          <div className="min-w-0"><p className="text-sm font-semibold text-bordeaux">Ton contenu en cours</p><p className="max-w-[500px] truncate text-sm text-muted-foreground">{currentDraft?.ideaText || currentDraft?.photoSubject || "Ton brouillon est conservé sur cet appareil."}</p></div>
          <button type="button" onClick={() => navigate("/creer")} className="inline-flex items-center gap-2 text-sm font-semibold text-bordeaux">Reprendre <ArrowRight size={16} /></button>
        </div>}

        {/* Rappel des brouillons oubliés — la case « premier contenu » et le
            calendrier savent déjà qu'un contenu existe ; ce qu'ils ne disaient
            jamais, c'est qu'il est resté sans suite. Discret (pas de couleur
            d'alerte, c'est un oubli, pas une erreur). Au large il reste au-dessus
            du hero ; au doigt il passe juste dessous () pour ne plus
            repousser « Créer un contenu » hors du premier écran.
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
              {forgottenPreview.map((post) => {
                // Deux lignes de même sujet et même date : on met en tête ce qui
                // les sépare — l'accroche, la première phrase du post, propre à
                // chaque variante. En tête et pas en fin de ligne : au doigt, le
                // `truncate` mange la fin, donc le discriminant doit passer devant.
                const ambigu = (sameSubjectCount[sameSubjectKey(post)] ?? 0) > 1;
                const accroche = post.accroche?.trim();
                const theme = post.theme?.trim();
                const titre = (ambigu && accroche) || theme || accroche || "Contenu sans titre";

                const canalLabel = post.canal ? CANAL_LABELS[post.canal] ?? post.canal : null;
                const formatLabel = post.format ? FORMAT_SHORT_LABELS[post.format] ?? null : null;
                const meta = [
                  dayMonth(post.date),
                  // Dernier recours quand même l'accroche manque : l'heure
                  // d'écriture, toujours différente d'une variante à l'autre.
                  ambigu && !accroche && post.created_at ? `écrite à ${hourLabel(post.created_at)}` : null,
                  canalLabel,
                  formatLabel !== canalLabel ? formatLabel : null,
                ].filter(Boolean).join(" · ");

                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => {
                      porte("programmer");
                      navigate(`/calendrier?date=${post.date}&post=${post.id}`);
                    }}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground">{titre}</span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {meta}
                        {/* L'envoi automatique a échoué : ce n'est plus un oubli,
                            c'est un contenu qui a essayé de partir et n'a pas pu. */}
                        {post.publish_status === "failed" && (
                          <span className="text-destructive"> · envoi échoué</span>
                        )}
                      </span>
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                  </button>
                );
              })}
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

        {nextPost && !upcomingLoading && (
          <button type="button" onClick={() => { porte("programmer"); navigate(`/calendrier?date=${nextPost.date}`); }} className="flex w-full items-center gap-3 border-t border-border py-4 text-left">
            <Send size={18} className="shrink-0 text-bordeaux" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{nextAuto ? "Prochaine publication programmée" : "Prochain contenu au calendrier"} · {shortDate(nextPost.date)}</span><span className="block truncate text-sm font-medium text-bordeaux">{nextPost.theme || "Voir mon contenu"}</span></span>
            <ArrowRight size={16} className="shrink-0 text-bordeaux" aria-hidden="true" />
          </button>
        )}


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
