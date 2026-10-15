import { copyTextForChannel } from "@/lib/linkedin-copy";
import { reelCalendarCaption } from "../../../supabase/functions/_shared/reel-caption";
import { calendarPublishCaption } from "../../../supabase/functions/_shared/calendar-caption";
import { isDurableReelUrl, REEL_VIDEO_REQUIRED } from "@/lib/reel-publication";
import { resumeCrosspost } from "@/lib/crosspost-content";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { versConnexions } from "@/lib/retour-apres-detour";
import { friendlyError } from "@/lib/error-messages";
import { trackError } from "@/lib/error-tracker";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useProfile } from "@/hooks/use-profile";
import { useSocialConnections } from "@/hooks/use-social-connections";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { getGuide } from "@/lib/production-guides";
import { type CalendarPost } from "@/lib/calendar-constants";
import { supabase } from "@/integrations/supabase/client";
import { publishToInstagram, publishReelToInstagram, isPublicImageUrl, isPublicVideoUrl, isNotConnectedError } from "@/lib/instagram-publish";
import { publishTextToLinkedIn, isLinkedInNotConnectedError } from "@/lib/linkedin-publish";
import { toast } from "sonner";

import { CalendarPostMetadata } from "./CalendarPostMetadata";
import { CalendarPostPreview } from "./CalendarPostPreview";
import { INSTAGRAM_DIRECT_MAX_IMAGES, instagramTooManyImagesReason } from "@/features/creer/publish-guards";
import { isoToLocalInput, ANGLE_TO_CAROUSEL, draftFromPost } from "@/features/calendar/post-dialog-helpers";
import { PostContextHeader } from "./post-dialog/PostContextHeader";
import { PostContentViewerSheet } from "./post-dialog/PostContentViewerSheet";
import { PostEditionBlock } from "./post-dialog/PostEditionBlock";
import { PostActionsFooter } from "./post-dialog/PostActionsFooter";
import { useCalendarPostMedia } from "@/hooks/use-calendar-post-media";
import { useCalendarQuickGenerate } from "@/hooks/use-calendar-quick-generate";
import { useCalendarPostAutosave } from "@/hooks/use-calendar-post-autosave";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPost: CalendarPost | null;
  selectedDate: string | null;
  defaultCanal: string;
  onSave: (data: { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null; format: string | null; content_draft: string | null; accroche: string | null; media_urls: string[] | null; series_id: string | null; episode_number: number | null }, id?: string | null) => void;
  onAutoSave?: (data: { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null; format: string | null; content_draft: string | null; accroche: string | null; media_urls: string[] | null; series_id: string | null; episode_number: number | null }, existingId: string | null) => Promise<{ post?: CalendarPost; error?: boolean }>;
  onDelete: (id?: string | null) => void;
  onUnplan?: () => void;
  onDateChange?: (postId: string, newDate: string) => void;
  prefillData?: { theme?: string; notes?: string } | null;
}


export function CalendarPostDialog(props: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  return <CalendarPostDialogSession key={JSON.stringify([user?.id, column, value, props.editingPost?.id, props.open])} {...props} />;
}

function CalendarPostDialogSession({ open, onOpenChange, editingPost, selectedDate, defaultCanal, onSave, onAutoSave, onDelete, onUnplan, onDateChange, prefillData }: Props) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { data: profileData } = useProfile();
  const { isConnected: isSocialConnected, getTokenExpiry, known: connectionsKnown, loading: connectionsLoading, refresh: refreshConnections } = useSocialConnections();
  const [ownerName, setOwnerName] = useState("Moi");
  const [igUsername, setIgUsername] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [publishingInstagram, setPublishingInstagram] = useState(false);
  const [publishingLinkedIn, setPublishingLinkedIn] = useState(false);
  // Publication programmée
  const [scheduleInput, setScheduleInput] = useState("");
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [theme, setTheme] = useState("");
  // Le sujet peut être long : champ auto-extensible pour le lire en entier (max ~4 lignes).
  const themeRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = themeRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [theme, open]);
  const [angle, setAngle] = useState<string | null>(null);
  const [status, setStatus] = useState("idea");
  const [notes, setNotes] = useState("");
  const [linkedBrief, setLinkedBrief] = useState<{
    subject: string;
    questions: { id: string; question: string }[];
    answers: Record<string, string>;
    created_at: string;
  } | null>(null);
  const [postCanal, setPostCanal] = useState("instagram");
  const [objectif, setObjectif] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [contentDraft, setContentDraft] = useState<string | null>(null);
  const [accroche, setAccroche] = useState<string | null>(null);
  const [dialogTab, setDialogTab] = useState<"edit" | "preview" | "meta">("edit");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [showContentViewer, setContentViewerOpen] = useState(false);
  const [savedPreviewContent, setSavedPreviewContent] = useState(editingPost?.story_sequence_detail);
  const setShowContentViewer = setContentViewerOpen;
  const previewMounted = useRef(true);
  useEffect(() => { previewMounted.current = true; return () => { previewMounted.current = false; }; }, []);
  useEffect(() => { setSavedPreviewContent(editingPost?.story_sequence_detail); }, [editingPost?.story_sequence_detail]);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [episodeNumber, setEpisodeNumber] = useState<number | null>(null);
  // Auto-save silencieux
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const createdIdRef = useRef<string | null>(null);   // id du post inséré via auto-save (post neuf)

  // Payload « enregistrable » + id effectif (post existant OU post neuf déjà auto-enregistré).
  const buildSaveData = () => ({
    theme, angle, status, notes, canal: postCanal, objectif, format,
    content_draft: contentDraft, accroche,
    media_urls: mediaUrls.length > 0 ? mediaUrls : null,
    series_id: seriesId, episode_number: episodeNumber,
  });
  const effectiveId = editingPost?.id ?? createdIdRef.current;

  useEffect(() => {
    if (!profileData) return;
    if ((profileData as any).prenom) setOwnerName((profileData as any).prenom);
    if ((profileData as any).instagram_username) setIgUsername((profileData as any).instagram_username);
  }, [profileData]);

  useEffect(() => {
    if (editingPost) {
      setTheme(editingPost.theme);
      setAngle(editingPost.angle);
      setStatus(editingPost.status);
      setNotes(editingPost.notes || "");
      setObjectif(editingPost.objectif || null);
      setPostCanal(editingPost.canal || "instagram");
      setFormat((editingPost as any).format || null);
      const draft = draftFromPost(editingPost);
      setContentDraft(draft);
      setSavedDraft(draft);
      setAccroche((editingPost as any).accroche || null);
      setMediaUrls((editingPost as any).media_urls || []);
      setSeriesId((editingPost as any).series_id || null);
      setEpisodeNumber((editingPost as any).episode_number ?? null);
      const sched = (editingPost as any).scheduled_publish_at ?? null;
      setScheduledAt(sched);
      setPublishStatus((editingPost as any).publish_status ?? null);
      setPublishError((editingPost as any).publish_error ?? null);
      setPublishedPostId((editingPost as any).published_post_id ?? null);
      setScheduleInput(sched ? isoToLocalInput(sched) : "");
    } else if (prefillData) {
      setTheme(prefillData.theme || "");
      setAngle(null); setStatus("idea"); setNotes(prefillData.notes || "");
      setObjectif(null); setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
      setFormat(null); setContentDraft(null); setSavedDraft(null); setAccroche(null); setMediaUrls([]);
      setSeriesId(null); setEpisodeNumber(null);
      setScheduledAt(null); setPublishStatus(null); setPublishError(null); setPublishedPostId(null); setScheduleInput("");
    } else {
      setTheme(""); setAngle(null); setStatus("idea"); setNotes("");
      setObjectif(null); setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
      setFormat(null); setContentDraft(null); setSavedDraft(null); setAccroche(null); setMediaUrls([]);
      setSeriesId(null); setEpisodeNumber(null);
      setScheduledAt(null); setPublishStatus(null); setPublishError(null); setPublishedPostId(null); setScheduleInput("");
    }
    setDialogTab("edit");
    setShowAdvanced(false);
    // Détails (statut, canal, format, série) : ouverts pour un nouveau post (on les renseigne),
    // repliés pour un post existant (on édite surtout le contenu).
    setShowDetails(!editingPost);
    setShowSecondary(false);
    // Auto-save : repartir propre à chaque (ré)ouverture.
    createdIdRef.current = null;
    setAutoSaveState("idle");
    setSchedulerOpen(false);
  }, [editingPost, open, defaultCanal, prefillData]);

  const { runAutoSave } = useCalendarPostAutosave({
    open, editingPost, prefillData, onAutoSave, buildSaveData, createdIdRef, setAutoSaveState, setSavedDraft,
    theme, angle, status, notes, postCanal, objectif, format, contentDraft, accroche, mediaUrls, seriesId, episodeNumber,
  });

  useEffect(() => {
    if (!editingPost?.id) { setLinkedBrief(null); return; }
    const loadBrief = async () => {
      const { data } = await supabase
        .from("content_briefs")
        .select("subject, questions, answers, created_at")
        .eq("calendar_post_id", editingPost.id)
        .maybeSingle() as any;
      setLinkedBrief(data || null);
    };
    loadBrief();
  }, [editingPost?.id]);

  const guide = angle ? getGuide(angle) : null;

  // ── Handlers ──

  const { uploading, handleMediaUpload } = useCalendarPostMedia(setMediaUrls);

  const handleSave = () => {
    if (!theme.trim()) return;
    onSave(buildSaveData(), effectiveId);
    setSavedDraft(contentDraft);
  };

  const handleCopy = () => {
    if (contentDraft) { navigator.clipboard.writeText(copyTextForChannel(contentDraft, postCanal)); toast.success("Texte copié !"); }
  };

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


  const { isGenerating, handleQuickGenerate } = useCalendarQuickGenerate({
    theme, objectif, angle, format, notes, profileData, postCanal, workspaceId, user, status,
    setContentDraft, setAccroche, setStatus,
  });

  const handleSmartGenerate = () => {
    if (!theme.trim()) { toast.error("Il me faut un sujet !"); return; }
    const fmt = format || "post_carrousel";
    if (fmt === "post_carrousel" || fmt === "carousel" || fmt === "reel" || fmt === "story_serie" || postCanal === "linkedin") {
      handleNavigateToGenerator("generate"); return;
    }
    handleQuickGenerate();
  };

  const handleOpenAtelier = async () => {
    if (theme.trim() && onAutoSave) await onAutoSave(buildSaveData(), effectiveId);
    onOpenChange(false);
    setTimeout(() => {
      const detail = savedPreviewContent as any;
      const resumeIdea = resumeCrosspost(detail, format) || (detail?.slides && detail?.visual_html?.length && /^carousel/.test(detail.type || "")
        ? { format: "carousel", raw: { ...detail, carousel_type: detail.type === "carousel_photo" ? "photo" : detail.type === "carousel_mix" ? "mix" : detail.carousel_type || "text" } } : undefined);
      if (resumeIdea?.raw._crosspost && contentDraft !== editingPost?.content_draft && contentDraft != null) resumeIdea.raw.edited_text = contentDraft;
      navigate("/creer?canal=" + (postCanal || "instagram"), {
        state: { resumeIdea, fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche, launchId: editingPost?.launch_id, contentType: editingPost?.content_type, contentTypeEmoji: editingPost?.content_type_emoji, category: editingPost?.category, objective: editingPost?.objective, angleSuggestion: editingPost?.angle_suggestion, chapter: (editingPost as any)?.chapter, chapterLabel: (editingPost as any)?.chapter_label, audiencePhase: (editingPost as any)?.audience_phase },
      });
    }, 100);
  };

  const handleNavigateToGenerator = async (mode: "generate" | "regenerate" | "view") => {
    if (theme.trim() && onAutoSave) await onAutoSave(buildSaveData(), effectiveId);
    onOpenChange(false);
    setTimeout(() => {
      const params = new URLSearchParams();
      if (editingPost?.id) params.set("calendar_id", editingPost.id);
      if (theme) params.set("sujet", theme);
      if (objectif) params.set("objectif", objectif);
      params.set("from", "/calendrier");
      const state = { fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche, launchId: editingPost?.launch_id, contentType: editingPost?.content_type, category: editingPost?.category, objective: editingPost?.objective, ...(editingPost?.launch_id ? { launchContext: { launchId: editingPost.launch_id, contentType: editingPost.content_type, chapter: (editingPost as any)?.chapter, chapterLabel: (editingPost as any)?.chapter_label, audiencePhase: (editingPost as any)?.audience_phase } } : {}) };
      const fmt = format || "post_carrousel";
      if (postCanal === "newsletter" || fmt === "newsletter_standard") navigate(`/creer?format=newsletter&${params.toString()}`, { state });
      else if (postCanal === "linkedin") navigate(`/creer?canal=linkedin&${params.toString()}`, { state });
      else if (fmt === "post_carrousel" || fmt === "carousel") {
        if (angle && ANGLE_TO_CAROUSEL[angle]) params.set("carousel_type", ANGLE_TO_CAROUSEL[angle]);
        navigate(`/creer?format=carousel&${params.toString()}`, { state });
      } else if (fmt === "reel") navigate(`/creer?format=reel&${params.toString()}`, { state });
      else if (fmt === "story_serie") navigate(`/creer?format=story&${params.toString()}`, { state });
      else navigate(`/creer?canal=${postCanal || "instagram"}&${params.toString()}`, { state });
    }, 100);
  };

  const handleNavigateToDeepen = async () => {
    if (theme.trim() && onAutoSave) await onAutoSave(buildSaveData(), effectiveId);
    onOpenChange(false);
    setTimeout(() => {
      const params = new URLSearchParams();
      if (theme) params.set("sujet", theme);
      if (objectif) params.set("objectif", objectif);
      if (format) params.set("format", format);
      if (editingPost?.id) params.set("calendar_id", editingPost.id);
      params.set("from", "/calendrier");
      navigate("/creer?" + params.toString(), { state: { fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche } });
    }, 100);
  };

  const handleNavigateToFormat = (targetFormat: string) => {
    const params = new URLSearchParams();
    if (theme) params.set("sujet", theme);
    if (objectif) params.set("objectif", objectif);
    if (editingPost?.id) params.set("calendar_id", editingPost.id);
    params.set("from", "/calendrier");
    if (targetFormat === "carousel") navigate(`/creer?format=carousel&${params.toString()}`);
    else if (targetFormat === "reel") navigate(`/creer?format=reel&${params.toString()}`);
    else if (targetFormat === "story") navigate(`/creer?format=story&${params.toString()}`);
    else if (targetFormat === "linkedin") navigate(`/creer?canal=linkedin&${params.toString()}`);
    else navigate("/transformer");
  };

  // ── Render ──

  const ssd = savedPreviewContent as any;
  const syncStatus = (savedDraft || "") === (contentDraft || "") ? "synced" : "dirty";

  // Bloc édition : sujet + contenu + visuels (visibles) ; notes/brief/guide/commentaires repliés
  const editionBlock = (
    <PostEditionBlock
      editingPost={editingPost} theme={theme} setTheme={setTheme} themeRef={themeRef}
      contentDraft={contentDraft} setContentDraft={setContentDraft} accroche={accroche}
      setAccroche={setAccroche} status={status} setStatus={setStatus} isGenerating={isGenerating}
      handleSmartGenerate={handleSmartGenerate} handleCopy={handleCopy}
      handleOpenAtelier={handleOpenAtelier} handleNavigateToDeepen={handleNavigateToDeepen}
      handleNavigateToFormat={handleNavigateToFormat} postCanal={postCanal} format={format} angle={angle}
      objectif={objectif} notes={notes} setNotes={setNotes} mediaUrls={mediaUrls}
      setMediaUrls={setMediaUrls} handleSave={handleSave} onOpenChange={onOpenChange} isMobile={isMobile}
      setShowContentViewer={setShowContentViewer} uploading={uploading}
      handleMediaUpload={handleMediaUpload} showSecondary={showSecondary}
      setShowSecondary={setShowSecondary} linkedBrief={linkedBrief} guide={guide} ownerName={ownerName}
    />
  );

  // Bloc métadonnées
  const metaBlock = (
    <CalendarPostMetadata
      status={status} setStatus={setStatus} postCanal={postCanal} setPostCanal={setPostCanal}
      format={format} setFormat={setFormat} objectif={objectif} setObjectif={setObjectif}
      angle={angle} setAngle={setAngle} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
      editingPostId={editingPost?.id} selectedDate={selectedDate} onDateChange={onDateChange}
      onUnplan={onUnplan}
      seriesId={seriesId} setSeriesId={setSeriesId}
      episodeNumber={episodeNumber} setEpisodeNumber={setEpisodeNumber}
    />

  );

  // Bloc preview (avec props compact + sync)
  const previewBlock = (compact: boolean) => (
    <CalendarPostPreview
      photoComposition={ssd?.type === "photo_composition"}
      canal={postCanal} format={format} caption={contentDraft} theme={theme}
      copyCaption={calendarPublishCaption(contentDraft, ssd)}
      username={igUsername || ownerName} displayName={ownerName} mediaUrls={mediaUrls}
      visualHtml={ssd?.visual_html || null}
      visualUrls={ssd?.visual_urls || null}
      onNavigateToGenerator={() => handleNavigateToGenerator("generate")}
      hasAngle={!!angle} hasTheme={!!theme.trim()}
      slidesData={ssd?.slides || null}
      photoUrls={ssd?.photo_urls || null}
      storiesData={ssd?.type === "stories" ? ssd.stories || null : null}
      compact={compact}
      onFullscreen={ssd && ssd.type !== "photo_composition" ? () => setShowContentViewer(true) : undefined}
      syncStatus={contentDraft ? syncStatus : undefined}
    />
  );

  const contextHeader = (
    <PostContextHeader postCanal={postCanal} format={format} objectif={objectif} angle={angle} selectedDate={selectedDate} status={status} setStatus={setStatus} />
  );

  // Panneau "Détails" repliable : reprend tous les réglages (statut, date, canal, format, objectif, angle, série)
  const detailsPanel = (
    <Collapsible open={showDetails} onOpenChange={setShowDetails}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1">
        <span>Détails du post : statut, canal, format, série</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="rounded-[12px] border border-border bg-card/30 p-3 space-y-4">
          {metaBlock}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  // Footer actions : auto-save silencieux + UN bouton « Publier ▾ »
  const publishNowDisabled = publishingInstagram || publishingLinkedIn
    || (postCanal === "instagram" ? !!instagramPublishDisabledReason : postCanal === "linkedin" ? !!linkedInPublishDisabledReason : true);
  const handlePublishNow = () => { if (postCanal === "linkedin") handlePublishLinkedIn(); else handlePublishInstagram(); };
  // Déjà publié (statut éditorial OU auto-publication) → on n'offre plus « Publier » / « Programmer ».
  const alreadyPublished = status === "published" || publishStatus === "published";
  const canPublishActions = canSchedule && !alreadyPublished;

  const actionsBlock = (
    <PostActionsFooter
      canSchedule={canSchedule} publishStatus={publishStatus} scheduledAt={scheduledAt}
      handleCancelSchedule={handleCancelSchedule} savingSchedule={savingSchedule}
      publishError={publishError} schedulerOpen={schedulerOpen} setSchedulerOpen={setSchedulerOpen}
      postCanal={postCanal} igValidImages={igValidImages} connectionsKnown={connectionsKnown}
      connectionsLoading={connectionsLoading} refreshConnections={refreshConnections}
      scheduleNeedsConnection={scheduleNeedsConnection} navigate={navigate} scheduleInput={scheduleInput}
      setScheduleInput={setScheduleInput} handleSchedulePublish={handleSchedulePublish}
      scheduleAfterTokenExpiry={scheduleAfterTokenExpiry} scheduleTokenExpiry={scheduleTokenExpiry}
      igVideo={igVideo} linkedInText={linkedInText} autoSaveState={autoSaveState}
      runAutoSave={runAutoSave} theme={theme} effectiveId={effectiveId} confirm={confirm}
      onDelete={onDelete} publishingInstagram={publishingInstagram}
      publishingLinkedIn={publishingLinkedIn} canPublishActions={canPublishActions}
      handlePublishNow={handlePublishNow} publishNowDisabled={publishNowDisabled}
      editingPost={editingPost} onUnplan={onUnplan}
    />
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "overflow-hidden flex flex-col p-0",
        isMobile
          ? "max-w-none w-[calc(100vw-1rem)] h-[94dvh] max-h-[94dvh]"
          : "sm:max-w-6xl max-h-[90vh]"
      )}>
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b border-border space-y-0 text-left">
          <DialogTitle className="sr-only">{editingPost ? "Modifier le post" : "Ajouter un post"}</DialogTitle>
          <DialogDescription className="sr-only">Formulaire de création ou modification d'un post du calendrier éditorial</DialogDescription>
          {contextHeader}
        </DialogHeader>

        {isMobile ? (
          // ── Mobile : 3 tabs ──
          <Tabs value={dialogTab} onValueChange={(v) => setDialogTab(v as any)} className="flex-1 flex flex-col overflow-hidden px-6 pt-3 pb-6">
            <TabsList className="grid grid-cols-3 w-full rounded-pill bg-muted h-9 shrink-0">
              <TabsTrigger value="edit" className="rounded-pill text-xs">✏️ Éditer</TabsTrigger>
              <TabsTrigger value="preview" className="rounded-pill text-xs" disabled={!editingPost}>👁️ Aperçu</TabsTrigger>
              <TabsTrigger value="meta" className="rounded-pill text-xs">📋 Détails</TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-y-auto mt-3">
              <TabsContent value="edit" className="mt-0">{editionBlock}</TabsContent>
              <TabsContent value="preview" className="mt-0">{previewBlock(true)}</TabsContent>
              <TabsContent value="meta" className="mt-0 space-y-4">{metaBlock}</TabsContent>
            </div>
            {actionsBlock}
          </Tabs>
        ) : (
          // ── Desktop : détails repliables + 2 colonnes (contenu | aperçu) ──
          <div className="flex-1 flex flex-col overflow-hidden px-6 pt-3 pb-6">
            <div className="shrink-0">{detailsPanel}</div>
            <div className="flex-1 overflow-y-auto mt-3">
              <div className="grid grid-cols-[1fr_340px] gap-5">
                {/* Contenu */}
                <main className="min-w-0 border-r border-border pr-5">
                  {editionBlock}
                </main>

                {/* Aperçu live (sticky) */}
                <aside className="space-y-2">
                  <div className="sticky top-0">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Aperçu live</p>
                    {previewBlock(true)}
                  </div>
                </aside>
              </div>
            </div>
            {actionsBlock}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Content Viewer Sheet */}
    <PostContentViewerSheet
      showContentViewer={showContentViewer} setShowContentViewer={setShowContentViewer}
      editingPost={editingPost} column={column} value={value}
      savedPreviewContent={savedPreviewContent} setSavedPreviewContent={setSavedPreviewContent}
      previewMounted={previewMounted} handleOpenAtelier={handleOpenAtelier}
    />
    </>
  );
}
