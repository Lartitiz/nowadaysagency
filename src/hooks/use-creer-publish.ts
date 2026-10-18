// Publier ou programmer depuis /creer : ajout d'image, raisons de blocage,
// publication immédiate Instagram et LinkedIn, connexion du compte depuis la
// fenêtre (+ réouverture `reopenPublish=1`), programmation.
// Sorti à l'identique de CreerUnifie.tsx (lot G2, docs/robustesse/gros-fichiers.md, fiche 1).
// À appeler APRÈS useCalendarSave (recordImmediatePublication, handleConfirmCalendar),
// useCarouselAutosave (carouselSave.flush) et useReelArtifact.
// ⚠️ src/test/reel-publication.test.ts extrait `handlePublishInstagram` de ce
// fichier et injecte ses variables PAR LEUR NOM : ne renommer aucune d'elles.
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Location, NavigateFunction, SetURLSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractInstagramCaption, extractLinkedInText, instagramPublishDisabledReason, isInstagramPublishTarget, linkedInPublishDisabledReason, checkScheduleGuards, tokenExpiresBeforeSchedule } from "@/features/creer/publish-guards";
import { startSocialConnect } from "@/lib/social-connect";
import { UX_UPLOAD_LIMITS, uxSizeError } from "@/lib/upload-limits";
import { versConnexions } from "@/lib/retour-apres-detour";
import { publishReelToInstagram, publishImageToInstagram, publishRenderedCarouselToInstagram, resolveWorkspaceParam } from "@/lib/instagram-publish";
import { publishTextToLinkedIn, isLinkedInNotConnectedError } from "@/lib/linkedin-publish";

type SocialChannel = "instagram" | "linkedin";

type CreerPublishInput = {
  session: any;
  result: any;
  setResult: (update: (prev: any) => any) => void;
  selectedFormat: string | null;
  isLinkedInCarousel: boolean;
  visualSlides: any[];
  publishableImageUrl: string | null;
  reelMp4Url: string | null;
  carouselVisualsStale: boolean;
  visualLoading: boolean;
  generating: boolean;
  carouselQuality: { disabledReason?: string | null };
  carouselCloudEnabled: boolean;
  carouselSave: { flush: () => Promise<boolean> };
  charterData: any;
  workspaceId: string | null | undefined;
  reelScope: string;
  activeReelScope: MutableRefObject<string>;
  instagramInFlight: MutableRefObject<{ scope: string } | null>;
  setPublishingInstagram: (value: boolean) => void;
  setPublishingLinkedIn: (value: boolean) => void;
  recordImmediatePublication: (input: { canal: string; caption: string; postId?: string; manual?: boolean }) => Promise<unknown>;
  handleConfirmCalendar: (input: { date: string; scheduleAt: Date }) => Promise<unknown>;
  setPublishDialogOpen: (open: boolean) => void;
  navigate: NavigateFunction;
  location: Location;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  connectionsKnown: boolean;
  refreshConnections: () => unknown;
  isSocialConnected: (channel: SocialChannel) => boolean;
  getTokenExpiry: (channel: SocialChannel) => string | null | undefined;
};

export function useCreerPublish({
  session, result, setResult, selectedFormat, isLinkedInCarousel, visualSlides, publishableImageUrl, reelMp4Url,
  carouselVisualsStale, visualLoading, generating, carouselQuality, carouselCloudEnabled, carouselSave, charterData,
  workspaceId, reelScope, activeReelScope, instagramInFlight, setPublishingInstagram, setPublishingLinkedIn,
  recordImmediatePublication, handleConfirmCalendar, setPublishDialogOpen, navigate, location, searchParams,
  setSearchParams, connectionsKnown, refreshConnections, isSocialConnected, getTokenExpiry,
}: CreerPublishInput) {
  // ── Ajout d'image depuis la fenêtre « Publier ou programmer » (post sans visuel) ──
  // L'image part dans le bucket public `calendar-media` (même chemin que les visuels
  // du calendrier) puis est rattachée au résultat (raw.image_url) : publication
  // immédiate, programmation (media_urls) et aperçu du feed la retrouvent tous là.
  const publishImageInputRef = useRef<HTMLInputElement>(null);
  const [addingPublishImage, setAddingPublishImage] = useState(false);
  const handlePublishImageSelected = async (file: File | null) => {
    if (!file) return;
    if (!session?.user) {
      toast.error("Tu dois être connectée.");
      return;
    }
    const sizeErr = uxSizeError(file, UX_UPLOAD_LIMITS.media);
    if (sizeErr) {
      toast.error(sizeErr);
      return;
    }
    setAddingPublishImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("calendar-media").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
      if (!data?.publicUrl) throw new Error("L'image a été envoyée mais son adresse est introuvable.");
      setResult((prev: any) => (prev ? { ...prev, raw: { ...(prev.raw || {}), image_url: data.publicUrl } } : prev));
      toast.success("Image ajoutée à ton post !");
    } catch (err: any) {
      toast.error("L'image n'a pas pu être ajoutée", { description: err?.message || "Réessaie dans un instant." });
    } finally {
      setAddingPublishImage(false);
    }
  };

  const isCarouselPublish = selectedFormat === "carousel";
  // L'option « Maintenant/Programmer » (Instagram) n'apparaît que pour un contenu du canal
  // Instagram : un post LinkedIn, un carrousel LinkedIn, une épingle Pinterest ou
  // une newsletter ne doivent pas le proposer, même désactivé.
  const showInstagramPublish = isInstagramPublishTarget({ selectedFormat, isLinkedInCarousel });
  const publishInstagramDisabledReason =
    instagramPublishDisabledReason({
      selectedFormat,
      isCarousel: isCarouselPublish,
      visualSlidesCount: visualSlides.length,
      publishableImageUrl,
      isLinkedInCarousel,
      reelMp4Url,
    }) ||
    // Visuels périmés : ne pas publier une version qui ne reflète plus les éditions.
    (isCarouselPublish && carouselVisualsStale
      ? "Tu as modifié des slides depuis le dernier rendu. Mets à jour les visuels avant de publier."
      : undefined) || (isCarouselPublish ? (visualLoading || generating ? "Les visuels sont en cours de préparation." : carouselQuality.disabledReason) : undefined);

  const handlePublishInstagram = async () => {
    if (instagramInFlight.current?.scope === reelScope) return;
    const publishScope = reelScope;
    const publicationOperation = { scope: publishScope };
    if (!session?.user) {
      toast.error("Tu dois être connecté.");
      return;
    }
    if (publishInstagramDisabledReason) {
      toast.error(publishInstagramDisabledReason);
      return;
    }
    if (carouselCloudEnabled && !(await carouselSave.flush())) return;
    const caption: string = extractInstagramCaption(result?.raw || result);

    instagramInFlight.current = publicationOperation;
    setPublishingInstagram(true);
    try {
      let permalink: string | undefined;
      let publishedPostId: string | undefined;
      if (selectedFormat === "reel") {
        const res = await publishReelToInstagram({ caption, videoUrl: reelMp4Url!, workspaceId, userId: session.user.id });
        permalink = res.permalink;
        publishedPostId = res.postId;
      } else if (isCarouselPublish) {
        const { getIncludeLogoPref } = await import("@/lib/export-logo");
        const logoUrl = getIncludeLogoPref() ? (charterData as any)?.logo_url : null;
        toast.info("Préparation du carrousel… (rendu des visuels en images)");
        const res = await publishRenderedCarouselToInstagram({
          caption,
          visualSlides,
          logoUrl,
          workspaceId,
          userId: session.user.id,
        });
        permalink = res.permalink;
        publishedPostId = res.postId;
      } else {
        const res = await publishImageToInstagram({
          caption,
          imageUrl: publishableImageUrl!,
          workspaceId,
          userId: session.user.id,
        });
        permalink = res.permalink;
        publishedPostId = res.postId;
      }
      await recordImmediatePublication({ canal: "instagram", caption, postId: publishedPostId || permalink });
      if (activeReelScope.current !== publishScope) return;
      toast.success(
        permalink
          ? "Publié sur Instagram ! Ouvre ton profil pour le voir."
          : "Publié sur Instagram !",
        permalink ? { action: { label: "Voir sur Instagram", onClick: () => window.open(permalink, "_blank") } } : undefined,
      );
    } catch (e: any) {
      if (activeReelScope.current !== publishScope) return;
      const msg = e?.message || "Échec de la publication Instagram.";
      if (msg.toLowerCase().includes("aucun compte instagram")) {
        toast.error(msg, { action: { label: "Connecter", onClick: () => versConnexions(navigate) } });
      } else {
        toast.error(msg);
      }
    } finally {
      if (instagramInFlight.current === publicationOperation) instagramInFlight.current = null;
      if (activeReelScope.current === publishScope) setPublishingInstagram(false);
    }
  };

  // ═══ Publication directe LinkedIn (post texte) ═══
  // Disponible pour un post LinkedIn texte (hors carrousel LinkedIn, qui est visuel).
  const isLinkedInTextPost = selectedFormat === "linkedin" && !isLinkedInCarousel;
  const publishLinkedInDisabledReason = linkedInPublishDisabledReason({
    isLinkedInTextPost,
    raw: result?.raw || result,
  });

  const handlePublishLinkedIn = async () => {
    if (!session?.user) {
      toast.error("Tu dois être connecté.");
      return;
    }
    if (publishLinkedInDisabledReason) {
      toast.error(publishLinkedInDisabledReason);
      return;
    }
    const text: string = extractLinkedInText(result?.raw || result);

    setPublishingLinkedIn(true);
    try {
      const res = await publishTextToLinkedIn({
        text,
        workspaceId,
        userId: session.user.id,
      });
      await recordImmediatePublication({ canal: "linkedin", caption: text, postId: res.postId || res.permalink });
      toast.success(
        res.permalink
          ? "Publié sur LinkedIn ! Ouvre ton profil pour le voir."
          : "Publié sur LinkedIn !",
        res.permalink ? { action: { label: "Voir sur LinkedIn", onClick: () => window.open(res.permalink, "_blank") } } : undefined,
      );
    } catch (e: any) {
      const msg = e?.message || "Échec de la publication LinkedIn.";
      if (isLinkedInNotConnectedError(msg)) {
        toast.error(msg, { action: { label: "Connecter", onClick: () => versConnexions(navigate) } });
      } else {
        toast.error(msg);
      }
    } finally {
      setPublishingLinkedIn(false);
    }
  };

  // ═══ Fenêtre « Publier ou programmer » ═══
  // Canal de publication automatique du contenu affiché (null = brouillon seulement).
  const publishChannel: "instagram" | "linkedin" | null =
    isLinkedInTextPost ? "linkedin" : showInstagramPublish ? "instagram" : null;
  const publishDialogDisabledReason =
    publishChannel === "linkedin" ? publishLinkedInDisabledReason : publishInstagramDisabledReason;

  const handlePublishNowFromDialog = async () => {
    if (publishChannel === "linkedin") await handlePublishLinkedIn();
    else await handlePublishInstagram();
    if (activeReelScope.current === reelScope) setPublishDialogOpen(false);
  };

  // Connexion OAuth déclenchée DEPUIS la fenêtre de publication : avant, un
  // compte non connecté renvoyait un message texte vers Paramètres → Connexions
  // sans aucun bouton — la cliente devait quitter /creer de son propre chef, sans
  // garantie de retour, et le contenu généré restait en plan. `startSocialConnect`
  // mémorise ce chemin AVANT de partir (+ `reopenPublish=1`, un paramètre à usage
  // unique comme les autres ci-dessus) ; le retour est automatique une fois
  // connectée (`SocialConnectionsCard`, `lireRetour`), contenu préservé par
  // `use-flow-persistence` (2h), et la fenêtre se rouvre TOUTE SEULE ci-dessous.
  const [connectingPublishChannel, setConnectingPublishChannel] = useState(false);
  const handleConnectFromDialog = async () => {
    if (!publishChannel) return;
    setConnectingPublishChannel(true);
    const depuis = `${location.pathname}${location.search}${location.search ? "&" : "?"}reopenPublish=1`;
    const connectionOptions = {
      quoi: "ton contenu prêt à publier",
      depuis,
      isCurrent: () => activeReelScope.current === reelScope,
    };
    const { error } = await startSocialConnect(publishChannel, resolveWorkspaceParam(workspaceId, session?.user?.id), connectionOptions);
    if (!connectionOptions.isCurrent()) return;
    if (error) {
      toast.error(error);
      setConnectingPublishChannel(false);
    }
    // Pas de else : en cas de succès, window.location.assign() quitte la page.
  };

  useEffect(() => {
    if (searchParams.get("reopenPublish") !== "1") return;
    // Le flow restauré (result) peut arriver après ce premier passage — ne
    // consommer le paramètre qu'UNE FOIS le contenu là, sinon un run précoce le
    // strippe pour rien et l'ouverture automatique n'a plus jamais lieu.
    if (!result) return;
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("reopenPublish");
    setSearchParams(cleaned, { replace: true });
    setPublishDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Programme la publication : mêmes gardes que la publication immédiate + compte
  // connecté + date future, puis délègue à handleConfirmCalendar (insert + uploads
  // + auto_publish). Le cron social-publish-scheduled publie à l'heure dite.
  const handleScheduleFromDialog = async (input: string) => {
    if (!connectionsKnown) {
      void refreshConnections();
      toast.error("Connexion en cours de vérification. Réessaie de programmer dans un instant.");
      return;
    }
    const reseau = publishChannel === "linkedin" ? "LinkedIn" : "Instagram";
    const guard = checkScheduleGuards({
      publishChannel,
      disabledReason: publishDialogDisabledReason,
      isChannelConnected: publishChannel ? isSocialConnected(publishChannel) : false,
      input,
    });
    if (guard.blocked) {
      if (guard.reason === "no_channel") return;
      if (guard.reason === "not_connected") {
        toast.error(guard.message, {
          description: guard.description,
          action: { label: "Connecter", onClick: () => versConnexions(navigate) },
        });
        return;
      }
      toast.error(guard.message);
      return;
    }
    const when = new Date(input);
    if (carouselCloudEnabled && !(await carouselSave.flush())) return;
    const tokenExpiry = getTokenExpiry(publishChannel!);
    const scheduled = await handleConfirmCalendar({ date: input.split("T")[0], scheduleAt: when });
    if (scheduled && tokenExpiresBeforeSchedule(tokenExpiry, when)) {
      // Programmé, mais le jeton OAuth sera expiré à l'heure dite → prévenir MAINTENANT
      // plutôt que laisser la publication échouer en silence (même garde que le calendrier).
      toast.warning("Programmé : mais reconnecte ton compte d'ici là ⚠️", {
        duration: 12000,
        description: `Ta connexion ${reseau} expire le ${new Date(tokenExpiry!).toLocaleDateString("fr-FR")}, avant la date choisie. Sans reconnexion, la publication échouera.`,
        action: { label: "Reconnecter", onClick: () => versConnexions(navigate) },
      });
    }
  };

  // « Je l'ai publié moi-même » : jamais bloqué (pas de connexion, plus de 10
  // slides, story, newsletter…). Elle a publié ailleurs, on le note au calendrier.
  const [publishingByHand, setPublishingByHand] = useState(false);
  const handlePublishedByHand = async () => {
    if (publishingByHand) return;
    const canal = selectedFormat === "newsletter" ? "newsletter"
      : selectedFormat?.startsWith("pinterest") ? "pinterest"
      : isLinkedInCarousel || isLinkedInTextPost ? "linkedin" : "instagram";
    setPublishingByHand(true);
    try {
      if (carouselCloudEnabled && !(await carouselSave.flush())) return;
      const ok = await recordImmediatePublication({ canal, caption: "", manual: true });
      if (!ok || activeReelScope.current !== reelScope) return;
      toast.success(canal === "newsletter" ? "Bravo, ta newsletter est notée comme envoyée 🎉" : "Bravo, c'est noté comme publié 🎉", {
        description: "À retrouver dans ton calendrier.",
      });
      setPublishDialogOpen(false);
    } finally {
      setPublishingByHand(false);
    }
  };

  return {
    publishingByHand, handlePublishedByHand,
    publishImageInputRef, addingPublishImage, handlePublishImageSelected,
    isCarouselPublish,
    publishChannel, publishDialogDisabledReason, handlePublishNowFromDialog,
    connectingPublishChannel, handleConnectFromDialog, handleScheduleFromDialog,
  };
}
