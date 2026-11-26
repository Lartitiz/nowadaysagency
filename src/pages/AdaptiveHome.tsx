import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Lightbulb,
  Image as ImageIcon,
} from "lucide-react";

import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";

import GuidedTour from "@/components/GuidedTour";
import AppHeader from "@/components/AppHeader";
import { toast } from "sonner";

import { loadFlowState, loadPhotos } from "@/hooks/use-flow-persistence";
import ClientOnboarding from "@/components/client/ClientOnboarding";
import { useStorytellingList, usePersona } from "@/hooks/use-branding";
import { useBrandProfile } from "@/hooks/use-profile";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import HomeCreatePanel from "@/components/dashboard/HomeCreatePanel";
import { getSignedPhotoThumbUrls } from "@/lib/photo-storage";
import { trackPorte } from "@/lib/dashboard-portes";


/* ── Tour steps ── */
const TOUR_STEPS = [
  { target: "card-next-step", title: "Créer ton contenu", text: "Choisis ton canal pour commencer avec une idée, un texte ou tes photos. Ton brouillon reste accessible sur l’accueil.", position: "bottom" as const },
  { target: "card-ideas", title: "Tes idées sauvegardées", text: "Toutes les idées que tu mets de côté atterrissent ici. Tu peux les transformer en contenu en un clic.", position: "top" as const },
];


/* ── Main ── */
export default function AdaptiveHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeWorkspace, activeRole } = useWorkspace();
  const { profileSummary, isLoading } = useGuideRecommendation();

  const [tourDone, setTourDone] = useState(() => !!localStorage.getItem("lac_dashboard_tour_seen"));

  // Le flag « tour vu » vit en localStorage (par navigateur) : sur un nouvel
  // appareil il est vide. On ne remontre donc le tour qu'aux comptes récents —
  // une utilisatrice installée qui change de navigateur ne le revoit pas.
  const isRecentAccount = user?.created_at
    ? Date.now() - new Date(user.created_at).getTime() < 14 * 24 * 3600 * 1000
    : false;

  // Accueil allégé (retours du 26/11/2026) : plus de compteur d'idées, de
  // « prochaine idée », de rappel des contenus jamais publiés ni de prochain
  // contenu au calendrier ici. Tout cela se retrouve dans Mes idées et au calendrier.
  const workspaceId = activeWorkspace?.id ?? null;

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
      // Vignettes de 80-96 px à l'écran : on demande une version réduite (x2 pour
      // les écrans denses), pas l'original — cf. getSignedPhotoThumbUrls.
      const map = await getSignedPhotoThumbUrls(paths, { width: 200, height: 240 }, 3600);
      return paths.map((p) => map.get(p)).filter(Boolean) as string[];
    },
    enabled: !!user,
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


        <div className="">
          <HomeCreatePanel incompleteBrand={profileSummary.brandingTotal < 50} onCreate={(path) => { porte("creer"); navigate(path); }} />
        </div>

        <section className="grid grid-cols-[96px_minmax(0,1fr)] items-center sm:flex gap-x-4 gap-y-5 sm:gap-5 rounded-2xl border border-border bg-[#f9e8ef] p-6 sm:p-8" aria-labelledby="home-photos-title">
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
          <button data-tour="card-ideas" type="button" onClick={() => navigate("/idees")} className="inline-flex items-center gap-2 underline underline-offset-4"><Lightbulb size={16} />Voir toutes tes idées</button>
          <button type="button" onClick={() => navigate("/photos")} className="inline-flex items-center gap-2 underline underline-offset-4"><ImageIcon size={16} />Ouvrir ma bibliothèque photo</button>
        </div>

        {hasLocalDraft && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4">
          <div className="min-w-0"><p className="text-sm font-semibold text-bordeaux">Ton contenu en cours</p><p className="max-w-[500px] truncate text-sm text-muted-foreground">{currentDraft?.ideaText || currentDraft?.photoSubject || "Ton brouillon est conservé sur cet appareil."}</p></div>
          <button type="button" onClick={() => navigate("/creer")} className="inline-flex items-center gap-2 text-sm font-semibold text-bordeaux">Reprendre <ArrowRight size={16} /></button>
        </div>}



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
