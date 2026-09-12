import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { commitCalendarContent, calendarSaveError } from "@/lib/calendar-persistence";
import { reportClientError } from "@/lib/client-error-monitor";
import { supabase } from "@/integrations/supabase/client";
import { clearFlowState, loadFlowState, saveFlowState } from "@/hooks/use-flow-persistence";
import { buildCalendarContent } from "@/features/creer/build-calendar-content";
import { extractInstagramCaption, extractLinkedInText, canAutoPublishSchedule, buildScheduledPublishUpdate } from "@/features/creer/publish-guards";
import {
  uploadPhotosToStorage as uploadPhotosImpl,
  uploadVisualsToStorage as uploadVisualsImpl,
  uploadPinterestVisualToStorage as uploadPinterestVisualImpl,
} from "@/features/creer/upload-helpers";

interface UseCalendarSaveParams {
  creationId?: string;
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
  /** Idée de départ (saved_ideas.id) : reliée au post et passée en « Créée ». */
  editingIdeaId?: string | null;
  carouselQualityDisabledReason?: string;
  reelMp4Url: string | null;
  publishableImageUrl: string | null | undefined;
  calendarPostId: string | null;
  calendarPostDate: string | null;
  setPublishDialogOpen: (open: boolean) => void;
  persistCarousel?: () => Promise<unknown>;
}

/**
 * Sauvegarde dans le calendrier — deux fonctions quasi-jumelles partageant
 * la même préparation des médias (photos → visuels → Pinterest),
 * mutualisée dans `uploadPostMedia`, avant une écriture complète du post :
 * - `handleConfirmCalendar` : nouveau post (insert), avec programmation
 *   optionnelle (auto_publish + scheduled_publish_at).
 * - `handleSaveBackToCalendar` : mise à jour d'un post existant
 *   (`calendarPostId`, venu du calendrier), sans programmation.
 *
 * Retourne `{ savingToCalendar, handleConfirmCalendar, handleSaveBackToCalendar }`.
 */
export function useCalendarSave({
  creationId: flowCreationId,
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
  editingIdeaId = null,
  carouselQualityDisabledReason,
  reelMp4Url,
  publishableImageUrl,
  calendarPostId,
  calendarPostDate,
  setPublishDialogOpen,
}: UseCalendarSaveParams) {
  const navigate = useNavigate();
  const [savingToCalendar, setSavingToCalendar] = useState(false);
  // React state is asynchronous: also lock synchronously before the first await.
  const saveInFlight = useRef(false);

  const creationId = useRef(flowCreationId || loadFlowState()?.creationId || crypto.randomUUID());
  if (flowCreationId) creationId.current = flowCreationId;
  const editorScope = `${session?.user?.id || ""}:${workspaceId}:${calendarPostId || "new"}:${creationId.current}`;
  const activeScope = useRef(editorScope);
  activeScope.current = editorScope;
  const versionRead = useRef<{ id: string; promise: Promise<string> } | null>(null);
  const readVersion = (id: string): Promise<string> => {
    if (versionRead.current?.id === id) return versionRead.current.promise;
    const persisted = loadFlowState();
    const promise = persisted?.calendarPostId === id && persisted.calendarPostUpdatedAt
      ? Promise.resolve(persisted.calendarPostUpdatedAt)
      : (async () => {
        const { data, error } = await supabase.from("calendar_posts").select("updated_at").eq("id", id).single();
        if (error || !data?.updated_at) throw error || new Error("calendar_not_found");
        if (activeScope.current === editorScope) saveFlowState({ calendarPostUpdatedAt: data.updated_at });
        return data.updated_at;
      })();
    versionRead.current = { id, promise };
    return promise;
  };
  useEffect(() => {
    activeScope.current = editorScope;
    saveFlowState({ creationId: creationId.current });
    if (calendarPostId) void readVersion(calendarPostId).catch(() => { versionRead.current = null; });
    return () => { activeScope.current = "unmounted"; };
    // Capture the version when opening this calendar document, not after editing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorScope]);
  const assertCurrentEditor = () => {
    if (activeScope.current !== editorScope) throw new Error("Le contenu ouvert a changé. Reviens au contenu d’origine pour terminer sa sauvegarde.");
  };

  const publishedCalendarId = useRef<string | null>(loadFlowState()?.publishedCalendarId || null);

  /** Called only after the social API confirms success. A tracking failure must
   * never be presented as a failed publication (which invites a public duplicate).
   */
  const recordImmediatePublication = async ({ canal, caption, postId }: {
    canal: "instagram" | "linkedin"; caption: string; postId?: string;
  }): Promise<boolean> => {
    if (!session?.user?.id) return false;
    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const { accroche, storyDetail } = extractContentForCalendar();
      const payload = {
        theme: ideaText, canal, date, format: selectedFormat || "post",
        content_draft: caption, accroche, status: "published",
        publish_status: "published", published_at: now.toISOString(),
        published_post_id: postId || null, publish_error: null,
        auto_publish: false, scheduled_publish_at: null,
        updated_at: now.toISOString(),
        story_sequence_detail: { ...(storyDetail || {}), ...(visualSlides.length ? { visual_html: visualSlides } : {}) },
        ...(publishableImageUrl ? { media_urls: [publishableImageUrl] } : {}),
      };
      let id = publishedCalendarId.current || calendarPostId;
      if (id) {
        const { error } = await supabase.from("calendar_posts").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("calendar_posts").insert({
          ...payload, user_id: session.user.id,
          ...(workspaceId && workspaceId !== session.user.id ? { workspace_id: workspaceId } : {}),
        }).select("id").single();
        if (error) throw error;
        if (!data?.id) throw new Error("Publication non retrouvée dans le calendrier");
        id = data.id;
      }
      // Track the completed publication, but never attach it to a newer editor.
      if (activeScope.current === editorScope) {
        publishedCalendarId.current = id;
        saveFlowState({ publishedCalendarId: id });
      }
      if (editingIdeaId) {
        const { error } = await supabase.from("saved_ideas").update({
          calendar_post_id: id, status: "planned", planned_date: date, updated_at: now.toISOString(),
        }).eq("id", editingIdeaId);
        if (error) throw error;
      }
      if (currentBriefId) {
        const { error } = await supabase.from("content_briefs").update({ calendar_post_id: id }).eq("id", currentBriefId);
        if (error) throw error;
      }
      return true;
    } catch (error) {
      console.error("Publication réussie, suivi calendrier incomplet", error);
      toast.warning("Ton contenu est publié, mais son suivi dans le calendrier n’a pas été enregistré. Ne le republie pas.");
      return false;
    }
  };

  // Extraction pure (testée) : voir src/features/creer/build-calendar-content.ts
  const extractContentForCalendar = () => buildCalendarContent(selectedFormat, result?.raw);

  // Upload helpers extraits dans src/features/creer/upload-helpers.ts (wrappers fins).
  const uploadVisualsToStorage = (postId: string, onProgress?: (done: number, total: number) => void): Promise<string[]> =>
    uploadVisualsImpl(supabase, session?.user?.id, postId, visualSlides, onProgress);

  /** Prepare every required asset before committing the calendar record. */
  const uploadPostMedia = async (postId: string): Promise<any> => {
    const paths: string[] = [];
    const uploaded = (path: string) => paths.push(path);
    const updates: any = {};
    try {
    if ((carouselSubMode === "photo" || carouselSubMode === "mix" || carouselSubMode === "pure_photo" || carouselSubMode === "user_slides" || photoMode) && uploadedPhotos.length > 0) {
      const urls = await uploadPhotosImpl(supabase, session?.user?.id, postId, uploadedPhotos, uploaded);
      if (urls.length !== uploadedPhotos.length) throw new Error("Certaines photos manquent. Ton contenu reste dans l’éditeur : réessaie l’enregistrement.");
      updates.photo_urls = urls;
    }
    if (visualSlides.length > 0) {
      toast.info("Upload des visuels...");
      const urls = await uploadVisualsImpl(supabase, session?.user?.id, postId, visualSlides, undefined, uploaded);
      if (urls.length !== visualSlides.length) throw new Error("Certains visuels manquent. Ton contenu reste dans l’éditeur : réessaie l’enregistrement.");
      updates.visual_urls = urls;
      updates.visual_html = visualSlides;
    }
    const pinHtml = selectedFormat === "pinterest_visual" ? pinterestPinHtml
      : selectedFormat === "pinterest_photo" ? photoBriefOverlayHtml : null;
    if (pinHtml) {
      const urls = await uploadPinterestVisualImpl(supabase, session?.user?.id, postId, pinHtml, uploaded);
      if (urls.length !== 1) throw new Error("Le visuel Pinterest n’a pas pu être enregistré. Ton contenu reste dans l’éditeur.");
      updates.visual_urls = urls;
      updates.visual_html = [{ slide_number: 1, html: pinHtml }];
    }
    return updates;
    } catch (error) {
      // No DB write has started. Only remove this attempt's acknowledged uploads,
      // never older assets or files from an ambiguous database commit.
      if (paths.length) {
        try {
          const { error: cleanupError } = await supabase.storage.from("calendar-visuals").remove(paths);
          if (cleanupError) throw cleanupError;
        } catch {
          void reportClientError("operation");
          toast.warning("L’enregistrement a été interrompu. Le nettoyage de certains fichiers temporaires n’a pas pu être confirmé.");
        }
      }
      throw error;
    }
  };

  // Save back to existing calendar post (when coming from calendar)
  const handleSaveBackToCalendar = async () => {
    if (!session?.user?.id || !calendarPostId || !result?.raw || saveInFlight.current) return;
    saveInFlight.current = true;
    setSavingToCalendar(true);
    try {
      if (carouselQualityDisabledReason) {
        const { data: current, error: readError } = await supabase.from("calendar_posts").select("auto_publish").eq("id", calendarPostId).single();
        if (readError) throw readError;
        if (current?.auto_publish) { toast.error(carouselQualityDisabledReason); return; }
      }
      const expectedUpdatedAt = await readVersion(calendarPostId);
      const { contentDraft, accroche, storyDetail } = extractContentForCalendar();
      const r = result?.raw;
      const storageUpdates = await uploadPostMedia(calendarPostId);
      const attachedMedia = selectedFormat === "reel" && reelMp4Url ? [reelMp4Url]
        : storageUpdates.visual_urls || storageUpdates.photo_urls;
      assertCurrentEditor();
      const receipt = await commitCalendarContent({ postId: calendarPostId, create: false,
        briefId: currentBriefId, ideaId: editingIdeaId, expectedUpdatedAt, payload: {
        content_draft: contentDraft,
        accroche: accroche || null,
        status: "drafting",
        format: selectedFormat === "story" ? "story_serie" : (selectedFormat || "post"),
        objectif: objective || null,
        angle: editorialAngle || null,
        ...((storyDetail || Object.keys(storageUpdates).length) ? { story_sequence_detail: { ...(storyDetail || {}), ...storageUpdates } } : {}),
        ...(attachedMedia?.length ? { media_urls: attachedMedia } : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
        updated_at: new Date().toISOString(),
      } });
      assertCurrentEditor();
      versionRead.current = { id: calendarPostId, promise: Promise.resolve(receipt.updated_at) };
      toast.success("Contenu sauvegardé dans ton calendrier !");
      clearFlowState();
      navigate(`/calendrier?date=${calendarPostDate || ""}&post=${calendarPostId}`);
    } catch (e: any) {
      void reportClientError("operation");
      if (activeScope.current === editorScope) toast.error(calendarSaveError(e));
    } finally {
      saveInFlight.current = false;
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
    if (!session?.user?.id || !date || !result?.raw || saveInFlight.current) return false;
    if (scheduleAt && carouselQualityDisabledReason) { toast.error(carouselQualityDisabledReason); return false; }
    // La publication immédiate a déjà créé sa ligne de suivi. Une sauvegarde ou
    // programmation consécutive doit ouvrir cette ligne, sans nouvel insert et
    // sans risquer de republier le même contenu.
    if (publishedCalendarId.current) {
      const id = publishedCalendarId.current;
      const now = new Date();
      const publishedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      setPublishDialogOpen(false);
      clearFlowState();
      toast.info(scheduleAt
        ? "Ce contenu est déjà publié : il reste enregistré une seule fois dans ton calendrier."
        : "Ce contenu est déjà enregistré dans ton calendrier.");
      navigate(`/calendrier?date=${publishedDate}&post=${id}`);
      return false;
    }
    saveInFlight.current = true;
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

      // Allocate an ID without exposing a half-written calendar row.
      const preparedPostId = creationId.current;
      saveFlowState({ creationId: preparedPostId });
      const updates = await uploadPostMedia(preparedPostId);
      let attachedMedia: string[] | null = updates.visual_urls || updates.photo_urls || null;
      if (selectedFormat === "reel" && reelMp4Url) attachedMedia = [reelMp4Url];
      if (scheduleAt && canal === "instagram" && !attachedMedia && publishableImageUrl) attachedMedia = [publishableImageUrl];
      if (scheduleAt && !canAutoPublishSchedule({ canal, attachedMedia })) {
        throw new Error("Aucun visuel n’a pu être joint. Ton contenu reste dans l’éditeur : ajoute un média avant de programmer.");
      }
      assertCurrentEditor();
      const receipt = await commitCalendarContent({ postId: preparedPostId, create: true,
        briefId: currentBriefId, ideaId: editingIdeaId, payload: {
        id: preparedPostId,
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
        ...((storyDetail || Object.keys(updates).length) ? { story_sequence_detail: { ...(storyDetail || {}), ...updates } } : {}),
        ...(attachedMedia ? { media_urls: attachedMedia } : {}),
        ...(scheduleAt ? buildScheduledPublishUpdate(scheduleAt) : {}),
        ...(selectedFormat === "story" && r?.stories ? {
          stories_count: r.total_stories || r.stories?.length || null,
          stories_structure: r.structure_label || r.structure_type || null,
          stories_objective: objective || null,
        } : {}),
        ...(savedId ? { generated_content_id: savedId, generated_content_type: "carousel" } : {}),
      } });
      assertCurrentEditor();
      const postId = receipt.id;
      const scheduled = receipt.scheduled;
      if (receipt.replayed) {
        toast.info("La première tentative avait déjà été enregistrée. Ton travail reste dans l’éditeur pour comparer les versions.", {
          action: { label: "Voir le calendrier", onClick: () => navigate(`/calendrier?post=${postId}`) },
        });
        setPublishDialogOpen(false);
        return scheduled;
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

      navigate(`/calendrier?date=${date}&post=${postId}`);
      return scheduled;
    } catch (e: any) {
      void reportClientError("operation");
      if (activeScope.current === editorScope) toast.error(calendarSaveError(e));
      return false;
    } finally {
      saveInFlight.current = false;
      setSavingToCalendar(false);
    }
  };

  /** « Nouveau contenu » : le suivi de la publication précédente ne doit plus
   * bloquer l'enregistrement du contenu suivant dans le même onglet. */
  const resetPublishedTracking = () => {
    publishedCalendarId.current = null;
    creationId.current = crypto.randomUUID();
    versionRead.current = null;
    activeScope.current = "reset";
  };

  return { savingToCalendar, handleConfirmCalendar, handleSaveBackToCalendar, uploadVisualsToStorage, recordImmediatePublication, resetPublishedTracking };
}
