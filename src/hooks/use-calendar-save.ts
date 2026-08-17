import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { clearFlowState } from "@/hooks/use-flow-persistence";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { extractInstagramCaption, extractLinkedInText, canAutoPublishSchedule, buildScheduledPublishUpdate } from "@/features/creer/publish-guards";
import {
  uploadPhotosToStorage as uploadPhotosImpl,
  uploadVisualsToStorage as uploadVisualsImpl,
  uploadPinterestVisualToStorage as uploadPinterestVisualImpl,
} from "@/features/creer/upload-helpers";

interface UseCalendarSaveParams {
  session: { user: { id?: string } } | null;
  result: any;
  selectedFormat: string | null;
  isLinkedInCarousel: boolean;
  chosenProposal: any;
  inspirationAnalysis: any;
  ideaText: string;
  workspaceId: string;
  objective: string | null;
  editorialAngle: string | null;
  savedId: string | null;
  carouselSubMode: "text" | "photo" | "mix" | "pure_photo" | "user_slides" | null;
  uploadedPhotos: any[];
  photoMode: boolean;
  visualSlides: { slide_number: number; html: string }[];
  pinterestPinHtml: string | null;
  photoBriefOverlayHtml: string | null;
  currentBriefId: string | null;
  reelMp4Url: string | null;
  publishableImageUrl: string | null | undefined;
  calendarPostId: string | null;
  calendarPostDate: string | null;
  setPublishDialogOpen: (open: boolean) => void;
  persistCarousel: () => Promise<void>;
}

/**
 * Sauvegarde dans le calendrier — deux fonctions quasi-jumelles partageant
 * la même séquence d'upload (photos → visuels → pinterest visual/overlay),
 * mutualisée dans `uploadPostMedia` (les différences réelles passent en
 * options) :
 * - `handleConfirmCalendar` : nouveau post (insert), avec programmation
 *   optionnelle (auto_publish + scheduled_publish_at).
 * - `handleSaveBackToCalendar` : mise à jour d'un post existant
 *   (`calendarPostId`, venu du calendrier), sans programmation.
 *
 * Retourne `{ savingToCalendar, handleConfirmCalendar, handleSaveBackToCalendar }`.
 */
export function useCalendarSave({
  session,
  result,
  selectedFormat,
  isLinkedInCarousel,
  chosenProposal,
  inspirationAnalysis,
  ideaText,
  workspaceId,
  objective,
  editorialAngle,
  savedId,
  carouselSubMode,
  uploadedPhotos,
  photoMode,
  visualSlides,
  pinterestPinHtml,
  photoBriefOverlayHtml,
  currentBriefId,
  reelMp4Url,
  publishableImageUrl,
  calendarPostId,
  calendarPostDate,
  setPublishDialogOpen,
  persistCarousel,
}: UseCalendarSaveParams) {
  const navigate = useNavigate();
  const [savingToCalendar, setSavingToCalendar] = useState(false);

  // Extraction pure (testée) : voir src/features/creer/build-calendar-content.ts
  const extractContentForCalendar = () => buildCalendarContent(selectedFormat, result?.raw);

  // Upload helpers extraits dans src/features/creer/upload-helpers.ts (wrappers fins).
  const uploadPhotosToStorage = (postId: string): Promise<string[]> =>
    uploadPhotosImpl(supabase, session?.user?.id, postId, uploadedPhotos);
  const uploadVisualsToStorage = (postId: string, onProgress?: (done: number, total: number) => void): Promise<string[]> =>
    uploadVisualsImpl(supabase, session?.user?.id, postId, visualSlides, onProgress);
  const uploadPinterestVisualToStorage = (postId: string, pinHtml: string): Promise<string[]> =>
    uploadPinterestVisualImpl(supabase, session?.user?.id, postId, pinHtml);

  /**
   * Séquence d'upload commune aux deux sauvegardes : photos originales →
   * visuels PNG (+ HTML source pour le PowerPoint éditable) → visuel
   * Pinterest → overlay brief photo. Chaque étape est isolée dans son
   * try/catch : un échec n'interrompt pas les suivantes. Retourne l'objet
   * d'updates (photo_urls / visual_urls / visual_html) que chaque appelant
   * fusionne ensuite à sa façon dans `story_sequence_detail`.
   */
  const uploadPostMedia = async (
    postId: string,
    {
      includePhotoModePhotos,
      warnSuffix,
      onUploadError,
    }: {
      /** handleConfirmCalendar : `photoMode` déclenche aussi l'upload des photos. */
      includePhotoModePhotos: boolean;
      /** Suffixe des console.warn — « (non-blocking) » côté confirm ; l'overlay l'a dans les deux flux. */
      warnSuffix: "" | " (non-blocking)";
      /** handleSaveBackToCalendar : marque l'échec pour dégrader le toast final. */
      onUploadError?: () => void;
    },
  ): Promise<any> => {
    const updates: any = {};

    // Upload photos originales dans Storage
    if ((carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo" || carouselSubMode === "user_slides" || (includePhotoModePhotos && photoMode)) && uploadedPhotos.length > 0) {
      try {
        const photoUrls = await uploadPhotosToStorage(postId);
        if (photoUrls.length > 0) updates.photo_urls = photoUrls;
      } catch (err) {
        console.warn(`Photo upload failed${warnSuffix}:`, err);
        onUploadError?.();
      }
    }

    // Upload visuels PNG dans Storage
    if (visualSlides.length > 0) {
      try {
        toast.info("Upload des visuels...");
        const visualUrls = await uploadVisualsToStorage(postId);
        if (visualUrls.length > 0) updates.visual_urls = visualUrls;
        // Persist source HTML to enable PowerPoint éditable from calendar
        updates.visual_html = visualSlides;
      } catch (err) {
        console.warn(`Visual upload failed${warnSuffix}:`, err);
        onUploadError?.();
      }
    }

    // Upload visuel Pinterest dans Storage
    if (selectedFormat === "pinterest_visual" && pinterestPinHtml) {
      try {
        toast.info("Upload du visuel Pinterest...");
        const pinVisualUrls = await uploadPinterestVisualToStorage(postId, pinterestPinHtml);
        if (pinVisualUrls.length > 0) updates.visual_urls = pinVisualUrls;
        updates.visual_html = [{ slide_number: 1, html: pinterestPinHtml }];
      } catch (err) {
        console.warn(`Pinterest visual upload failed${warnSuffix}:`, err);
        onUploadError?.();
      }
    }

    // Upload overlay Pinterest photo brief
    if (selectedFormat === "pinterest_photo" && photoBriefOverlayHtml) {
      try {
        toast.info("Upload de l'overlay...");
        const overlayUrls = await uploadPinterestVisualToStorage(postId, photoBriefOverlayHtml);
        if (overlayUrls.length > 0) updates.visual_urls = overlayUrls;
        updates.visual_html = [{ slide_number: 1, html: photoBriefOverlayHtml }];
      } catch (err) {
        console.warn("Overlay upload failed (non-blocking):", err);
        onUploadError?.();
      }
    }

    return updates;
  };

  // Save back to existing calendar post (when coming from calendar)
  const handleSaveBackToCalendar = async () => {
    if (!session?.user?.id || !calendarPostId || !result?.raw) return;
    setSavingToCalendar(true);
    try {
      if (selectedFormat === "carousel" && !savedId && result?.raw?.slides) {
        await persistCarousel();
      }
      const { contentDraft, accroche, storyDetail } = extractContentForCalendar();
      const r = result?.raw;
      const { error } = await supabase.from("calendar_posts").update({
        content_draft: contentDraft,
        accroche: accroche || null,
        status: "drafting",
        format: selectedFormat === "story" ? "story_serie" : (selectedFormat || "post"),
        objectif: objective || null,
        angle: editorialAngle || null,
        ...(storyDetail ? { story_sequence_detail: storyDetail } : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", calendarPostId);
      if (error) throw error;

      // Upload visuels et photos dans Storage
      let uploadFailed = false;
      if (calendarPostId) {
        const storageUpdates = await uploadPostMedia(calendarPostId, {
          includePhotoModePhotos: false,
          warnSuffix: "",
          onUploadError: () => { uploadFailed = true; },
        });

        if (Object.keys(storageUpdates).length > 0) {
          const currentDetail = storyDetail || {};
          const { error: mediaError } = await supabase.from("calendar_posts").update({
            story_sequence_detail: { ...currentDetail, ...storageUpdates },
          }).eq("id", calendarPostId);
          if (mediaError) throw mediaError;
        }
      }

      // Lier le brief au post calendrier
      if (currentBriefId && calendarPostId) {
        const { error: briefError } = await supabase.from("content_briefs").update({ calendar_post_id: calendarPostId } as any).eq("id", currentBriefId);
        if (briefError) throw briefError;
      }

      if (uploadFailed) {
        toast.warning("Texte sauvegardé, mais l'upload des visuels a échoué. Tu pourras les régénérer depuis le calendrier.");
      } else {
        toast.success("Contenu sauvegardé dans ton calendrier !");
      }
      clearFlowState();
      navigate(`/calendrier?date=${calendarPostDate || ""}&post=${calendarPostId}`);
    } catch (e: any) {
      toast.error(e?.message || "Erreur de sauvegarde");
    } finally {
      setSavingToCalendar(false);
    }
  };

  /**
   * Sauvegarde le contenu dans calendar_posts.
   * - Sans `scheduleAt` : brouillon éditorial classique (comportement historique).
   * - Avec `scheduleAt` : pose EN PLUS l'auto-publication (auto_publish +
   *   scheduled_publish_at) — le cron social-publish-scheduled publiera tout seul.
   * Renvoie true si la programmation a bien été posée.
   */
  const handleConfirmCalendar = async ({ date, scheduleAt }: { date: string; scheduleAt?: Date }): Promise<boolean> => {
    if (!session?.user?.id || !date || savingToCalendar) return false;
    setSavingToCalendar(true);
    try {
      let { contentDraft } = extractContentForCalendar();
      const { accroche, storyDetail } = extractContentForCalendar();
      const r = result?.raw;
      const fmt = selectedFormat === "story" ? "story_serie" : (selectedFormat || "post");
      const canal = selectedFormat === "linkedin" || isLinkedInCarousel ? "linkedin" : selectedFormat === "pinterest" || selectedFormat === "pinterest_visual" || selectedFormat === "pinterest_photo" ? "pinterest" : selectedFormat === "newsletter" ? "newsletter" : "instagram";

      // Programmation : le cron publie content_draft TEL QUEL comme légende.
      // Le brouillon calendrier (déroulé « SLIDE 1 : … ») n'est pas publiable :
      // on y met la légende propre, celle que la publication immédiate enverrait.
      if (scheduleAt) {
        contentDraft = canal === "linkedin" ? extractLinkedInText(r) : extractInstagramCaption(r);
      }

      // Calculate calendar notes for inspiration-based pins
      let calendarNotes = "";
      if ((selectedFormat === "pinterest_visual" || selectedFormat === "pinterest_photo") && chosenProposal && inspirationAnalysis) {
        calendarNotes = `🔍 Inspiré de : ${inspirationAnalysis.source_description || ""}\n📐 Angle : ${chosenProposal.angle || ""}`;
        if (selectedFormat === "pinterest_photo" && result?.raw?.photo_brief) {
          const b = result.raw.photo_brief;
          calendarNotes += `\n\n📷 BRIEF PHOTO :\n• Sujet : ${b.what || ""}\n• Cadrage : ${b.framing || ""}\n• Lumière : ${b.lighting || ""}\n• Accessoires : ${(b.props || []).join(", ")}\n• Ambiance : ${b.mood || ""}`;
        }
      }

      const { data: insertedPost, error: insertError } = await supabase.from("calendar_posts").insert({
        user_id: session.user.id,
        ...(workspaceId && workspaceId !== session.user.id ? { workspace_id: workspaceId } : {}),
        date,
        theme: ideaText,
        status: "drafting",
        canal,
        format: fmt,
        objectif: objective || null,
        angle: editorialAngle || null,
        content_draft: contentDraft,
        accroche,
        ...(calendarNotes ? { notes: calendarNotes } : {}),
        ...(storyDetail ? { story_sequence_detail: storyDetail } : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
      }).select("id").single();

      if (insertError) throw insertError;

      const postId = insertedPost?.id;
      // Médias effectivement joints au post (visuels rendus > photos brutes) —
      // c'est ce que le cron de publication programmée lira dans media_urls.
      let attachedMedia: string[] | null = null;

      if (postId) {
        const updates = await uploadPostMedia(postId, {
          includePhotoModePhotos: true,
          warnSuffix: " (non-blocking)",
        });

        if (Object.keys(updates).length > 0) {
          const currentDetail = storyDetail || {};
          // Surface les visuels/photos dans la colonne top-level media_urls :
          // c'est elle que lisent la vue partagée, la vue liste ET le cron de
          // publication programmée (pas story_sequence_detail).
          const mediaForColumn =
            (updates.visual_urls && updates.visual_urls.length > 0)
              ? updates.visual_urls
              : (updates.photo_urls && updates.photo_urls.length > 0 ? updates.photo_urls : null);
          attachedMedia = mediaForColumn;
          const { error: mediaError } = await supabase.from("calendar_posts").update({
            story_sequence_detail: {
              ...currentDetail,
              ...updates,
            },
            ...(mediaForColumn ? { media_urls: mediaForColumn } : {}),
          }).eq("id", postId);
          if (mediaError) throw mediaError;
        }

        // Reel monté : la VIDÉO est le média du post, elle passe avant tout
        // visuel de repli. Son URL est déjà durable (bucket `calendar-media`),
        // donc publiable par le cron comme par la publication immédiate.
        if (selectedFormat === "reel" && reelMp4Url) {
          attachedMedia = [reelMp4Url];
          const { error: reelError } = await supabase.from("calendar_posts").update({ media_urls: attachedMedia }).eq("id", postId);
          if (reelError) throw reelError;
        }

        // Programmation d'un post image simple sans upload (ex: photo Pexels) :
        // l'image publiable vit à une URL https publique → on la met dans
        // media_urls pour que le cron ait quelque chose à publier.
        if (scheduleAt && canal === "instagram" && !attachedMedia && publishableImageUrl) {
          attachedMedia = [publishableImageUrl];
          const { error: imageError } = await supabase.from("calendar_posts").update({ media_urls: attachedMedia }).eq("id", postId);
          if (imageError) throw imageError;
        }
      }

      // Lier le brief au post calendrier
      if (currentBriefId && postId) {
        const { error: briefError } = await supabase.from("content_briefs").update({ calendar_post_id: postId } as any).eq("id", currentBriefId);
        if (briefError) throw briefError;
      }

      // Pose l'auto-publication (le cron social-publish-scheduled fera le reste).
      let scheduled = false;
      if (scheduleAt && postId) {
        if (!canAutoPublishSchedule({ canal, attachedMedia })) {
          toast.warning("Ajouté au calendrier en brouillon, mais pas programmé : aucun visuel n'a pu être joint. Réessaie la programmation depuis le calendrier.");
        } else {
          const { error: schedError } = await supabase.from("calendar_posts").update(
            buildScheduledPublishUpdate(scheduleAt) as any,
          ).eq("id", postId);
          if (schedError) {
            toast.warning("Ajouté au calendrier, mais la programmation a échoué. Programme-le depuis le calendrier.");
          } else {
            scheduled = true;
          }
        }
      }

      if (scheduled) {
        toast.success("Publication programmée ! 🗓️", {
          description: `${canal === "linkedin" ? "LinkedIn" : "Instagram"} publiera ce contenu automatiquement à l'heure prévue.`,
        });
      } else if (!scheduleAt) {
        toast.success("Ajouté au calendrier !");
      }
      setPublishDialogOpen(false);
      clearFlowState();

      if (postId) {
        navigate(`/calendrier?date=${date}&post=${postId}`);
      } else {
        navigate(`/calendrier?date=${date}`);
      }
      return scheduled;
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
      return false;
    } finally {
      setSavingToCalendar(false);
    }
  };

  return { savingToCalendar, handleConfirmCalendar, handleSaveBackToCalendar, uploadVisualsToStorage };
}
