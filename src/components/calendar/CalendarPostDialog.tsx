import { copyTextForChannel } from "@/lib/linkedin-copy";
import { calendarPublishCaption } from "../../../supabase/functions/_shared/calendar-caption";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useProfile } from "@/hooks/use-profile";
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
import { toast } from "sonner";

import { CalendarPostMetadata } from "./CalendarPostMetadata";
import { CalendarPostPreview } from "./CalendarPostPreview";
import { isoToLocalInput, draftFromPost } from "@/features/calendar/post-dialog-helpers";
import { PostContextHeader } from "./post-dialog/PostContextHeader";
import { PostContentViewerSheet } from "./post-dialog/PostContentViewerSheet";
import { PostEditionBlock } from "./post-dialog/PostEditionBlock";
import { PostActionsFooter } from "./post-dialog/PostActionsFooter";
import { useCalendarPostMedia } from "@/hooks/use-calendar-post-media";
import { useCalendarQuickGenerate } from "@/hooks/use-calendar-quick-generate";
import { useCalendarPostAutosave } from "@/hooks/use-calendar-post-autosave";
import { useCalendarPostPublish } from "@/hooks/use-calendar-post-publish";
import { useCalendarPostNavigation } from "@/hooks/use-calendar-post-navigation";

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
  const [ownerName, setOwnerName] = useState("Moi");
  const [igUsername, setIgUsername] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  // Publication programmée
  const [scheduleInput, setScheduleInput] = useState("");
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);

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

  const {
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
  } = useCalendarPostPublish({
    user, workspaceId, postCanal, format, mediaUrls, contentDraft, theme, savedPreviewContent, effectiveId, scheduleInput, navigate, setPublishStatus, setPublishedPostId, setScheduledAt, setPublishError, setSchedulerOpen,
  });


  const { isGenerating, handleQuickGenerate } = useCalendarQuickGenerate({
    theme, objectif, angle, format, notes, profileData, postCanal, workspaceId, user, status,
    setContentDraft, setAccroche, setStatus,
  });

  const { handleSmartGenerate, handleOpenAtelier, handleNavigateToGenerator, handleNavigateToDeepen, handleNavigateToFormat } = useCalendarPostNavigation({
    theme, format, postCanal, objectif, angle, notes, selectedDate, contentDraft, accroche, editingPost,
    savedPreviewContent, effectiveId, buildSaveData, onAutoSave, onOpenChange, navigate, handleQuickGenerate,
  });

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
