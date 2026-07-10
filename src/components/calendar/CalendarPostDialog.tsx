import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { PostCommentsSection } from "@/components/calendar/PostCommentsSection";
import { friendlyError } from "@/lib/error-messages";
import { trackError } from "@/lib/error-tracker";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useProfile } from "@/hooks/use-profile";
import { useSocialConnections } from "@/hooks/use-social-connections";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Trash2, ChevronDown, Upload, Loader2, Check, Send, CalendarClock, Lightbulb } from "lucide-react";
import { getGuide } from "@/lib/production-guides";
import { type CalendarPost, STATUS_LABELS, STATUSES, statusStyles, OBJECTIFS, ANGLES } from "@/lib/calendar-constants";
import { format as formatDate } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { publishToInstagram, isPublicImageUrl, isNotConnectedError } from "@/lib/instagram-publish";
import { publishTextToLinkedIn, isLinkedInNotConnectedError } from "@/lib/linkedin-publish";
import { toast } from "sonner";
import { UX_UPLOAD_LIMITS, uxSizeError } from "@/lib/upload-limits";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ContentPreview, RevertToOriginalButton } from "@/components/ContentPreview";

import { CalendarPostMetadata, FORMAT_OPTIONS_BY_CANAL } from "./CalendarPostMetadata";
import { CalendarPostContent } from "./CalendarPostContent";
import { CalendarPostPreview } from "./CalendarPostPreview";

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

/** ISO → valeur d'un <input type="datetime-local"> (heure locale, "YYYY-MM-DDTHH:mm"). */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarPostDialog({ open, onOpenChange, editingPost, selectedDate, defaultCanal, onSave, onAutoSave, onDelete, onUnplan, onDateChange, prefillData }: Props) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { data: profileData } = useProfile();
  const { isConnected: isSocialConnected, getTokenExpiry } = useSocialConnections();
  const [ownerName, setOwnerName] = useState("Moi");
  const [igUsername, setIgUsername] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [dialogTab, setDialogTab] = useState<"edit" | "preview" | "meta">("edit");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [showContentViewer, setShowContentViewer] = useState(false);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [episodeNumber, setEpisodeNumber] = useState<number | null>(null);
  // Auto-save silencieux
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const createdIdRef = useRef<string | null>(null);   // id du post inséré via auto-save (post neuf)
  const lastSavedRef = useRef<string>("");            // payload sérialisé du dernier enregistrement
  const liveDataRef = useRef<string>("");             // payload sérialisé du rendu courant
  const skipAutoSaveRef = useRef<boolean>(true);      // bloque l'auto-save tant que l'état initial n'est pas "armé"
  const savingRef = useRef<boolean>(false);

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
      const ssd = editingPost.story_sequence_detail as any;
      const draft = (editingPost as any).content_draft
        || ssd?.full_content
        || (ssd?.stories ? ssd.stories.map((s: any) => `${s.text || ""}`).join("\n\n") : null)
        || (ssd?.script ? ssd.script.map((s: any) => s.texte_parle || "").join("\n\n") : null)
        || null;
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

  // Mémorise à chaque rendu le payload sérialisé courant (utilisé pour la baseline d'auto-save).
  useEffect(() => { liveDataRef.current = JSON.stringify(buildSaveData()); });

  // ── Armement de l'auto-save après (ré)ouverture ──
  // On bloque l'auto-save tant que l'état d'ouverture n'est pas posé, puis on capture la baseline
  // via une macrotâche (setTimeout 0) — donc APRÈS que les setState d'initialisation se soient appliqués.
  useEffect(() => {
    if (!open) return;
    skipAutoSaveRef.current = true;
    const t = setTimeout(() => { lastSavedRef.current = liveDataRef.current; skipAutoSaveRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [open, editingPost, prefillData]);

  // ── Auto-save silencieux (debounce) ──
  // Utilisé par l'effet debouncé ET par le bouton « Réessayer » de l'indicateur :
  // un échec ne doit pas rester un simple toast éphémère — sans nouvelle frappe,
  // l'effet ne se redéclenche pas et le texte resterait non sauvé en silence.
  const runAutoSave = async () => {
    if (savingRef.current || !onAutoSave) return;
    savingRef.current = true;
    setAutoSaveState("saving");
    const serialized = JSON.stringify(buildSaveData());
    const res = await onAutoSave(buildSaveData(), editingPost?.id ?? createdIdRef.current);
    savingRef.current = false;
    if (res?.error) { setAutoSaveState("error"); toast.error("Sauvegarde impossible", { description: "Réessaie dans un instant." }); return; }
    if (res?.post && !editingPost) createdIdRef.current = res.post.id;
    lastSavedRef.current = serialized;
    setSavedDraft(contentDraft);
    setAutoSaveState("saved");
  };
  useEffect(() => {
    if (!open || !onAutoSave) return;
    if (skipAutoSaveRef.current) return;             // pas encore armé (juste après ouverture)
    if (!theme.trim()) return;                       // pas d'auto-save d'un post sans sujet
    const serialized = JSON.stringify(buildSaveData());
    if (serialized === lastSavedRef.current) return; // rien de neuf depuis le dernier enregistrement
    const timer = setTimeout(() => { void runAutoSave(); }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, theme, angle, status, notes, postCanal, objectif, format, contentDraft, accroche, mediaUrls, seriesId, episodeNumber]);

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

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const sizeErr = uxSizeError(file, UX_UPLOAD_LIMITS.media);
        if (sizeErr) { toast.error(sizeErr); continue; }
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("calendar-media").upload(path, file, { contentType: file.type });
        if (error) throw error;
        const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
        if (data?.publicUrl) newUrls.push(data.publicUrl);
      }
      setMediaUrls(prev => [...prev, ...newUrls]);
    } catch (err: any) {
      toast.error("Erreur upload", { description: friendlyError(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!theme.trim()) return;
    onSave(buildSaveData(), effectiveId);
    setSavedDraft(contentDraft);
  };

  const handleCopy = () => {
    if (contentDraft) { navigator.clipboard.writeText(contentDraft); toast.success("Texte copié !"); }
  };

  // ── Publication directe Instagram (image simple OU carrousel : media_urls déjà publiques) ──
  const igValidImages = mediaUrls.filter(isPublicImageUrl);
  const instagramPublishDisabledReason = (() => {
    if (postCanal !== "instagram") return "Publication directe réservée aux posts Instagram.";
    // L'edge social-instagram-publish ne gère que le feed (pas media_type=STORIES) :
    // publier une story d'ici partirait en post feed.
    if (format === "story_serie") return "La publication directe des stories arrive bientôt — publie-la depuis l'app Instagram.";
    if (igValidImages.length === 0) return "Ajoute un visuel (image) pour publier.";
    if (igValidImages.length > 10) return "Instagram limite les carrousels à 10 images.";
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
      toast.warning("Publié — mais pas enregistré ici", {
        duration: 15000,
        description: "Ton post est bien parti sur le réseau, mais je n'ai pas réussi à le noter comme publié dans le calendrier. Ne le republie pas : recharge la page dans un instant pour vérifier.",
      });
    }
  };

  const handlePublishInstagram = async () => {
    if (!user) { toast.error("Tu dois être connectée."); return; }
    if (instagramPublishDisabledReason || igValidImages.length === 0) {
      toast.error(instagramPublishDisabledReason || "Image non disponible");
      return;
    }
    setPublishingInstagram(true);
    try {
      const { permalink } = await publishToInstagram({
        caption: contentDraft || theme || "",
        imageUrls: igValidImages,
        workspaceId,
        userId: user.id,
      });
      await markPostPublished(permalink ?? null);
      toast.success(igValidImages.length > 1 ? "Carrousel publié sur Instagram ! 🎉" : "Publié sur Instagram ! 🎉", {
        description: permalink ? "Ouvre ton profil Instagram pour le voir." : undefined,
      });
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
  const linkedInText = (contentDraft || "").trim();
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
  const scheduleNeedsConnection = canSchedule && !isSocialConnected(postCanal as "instagram" | "linkedin");
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
    // Garde-fou : sans compte connecté, la publication programmée échouerait en silence à l'heure dite.
    if (!isSocialConnected(postCanal as "instagram" | "linkedin")) {
      const reseau = postCanal === "linkedin" ? "LinkedIn" : "Instagram";
      toast.error(`Compte ${reseau} non connecté`, {
        description: `Connecte-le pour que ce post parte tout seul à l'heure prévue.`,
        action: { label: "Connecter", onClick: () => window.location.assign("/parametres/connexions") },
      });
      return;
    }
    if (postCanal === "instagram") {
      // Même garde que la publication immédiate : le cron publie en feed, pas en story.
      if (format === "story_serie") { toast.error("La publication directe des stories arrive bientôt — publie-la depuis l'app Instagram."); return; }
      if (igValidImages.length === 0) { toast.error("Ajoute au moins un visuel (image) avant de programmer."); return; }
      if (igValidImages.length > 10) { toast.error("Instagram limite les carrousels à 10 images."); return; }
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
        toast.warning("Programmé — mais reconnecte ton compte d'ici là ⚠️", {
          duration: 12000,
          description: `Ta connexion ${postCanal === "linkedin" ? "LinkedIn" : "Instagram"} expire le ${new Date(scheduleTokenExpiry!).toLocaleDateString("fr-FR")}, avant la date choisie. Sans reconnexion, la publication échouera.`,
          action: { label: "Reconnecter", onClick: () => window.location.assign("/parametres/connexions") },
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

  const ANGLE_TO_CAROUSEL: Record<string, string> = {
    "Storytelling": "storytelling", "Mythe à déconstruire": "mythe_realite",
    "Coup de gueule": "prise_de_position", "Enquête / décryptage": "prise_de_position",
    "Conseil contre-intuitif": "tips", "Test grandeur nature": "etude_de_cas",
    "Before / After": "before_after", "Histoire cliente": "etude_de_cas",
    "Regard philosophique": "prise_de_position", "Surf sur l'actu": "prise_de_position",
  };

  const handleQuickGenerate = async () => {
    if (!theme.trim()) { toast.error("Il me faut un sujet !", { description: "Remplis le thème au-dessus." }); return; }
    setIsGenerating(true);
    try {
      const validObjectifs = ["visibilite", "confiance", "vente", "credibilite"];
      const safeObjectif = objectif && validObjectifs.includes(objectif) ? objectif : null;
      const res = await invokeWithTimeout("generate-content", {
        body: { type: "calendar-quick", theme, objectif: safeObjectif, angle, format: format || "post_carrousel", notes, profile: profileData || {}, canal: postCanal, workspace_id: workspaceId !== user?.id ? workspaceId : undefined },
      }, 120000);
      // Handle quota limit
      if (res.data?.error === "limit_reached") {
        toast("Plus de crédits ce mois-ci 🌸", { description: res.data.message || "Tes crédits se renouvellent le 1er du mois." });
        setIsGenerating(false);
        return;
      }
      if (res.error) throw res.error;
      const generated = res.data?.content || "";
      setContentDraft(generated);
      setAccroche(generated.split(/[.\n]/)[0]?.trim() || null);
      if (status === "idea" || status === "a_rediger") setStatus("drafting");
      toast.success("Contenu généré !");
    } catch (e: any) {
      toast.error(e?.isTimeout ? "Ça prend plus longtemps que prévu" : "Erreur de génération", { description: friendlyError(e) });
    } finally { setIsGenerating(false); }
  };

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
      navigate("/creer?canal=" + (postCanal || "instagram"), {
        state: { fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche, launchId: editingPost?.launch_id, contentType: editingPost?.content_type, contentTypeEmoji: editingPost?.content_type_emoji, category: editingPost?.category, objective: editingPost?.objective, angleSuggestion: editingPost?.angle_suggestion, chapter: (editingPost as any)?.chapter, chapterLabel: (editingPost as any)?.chapter_label, audiencePhase: (editingPost as any)?.audience_phase },
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
      navigate("/creer?" + params.toString(), { state: { fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, existingContent: contentDraft, existingAccroche: accroche } });
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

  const ssd = editingPost?.story_sequence_detail as any;
  const syncStatus = (savedDraft || "") === (contentDraft || "") ? "synced" : "dirty";

  // Bloc édition : sujet + contenu + visuels (visibles) ; notes/brief/guide/commentaires repliés
  const editionBlock = (
    <div className="space-y-4 min-w-0">
      <div>
        <label className="text-xs font-semibold mb-1.5 block text-foreground">Thème / sujet</label>
        <Input autoFocus value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="De quoi parle ce post ?" className="rounded-[10px] h-11" />
      </div>

      <CalendarPostContent
        editingPost={editingPost} theme={theme}
        contentDraft={contentDraft} setContentDraft={setContentDraft}
        accroche={accroche} setAccroche={setAccroche}
        status={status} setStatus={setStatus}
        isGenerating={isGenerating} onSmartGenerate={handleSmartGenerate}
        onCopy={handleCopy} onOpenAtelier={handleOpenAtelier}
        onNavigateToDeepen={handleNavigateToDeepen}
        onNavigateToFormat={handleNavigateToFormat}
        postCanal={postCanal} format={format} angle={angle}
        objectif={objectif} notes={notes} mediaUrls={mediaUrls}
        onSaveAndClose={() => { handleSave(); onOpenChange(false); }}
        onShowContentViewer={isMobile ? () => setShowContentViewer(true) : undefined}
      />

      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">🖼️ Visuels</label>
        {mediaUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mediaUrls.map((url, i) => (
              <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border">
                <img loading="lazy" src={url} alt={`Visuel ${i + 1}`} className="w-full h-full object-cover" />
                <button onClick={() => setMediaUrls(prev => prev.filter((_, idx) => idx !== i))} aria-label={`Supprimer le visuel ${i + 1}`} className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-foreground/60 text-background flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-xs">x</button>
              </div>
            ))}
          </div>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Upload en cours..." : "Ajouter des visuels"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleMediaUpload} disabled={uploading} />
        </label>
      </div>

      {/* Secondaire replié : notes, brief créatif, guide de production, commentaires */}
      <Collapsible open={showSecondary} onOpenChange={setShowSecondary} className="border-t border-border pt-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1 w-full">
          <span>📝 Notes, brief &amp; commentaires</span>
          <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", showSecondary && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-foreground">📝 Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Idées, brouillon, remarques..." className="rounded-[10px] min-h-[80px]" />
          </div>

          {linkedBrief && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground">📋 Brief créatif <span className="text-muted-foreground font-normal">— {Object.values(linkedBrief.answers).filter(v => v?.trim()).length} réponse(s)</span></p>
                {linkedBrief.questions.map((q: any) => {
                  const answer = linkedBrief.answers[q.id] || linkedBrief.answers[q.question] || "";
                  if (!answer.trim()) return null;
                  return (
                    <div key={q.id} className="rounded-lg bg-muted/30 border border-border p-3">
                      <p className="text-xs font-medium text-foreground mb-1">{q.question}</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{answer}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {guide && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">📝 Comment produire ce post</p>
                <ol className="space-y-3 text-sm leading-relaxed text-foreground">
                  {guide.map((step, i) => (
                    <li key={i}>
                      <span className="font-semibold text-primary">{step.label}</span>
                      <p className="mt-0.5 text-muted-foreground">{step.detail}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {editingPost && <PostCommentsSection postId={editingPost.id} ownerName={ownerName} />}
          </CollapsibleContent>
        </Collapsible>
    </div>
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
      canal={postCanal} format={format} caption={contentDraft} theme={theme}
      username={igUsername || ownerName} displayName={ownerName} mediaUrls={mediaUrls}
      visualHtml={ssd?.visual_html || null}
      visualUrls={ssd?.visual_urls || null}
      onNavigateToGenerator={() => handleNavigateToGenerator("generate")}
      hasAngle={!!angle} hasTheme={!!theme.trim()}
      slidesData={ssd?.slides || null}
      photoUrls={ssd?.photo_urls || null}
      compact={compact}
      onFullscreen={ssd ? () => setShowContentViewer(true) : undefined}
      syncStatus={contentDraft ? syncStatus : undefined}
    />
  );

  // En-tête de contexte : un coup d'œil sur « quel réseau · quel format · quelle date · quel statut »
  const canalMeta = ({
    instagram: { emoji: "📸", label: "Instagram" },
    linkedin: { emoji: "💼", label: "LinkedIn" },
    pinterest: { emoji: "📌", label: "Pinterest" },
    newsletter: { emoji: "✉️", label: "Newsletter" },
  } as Record<string, { emoji: string; label: string }>)[postCanal] || { emoji: "", label: postCanal };
  const formatMeta = format ? (FORMAT_OPTIONS_BY_CANAL[postCanal] || []).find((f) => f.id === format) : null;
  const objectifMeta = objectif ? OBJECTIFS.find((o) => o.id === objectif) : null;
  const dateLabel = selectedDate ? formatDate(new Date(selectedDate + "T00:00:00"), "EEE d MMM", { locale: fr }) : null;
  // Libellé d'angle lisible : certains vieux posts stockent un id brut (« storytelling_pro »).
  const ANGLE_ID_LABELS: Record<string, string> = {
    storytelling: "Storytelling", storytelling_pro: "Storytelling",
    mythe_realite: "Mythe à déconstruire", prise_de_position: "Prise de position",
    tips: "Conseil", etude_de_cas: "Étude de cas", before_after: "Before / After",
  };
  const angleLabel = angle
    ? (ANGLES.includes(angle) ? angle : (ANGLE_ID_LABELS[angle] || (angle.charAt(0).toUpperCase() + angle.slice(1).replace(/_/g, " "))))
    : null;

  const contextHeader = (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base leading-none" aria-hidden="true">{canalMeta.emoji}</span>
        <span className="text-sm font-semibold text-foreground">
          {formatMeta ? `${formatMeta.label} ${canalMeta.label}` : canalMeta.label}
        </span>
        {dateLabel && (
          <>
            <span className="text-border">·</span>
            <span className="text-xs text-muted-foreground">{dateLabel}</span>
          </>
        )}
        {/* Badge de statut cliquable : changer le statut sans ouvrir « Détails » */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("ml-auto inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-2xs font-medium transition-opacity hover:opacity-80", statusStyles[status] || "bg-card border-border text-foreground")} aria-label="Changer le statut du post">
              {STATUS_LABELS[status] || status}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {STATUSES.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => setStatus(s.id)} className={cn(status === s.id && "font-medium text-primary")}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(objectifMeta || angleLabel) && (
        <p className="text-2xs text-muted-foreground">
          {objectifMeta && <span>{objectifMeta.emoji} {objectifMeta.label}</span>}
          {objectifMeta && angleLabel && <span className="mx-1.5 text-border">·</span>}
          {angleLabel && <span>{angleLabel}</span>}
        </p>
      )}
    </div>
  );

  // Panneau "Détails" repliable : reprend tous les réglages (statut, date, canal, format, objectif, angle, série)
  const detailsPanel = (
    <Collapsible open={showDetails} onOpenChange={setShowDetails}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1">
        <span>Détails du post — statut, canal, format, série</span>
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
    <div className="pt-3 mt-3 border-t border-border space-y-2">
      {/* État de publication (programmée / publiée / en cours / échec) */}
      {canSchedule && publishStatus === "scheduled" && (
        <div className="flex items-center gap-2 text-2xs">
          <span className="text-foreground">🗓️ Programmé pour le <strong>{scheduledAt ? new Date(scheduledAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "?"}</strong></span>
          <button type="button" onClick={handleCancelSchedule} disabled={savingSchedule} className="ml-auto text-primary hover:underline">Annuler</button>
        </div>
      )}
      {canSchedule && publishStatus === "published" && (
        <p className="text-2xs text-success">✅ Publié automatiquement{scheduledAt ? ` (le ${new Date(scheduledAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })})` : ""}.</p>
      )}
      {canSchedule && publishStatus === "publishing" && (
        <p className="text-2xs text-muted-foreground">⏳ Publication en cours…</p>
      )}
      {canSchedule && publishStatus === "failed" && (
        <p className="text-2xs text-destructive">❌ Échec de la dernière tentative{publishError ? ` : ${publishError}` : ""}.</p>
      )}

      {/* Panneau de programmation, ouvert depuis le menu « Publier » */}
      {schedulerOpen && canSchedule && (
        <div className="rounded-[10px] border border-border bg-card/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">🗓️ Programmer la publication {postCanal === "linkedin" ? "LinkedIn" : "Instagram"}</p>
          <p className="text-2xs text-muted-foreground">{postCanal === "linkedin" ? "Choisis quand publier ce post texte — il partira automatiquement." : `Choisis quand publier ce post (${igValidImages.length > 1 ? `carrousel de ${igValidImages.length} images` : "1 image"}) — il partira automatiquement.`}</p>
          {scheduleNeedsConnection && (
            <div className="rounded-[8px] border border-amber-300/60 bg-amber-50/60 px-2.5 py-2 text-2xs text-amber-900 flex items-center justify-between gap-2 flex-wrap dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
              <span>⚠️ Connecte ton compte {postCanal === "linkedin" ? "LinkedIn" : "Instagram"} pour que la publication parte automatiquement.</span>
              <button type="button" onClick={() => window.location.assign("/parametres/connexions")} className="font-medium underline shrink-0">Connecter</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" value={scheduleInput} onChange={(e) => setScheduleInput(e.target.value)} className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
            <Button type="button" size="sm" onClick={handleSchedulePublish} disabled={savingSchedule} className="rounded-pill text-xs bg-primary text-primary-foreground hover:bg-primary/90">{savingSchedule ? "…" : "Programmer"}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSchedulerOpen(false)} className="rounded-pill text-xs">Fermer</Button>
          </div>
          {scheduleAfterTokenExpiry && (
            <p className="text-2xs text-amber-900 dark:text-amber-200">
              ⚠️ Ta connexion {postCanal === "linkedin" ? "LinkedIn" : "Instagram"} expire le {new Date(scheduleTokenExpiry!).toLocaleDateString("fr-FR")}, avant cette date. Reconnecte ton compte d'ici là, sinon la publication échouera.
            </p>
          )}
          {(postCanal === "instagram" ? igValidImages.length === 0 : !linkedInText) && (
            <p className="text-2xs text-muted-foreground">{postCanal === "linkedin" ? "Rédige le texte du post pour pouvoir programmer." : "Ajoute au moins un visuel (image) pour pouvoir programmer."}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* Indicateur d'auto-save (remplace le bouton Enregistrer) */}
        <span className={cn("text-2xs flex items-center gap-1 min-w-0", autoSaveState === "error" ? "text-destructive" : "text-muted-foreground")}>
          {autoSaveState === "saving" ? (<><Loader2 className="h-3 w-3 animate-spin shrink-0" /> Enregistrement…</>)
            : autoSaveState === "saved" ? (<><Check className="h-3 w-3 text-success shrink-0" /> Enregistré</>)
            : autoSaveState === "error" ? (
              <>
                ⚠️ Non enregistré
                <button type="button" onClick={() => { void runAutoSave(); }} className="underline font-medium ml-1">
                  Réessayer
                </button>
              </>
            )
            : theme.trim() ? "Enregistrement automatique" : "Ajoute un sujet pour commencer"}
        </span>

        {/* Un seul bouton d'action principal */}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={!theme.trim()} className="rounded-pill bg-primary text-primary-foreground hover:bg-primary/90">
                {(publishingInstagram || publishingLinkedIn) && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {canPublishActions ? "Publier" : "Options"}
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {canPublishActions && (
                <DropdownMenuItem onClick={handlePublishNow} disabled={publishNowDisabled}>
                  <Send className="h-4 w-4 mr-2" /> Publier maintenant
                </DropdownMenuItem>
              )}
              {canPublishActions && (
                <DropdownMenuItem onClick={() => setSchedulerOpen(true)}>
                  <CalendarClock className="h-4 w-4 mr-2" /> {publishStatus === "scheduled" ? "Modifier la programmation" : "Programmer la publication"}
                </DropdownMenuItem>
              )}
              {canPublishActions && (!!editingPost || !!effectiveId) && <DropdownMenuSeparator />}
              {editingPost && onUnplan && (
                <DropdownMenuItem onClick={async () => { if (await confirm({ title: "Remettre ce post dans tes idées ?", description: "Il sera retiré du calendrier et rangé dans ta boîte à idées.", confirmText: "Remettre dans mes idées" })) onUnplan(); }}>
                  <Lightbulb className="h-4 w-4 mr-2" /> Remettre dans mes idées
                </DropdownMenuItem>
              )}
              {effectiveId && (
                <DropdownMenuItem onClick={async () => { if (await confirm({ title: "Supprimer ce post du calendrier ?", description: "Cette action est irréversible.", confirmText: "Supprimer", destructive: true })) onDelete(effectiveId); }} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
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
    <Sheet open={showContentViewer} onOpenChange={setShowContentViewer}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">
            {(editingPost?.story_sequence_detail as any)?.type === "reel" ? "🎬 Script complet"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel" ? "📑 Slides détaillées"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel_photo" ? "📸 Carrousel photo"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel_mix" ? "✨ Carrousel mixte"
              : "📱 Séquence complète"}
          </SheetTitle>
          <SheetDescription className="sr-only">Visualisation du contenu généré</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <ContentPreview
            contentData={editingPost?.story_sequence_detail}
            contentType={
              (editingPost?.story_sequence_detail as any)?.type === "reel" ? "reel"
              : (editingPost?.story_sequence_detail as any)?.type === "stories" ? "stories"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel" ? "carousel"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel_photo" ? "carousel_photo"
              : (editingPost?.story_sequence_detail as any)?.type === "carousel_mix" ? "carousel_mix"
              : undefined
            }
            editable
            onContentChange={async (updatedData) => {
              if (!editingPost) return;
              await supabase.from("calendar_posts").update({ story_sequence_detail: updatedData, updated_at: new Date().toISOString() } as any).eq("id", editingPost.id);
            }}
          />
          {editingPost && (editingPost as any).original_content_data && (
            <RevertToOriginalButton onRevert={async () => {
              const original = (editingPost as any).original_content_data;
              await supabase.from("calendar_posts").update({ story_sequence_detail: original, updated_at: new Date().toISOString() } as any).eq("id", editingPost.id);
              toast.success("Version originale restaurée");
              setShowContentViewer(false);
            }} />
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
