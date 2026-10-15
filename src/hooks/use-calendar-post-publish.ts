// Publication depuis la fenêtre d'un post du calendrier : publication
// immédiate Instagram (reel monté, image, carrousel) et LinkedIn (texte), et
// publication programmée. Sorti de CalendarPostDialog.tsx à l'identique (fiche
// 13 de docs/robustesse/gros-fichiers.md, lot 6). La publication est RÉELLE et
// PUBLIQUE : `markPostPublished` réessaie l'écriture puis prévient franchement,
// sinon la cliente risque un doublon.
// ⚠️ src/test/calendar-caption.test.ts et calendar-reel-integration.test.ts
// relisent CE fichier (AST), en sortent `handlePublishInstagram` et
// `linkedInText` par leur nom et les exécutent en injectant les variables PAR
// LEUR NOM (user, workspaceId, igVideo, igValidImages, contentDraft, theme,
// savedPreviewContent, markPostPublished, setPublishingInstagram, toast…) :
// ne renommer aucune de ces variables.
// Les états du post (publishStatus, scheduledAt…) restent dans la fenêtre :
// l'effet d'init les remplit depuis le post.
import { useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSocialConnections } from "@/hooks/use-social-connections";
import { reelCalendarCaption } from "../../supabase/functions/_shared/reel-caption";
import { calendarPublishCaption } from "../../supabase/functions/_shared/calendar-caption";
import { isDurableReelUrl, REEL_VIDEO_REQUIRED } from "@/lib/reel-publication";
import { publishToInstagram, publishReelToInstagram, isPublicImageUrl, isNotConnectedError } from "@/lib/instagram-publish";
import { publishTextToLinkedIn, isLinkedInNotConnectedError } from "@/lib/linkedin-publish";
import { friendlyError } from "@/lib/error-messages";
import { trackError } from "@/lib/error-tracker";
import { versConnexions } from "@/lib/retour-apres-detour";
import { INSTAGRAM_DIRECT_MAX_IMAGES, instagramTooManyImagesReason } from "@/features/creer/publish-guards";

export interface CalendarPostPublishInput {
  user: { id: string } | null | undefined;
  workspaceId: string | null | undefined;
  postCanal: string;
  format: string | null;
  mediaUrls: string[];
  contentDraft: string | null;
  theme: string;
  savedPreviewContent: any;
  effectiveId: string | null;
  scheduleInput: string;
  navigate: NavigateFunction;
  setPublishStatus: (v: string | null) => void;
  setPublishedPostId: (v: string | null) => void;
  setScheduledAt: (v: string | null) => void;
  setPublishError: (v: string | null) => void;
  setSchedulerOpen: (v: boolean) => void;
}

export function useCalendarPostPublish({ user, workspaceId, postCanal, format, mediaUrls, contentDraft, theme, savedPreviewContent, effectiveId, scheduleInput, navigate, setPublishStatus, setPublishedPostId, setScheduledAt, setPublishError, setSchedulerOpen }: CalendarPostPublishInput) {
  const { isConnected: isSocialConnected, getTokenExpiry, known: connectionsKnown, loading: connectionsLoading, refresh: refreshConnections } = useSocialConnections();
  const [publishingInstagram, setPublishingInstagram] = useState(false);
  const [publishingLinkedIn, setPublishingLinkedIn] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // ── Publication directe Instagram (reel vidéo, image simple OU carrousel) ──
  const igValidImages = mediaUrls.filter(isPublicImageUrl);
  // Un reel monté est rangé dans media_urls comme les images : c'est lui qui
  // décide du média publié (media_type=REELS), pas un visuel de repli.
  const igVideo = mediaUrls.find(isDurableReelUrl) ?? null;
  const instagramPublishDisabledReason = (() => {
    if (postCanal !== "instagram") return "Publication directe réservée aux posts Instagram.";
    // L'edge social-instagram-publish ne gère que le feed (pas media_type=STORIES) :
    // publier une story d'ici partirait en post feed.
    if (format === "story_serie") return "La publication directe des stories arrive bientôt : publie-la depuis l'app Instagram.";
    if (format === "reel" && !igVideo) return REEL_VIDEO_REQUIRED;
    if (igVideo) return null;
    if (igValidImages.length === 0) return "Ajoute un visuel (image) ou monte ta vidéo pour publier.";
    if (igValidImages.length > INSTAGRAM_DIRECT_MAX_IMAGES) return instagramTooManyImagesReason(igValidImages.length);
    return null;
  })();

  // Enregistre la publication réussie sur le post (sinon : invisible dans les stats + risque de re-publier en double)
  const markPostPublished = async (permalink: string | null) => {
    if (!effectiveId) return;
    const nowIso = new Date().toISOString();
    const patch = {
      publish_status: "published",
      published_at: nowIso,
      published_post_id: permalink,
      publish_error: null,
      updated_at: nowIso,
    };
    // supabase-js ne lève PAS sur {error} : sans vérification explicite, un échec
    // d'écriture (réseau, RLS) passe inaperçu → au prochain chargement l'app croit
    // le post non publié → re-publication = doublon PUBLIC chez la cliente.
    // Un retry, puis un avertissement franc plutôt qu'un silence.
    let { error } = await supabase.from("calendar_posts").update(patch as any).eq("id", effectiveId);
    if (error) {
      ({ error } = await supabase.from("calendar_posts").update(patch as any).eq("id", effectiveId));
    }
    // État local quoi qu'il arrive : le dialog masque « Publier » immédiatement
    // (protège au moins la session en cours contre un double-clic).
    setPublishStatus("published");
    setPublishedPostId(permalink);
    if (error) {
      trackError(error, { where: "markPostPublished", postId: effectiveId });
      toast.warning("Publié : mais pas enregistré ici", {
        duration: 15000,
        description: "Ton post est bien parti sur le réseau, mais je n'ai pas réussi à le noter comme publié dans le calendrier. Ne le republie pas : recharge la page dans un instant pour vérifier.",
      });
    }
  };

  const handlePublishInstagram = async () => {
    if (!user) { toast.error("Tu dois être connectée."); return; }
    if (instagramPublishDisabledReason || (!igVideo && igValidImages.length === 0)) {
      toast.error(instagramPublishDisabledReason || "Média non disponible");
      return;
    }
    setPublishingInstagram(true);
    try {
      // Instagram TRANSCODE la vidéo avant publication : ça peut prendre
      // plusieurs minutes, on le dit au lieu de laisser un spinner muet.
      if (igVideo) toast.info("Instagram prépare ta vidéo : ça peut prendre quelques minutes.");
      const { permalink, postId } = igVideo
        ? await publishReelToInstagram({
            caption: reelCalendarCaption(contentDraft || "", savedPreviewContent),
            videoUrl: igVideo,
            workspaceId,
            userId: user.id,
          })
        : await publishToInstagram({
            // Légende seule : le texte des slides reste dans le brouillon (affichage),
            // il ne part jamais en légende (même règle que la publication programmée).
            caption: calendarPublishCaption(contentDraft, savedPreviewContent) || theme || "",
            imageUrls: igValidImages,
            workspaceId,
            userId: user.id,
          });
      await markPostPublished(postId || permalink || null);
      toast.success(
        igVideo ? "Reel publié sur Instagram ! 🎉" : igValidImages.length > 1 ? "Carrousel publié sur Instagram ! 🎉" : "Publié sur Instagram ! 🎉",
        { description: permalink ? "Ouvre ton profil Instagram pour le voir." : undefined },
      );
    } catch (e: any) {
      const msg = e?.message as string | undefined;
      toast.error(isNotConnectedError(msg) ? "Compte Instagram non connecté" : "Échec de la publication", {
        description: isNotConnectedError(msg) ? "Connecte-le dans Paramètres › Connexions." : friendlyError(e),
      });
    } finally {
      setPublishingInstagram(false);
    }
  };

  // ── Publication directe LinkedIn (post texte : content_draft) ──
  const linkedInText = calendarPublishCaption(contentDraft, savedPreviewContent);
  const linkedInPublishDisabledReason = (() => {
    if (postCanal !== "linkedin") return "Publication directe réservée aux posts LinkedIn.";
    if (!linkedInText) return "Rédige le texte du post pour publier.";
    return null;
  })();

  const handlePublishLinkedIn = async () => {
    if (!user) { toast.error("Tu dois être connectée."); return; }
    if (linkedInPublishDisabledReason) {
      toast.error(linkedInPublishDisabledReason);
      return;
    }
    setPublishingLinkedIn(true);
    try {
      const { permalink } = await publishTextToLinkedIn({
        text: linkedInText,
        workspaceId,
        userId: user.id,
      });
      await markPostPublished(permalink ?? null);
      toast.success("Publié sur LinkedIn ! 🎉", {
        description: permalink ? "Ouvre ton profil LinkedIn pour le voir." : undefined,
      });
    } catch (e: any) {
      const msg = e?.message as string | undefined;
      toast.error(isLinkedInNotConnectedError(msg) ? "Compte LinkedIn non connecté" : "Échec de la publication", {
        description: isLinkedInNotConnectedError(msg) ? "Connecte-le dans Paramètres › Connexions." : friendlyError(e),
      });
    } finally {
      setPublishingLinkedIn(false);
    }
  };

  // ── Publication PROGRAMMÉE (auto-publication à une date/heure) ──
  // Canaux publiables : Instagram (image/carrousel) et LinkedIn (texte).
  const canSchedule = postCanal === "instagram" || postCanal === "linkedin";
  const scheduleNeedsConnection = canSchedule && connectionsKnown && !isSocialConnected(postCanal as "instagram" | "linkedin");
  // Le jeton OAuth expirera-t-il AVANT la date de publication choisie ? (LinkedIn ne se
  // rafraîchit pas tout seul : sans reconnexion d'ici là, la publication échouera.)
  const scheduleTokenExpiry = canSchedule ? getTokenExpiry(postCanal as "instagram" | "linkedin") : null;
  const scheduleAfterTokenExpiry = !!(
    scheduleTokenExpiry && scheduleInput &&
    !isNaN(new Date(scheduleInput).getTime()) &&
    new Date(scheduleInput).getTime() > new Date(scheduleTokenExpiry).getTime()
  );
  const handleSchedulePublish = async () => {
    if (!effectiveId) { toast.error("Ajoute un sujet : le post s'enregistre tout seul, puis tu pourras le programmer."); return; }
    if (!canSchedule) { toast.error("Programmation disponible pour Instagram et LinkedIn."); return; }
    if (!connectionsKnown) {
      void refreshConnections();
      toast.error("Connexion en cours de vérification. Réessaie de programmer dans un instant.");
      return;
    }
    // Garde-fou : sans compte connecté, la publication programmée échouerait en silence à l'heure dite.
    if (!isSocialConnected(postCanal as "instagram" | "linkedin")) {
      const reseau = postCanal === "linkedin" ? "LinkedIn" : "Instagram";
      toast.error(`Compte ${reseau} non connecté`, {
        description: `Connecte-le pour que ce post parte tout seul à l'heure prévue.`,
        action: { label: "Connecter", onClick: () => versConnexions(navigate) },
      });
      return;
    }
    if (postCanal === "instagram") {
      // Même garde que la publication immédiate : le cron publie en feed, pas en story.
      if (format === "story_serie") { toast.error("La publication directe des stories arrive bientôt : publie-la depuis l'app Instagram."); return; }
      if (format === "reel" && !igVideo) { toast.error(REEL_VIDEO_REQUIRED); return; }
      if (!igVideo && igValidImages.length === 0) { toast.error("Ajoute une image ou monte ta vidéo avant de programmer."); return; }
      if (!igVideo && igValidImages.length > INSTAGRAM_DIRECT_MAX_IMAGES) { toast.error(instagramTooManyImagesReason(igValidImages.length)); return; }
    } else if (postCanal === "linkedin") {
      if (!linkedInText) { toast.error("Rédige le texte du post avant de programmer."); return; }
    }
    if (!scheduleInput) { toast.error("Choisis une date et une heure."); return; }
    const when = new Date(scheduleInput);
    if (isNaN(when.getTime())) { toast.error("Date invalide."); return; }
    if (when.getTime() < Date.now() + 60000) { toast.error("Choisis une date/heure dans le futur."); return; }
    setSavingSchedule(true);
    try {
      const iso = when.toISOString();
      const { error } = await supabase.from("calendar_posts").update({
        scheduled_publish_at: iso, auto_publish: true, publish_status: "scheduled",
        publish_error: null, updated_at: new Date().toISOString(),
      } as any).eq("id", effectiveId);
      if (error) throw error;
      setScheduledAt(iso); setPublishStatus("scheduled"); setPublishError(null);
      setSchedulerOpen(false);
      if (scheduleAfterTokenExpiry) {
        // Programmé, mais le jeton sera expiré à l'heure dite → prévenir MAINTENANT plutôt
        // que laisser la publication échouer en silence à la date prévue.
        toast.warning("Programmé : mais reconnecte ton compte d'ici là ⚠️", {
          duration: 12000,
          description: `Ta connexion ${postCanal === "linkedin" ? "LinkedIn" : "Instagram"} expire le ${new Date(scheduleTokenExpiry!).toLocaleDateString("fr-FR")}, avant la date choisie. Sans reconnexion, la publication échouera.`,
          action: { label: "Reconnecter", onClick: () => versConnexions(navigate) },
        });
      } else {
        toast.success("Publication programmée ! 🗓️", { description: `${postCanal === "linkedin" ? "LinkedIn" : "Instagram"} publiera ce post automatiquement à l'heure prévue.` });
      }
    } catch (e: any) {
      toast.error("Échec de la programmation", { description: friendlyError(e) });
    } finally { setSavingSchedule(false); }
  };

  const handleCancelSchedule = async () => {
    if (!effectiveId) return;
    setSavingSchedule(true);
    try {
      const { error } = await supabase.from("calendar_posts").update({
        auto_publish: false, publish_status: null, updated_at: new Date().toISOString(),
      } as any).eq("id", effectiveId);
      if (error) throw error;
      setPublishStatus(null); setScheduledAt(null);
      toast.success("Programmation annulée.");
    } catch (e: any) {
      toast.error("Échec", { description: friendlyError(e) });
    } finally { setSavingSchedule(false); }
  };

  return {
    publishingInstagram,
    publishingLinkedIn,
    savingSchedule,
    connectionsKnown,
    connectionsLoading,
    refreshConnections,
    igValidImages,
    igVideo,
    instagramPublishDisabledReason,
    handlePublishInstagram,
    linkedInText,
    linkedInPublishDisabledReason,
    handlePublishLinkedIn,
    canSchedule,
    scheduleNeedsConnection,
    scheduleTokenExpiry,
    scheduleAfterTokenExpiry,
    handleSchedulePublish,
    handleCancelSchedule,
  };
}
