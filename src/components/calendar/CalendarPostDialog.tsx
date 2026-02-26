import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PostCommentsSection } from "@/components/calendar/PostCommentsSection";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { friendlyError } from "@/lib/error-messages";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useProfile } from "@/hooks/use-profile";
import { format as formatDate } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, toLocalDateStr } from "@/lib/utils";
import { Trash2, ChevronDown, Sparkles, Zap, Copy, RefreshCw, Loader2, Undo2, CalendarIcon, Upload } from "lucide-react";
import { getGuide } from "@/lib/production-guides";
import { ANGLES, STATUSES, OBJECTIFS, type CalendarPost } from "@/lib/calendar-constants";
import { FORMAT_EMOJIS, FORMAT_LABELS } from "@/lib/calendar-helpers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ContentPreview, RevertToOriginalButton } from "@/components/ContentPreview";

const FORMAT_OPTIONS_BY_CANAL: Record<string, { id: string; emoji: string; label: string }[]> = {
  instagram: [
    { id: "post_carrousel", emoji: "📑", label: "Carrousel" },
    { id: "reel", emoji: "🎬", label: "Reel" },
    { id: "post_photo", emoji: "🖼️", label: "Post" },
    { id: "story_serie", emoji: "📱", label: "Stories" },
    { id: "live", emoji: "🎤", label: "Live" },
  ],
  linkedin: [
    { id: "post_texte", emoji: "📝", label: "Post texte" },
    { id: "post_carrousel", emoji: "📑", label: "Carrousel PDF" },
    { id: "article", emoji: "📰", label: "Article" },
    { id: "sondage", emoji: "📊", label: "Sondage" },
  ],
  pinterest: [
    { id: "epingle", emoji: "📌", label: "Épingle" },
    { id: "epingle_idee", emoji: "💡", label: "Épingle idée" },
  ],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPost: CalendarPost | null;
  selectedDate: string | null;
  defaultCanal: string;
  onSave: (data: { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null; format: string | null; content_draft: string | null; accroche: string | null; media_urls: string[] | null }) => void;
  onDelete: () => void;
  onUnplan?: () => void;
  onDateChange?: (postId: string, newDate: string) => void;
  prefillData?: { theme?: string; notes?: string } | null;
}

export function CalendarPostDialog({ open, onOpenChange, editingPost, selectedDate, defaultCanal, onSave, onDelete, onUnplan, onDateChange, prefillData }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { column, value } = useWorkspaceFilter();
  const { data: profileData } = useProfile();
  const [ownerName, setOwnerName] = useState("Moi");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profileData) return;
    if ((profileData as any).prenom) setOwnerName((profileData as any).prenom);
    if ((profileData as any).instagram_username) setIgUsername((profileData as any).instagram_username);
  }, [profileData]);
  const [theme, setTheme] = useState("");
  const [angle, setAngle] = useState<string | null>(null);
  const [status, setStatus] = useState("idea");
  const [notes, setNotes] = useState("");
  const [postCanal, setPostCanal] = useState("instagram");
  const [objectif, setObjectif] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [contentDraft, setContentDraft] = useState<string | null>(null);
  const [accroche, setAccroche] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);
  const [showContentViewer, setShowContentViewer] = useState(false);
  const [dialogTab, setDialogTab] = useState<"edit" | "preview">("edit");
  const [igUsername, setIgUsername] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (editingPost) {
      setTheme(editingPost.theme);
      setAngle(editingPost.angle);
      setStatus(editingPost.status);
      setNotes(editingPost.notes || "");
      setObjectif(editingPost.objectif || null);
      setPostCanal(editingPost.canal || "instagram");
      setFormat((editingPost as any).format || null);
      // Use content_draft, fallback to story_sequence_detail.full_content
      const draft = (editingPost as any).content_draft || (editingPost.story_sequence_detail as any)?.full_content || null;
      setContentDraft(draft);
      setAccroche((editingPost as any).accroche || null);
      setMediaUrls((editingPost as any).media_urls || []);
      setTheme(prefillData.theme || "");
      setAngle(null);
      setStatus("idea");
      setNotes(prefillData.notes || "");
      setObjectif(null);
      setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
      setFormat(null);
      setContentDraft(null);
      setAccroche(null);
      setMediaUrls([]);
    } else {
      setTheme("");
      setAngle(null);
      setStatus("idea");
      setNotes("");
      setObjectif(null);
      setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
      setFormat(null);
      setContentDraft(null);
      setAccroche(null);
      setMediaUrls([]);
    }
    setIsEditing(false);
    setShowFullContent(false);
    setDialogTab("edit");
    setShowAdvanced(!!(editingPost?.angle || editingPost?.objectif || (editingPost as any)?.format || editingPost?.notes));
  }, [editingPost, open, defaultCanal, prefillData]);

  const guide = angle ? getGuide(angle) : null;

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) { toast({ title: "Fichier trop lourd (max 10 Mo)", variant: "destructive" }); continue; }
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("calendar-media").upload(path, file, { contentType: file.type });
        if (error) throw error;
        const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
        if (data?.publicUrl) newUrls.push(data.publicUrl);
      }
      setMediaUrls(prev => [...prev, ...newUrls]);
    } catch (err: any) {
      toast({ title: "Erreur upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!theme.trim()) return;
    onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche, media_urls: mediaUrls.length > 0 ? mediaUrls : null });
  };

  const handleQuickGenerate = async () => {
    if (!theme.trim() || !angle) return;
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connectée");

      const { data: profile } = await (supabase.from("profiles") as any).select("*").eq(column, value).maybeSingle();

      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "calendar-quick",
          theme,
          objectif,
          angle,
          format: format || "post_carrousel",
          notes,
          profile: profile || {},
          canal: postCanal,
        },
      });

      if (res.error) throw new Error(res.error.message);
      const generated = res.data?.content || "";
      setContentDraft(generated);
      // Extract first sentence as accroche
      const firstLine = generated.split(/[.\n]/)[0]?.trim();
      setAccroche(firstLine || null);
      // Auto-update status
      if (status === "idea" || status === "a_rediger") {
        setStatus("drafting");
      }
      toast({ title: "Contenu généré !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur de génération", description: friendlyError(e), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (contentDraft) {
      navigator.clipboard.writeText(contentDraft);
      toast({ title: "Texte copié !" });
    }
  };

  const handleOpenAtelier = () => {
    // Save current state first, then navigate
    handleSave();
    navigate("/atelier?canal=" + (postCanal || "instagram"), {
      state: {
        fromCalendar: true,
        calendarPostId: editingPost?.id,
        theme,
        objectif,
        angle,
        format,
        notes,
        postDate: selectedDate,
        existingContent: contentDraft,
        existingAccroche: accroche,
        // Launch context
        launchId: editingPost?.launch_id,
        contentType: editingPost?.content_type,
        contentTypeEmoji: editingPost?.content_type_emoji,
        category: editingPost?.category,
        objective: editingPost?.objective,
        angleSuggestion: editingPost?.angle_suggestion,
        chapter: (editingPost as any)?.chapter,
        chapterLabel: (editingPost as any)?.chapter_label,
        audiencePhase: (editingPost as any)?.audience_phase,
      },
    });
  };

  // Angle → carousel type mapping
  const ANGLE_TO_CAROUSEL: Record<string, string> = {
    "Storytelling": "storytelling",
    "Mythe à déconstruire": "mythe_realite",
    "Coup de gueule": "prise_de_position",
    "Enquête / décryptage": "prise_de_position",
    "Conseil contre-intuitif": "tips",
    "Test grandeur nature": "etude_de_cas",
    "Before / After": "before_after",
    "Histoire cliente": "etude_de_cas",
    "Regard philosophique": "prise_de_position",
    "Surf sur l'actu": "prise_de_position",
  };

  const handleNavigateToGenerator = (mode: "generate" | "regenerate" | "view") => {
    // Save first
    handleSave();

    const calendarId = editingPost?.id;
    const params = new URLSearchParams();
    if (calendarId) params.set("calendar_id", calendarId);
    if (theme) params.set("sujet", encodeURIComponent(theme));
    if (objectif) params.set("objectif", objectif);
    params.set("from", "/calendrier");

    // Pass rich context via state for all generators
    const state = {
      fromCalendar: true,
      calendarPostId: calendarId,
      theme,
      objectif,
      angle,
      format,
      notes,
      postDate: selectedDate,
      // Launch context
      launchId: editingPost?.launch_id,
      contentType: editingPost?.content_type,
      category: editingPost?.category,
      objective: editingPost?.objective,
    };

    // Determine route based on format and canal
    const fmt = format || "post_carrousel";
    if (postCanal === "linkedin") {
      // LinkedIn posts go to the dedicated LinkedIn generator
      navigate(`/linkedin/post?${params.toString()}`, { state: { ...state, sujet: theme } });
    } else if (fmt === "post_carrousel" || fmt === "carousel") {
      // Also pass carousel type hint from angle
      if (angle && ANGLE_TO_CAROUSEL[angle]) {
        params.set("carousel_type", ANGLE_TO_CAROUSEL[angle]);
      }
      navigate(`/instagram/carousel?${params.toString()}`, { state });
    } else if (fmt === "reel") {
      navigate(`/instagram/reels?${params.toString()}`, { state });
    } else if (fmt === "story_serie") {
      navigate(`/instagram/stories?${params.toString()}`, { state });
    } else {
      // Default: atelier for regular posts
      navigate(`/atelier?canal=${postCanal || "instagram"}&${params.toString()}`, { state });
    }
  };

  const handleViewStoriesSequence = () => {
    if (editingPost?.stories_sequence_id) {
      navigate("/instagram/stories", {
        state: { viewSequenceId: editingPost.stories_sequence_id },
      });
    }
  };

  const isStoriesPost = !!(editingPost?.stories_count || editingPost?.stories_sequence_id || editingPost?.stories_structure);
  const isReelPost = editingPost?.format === "reel" && editingPost?.story_sequence_detail;
  const reelData = isReelPost ? (editingPost.story_sequence_detail as any) : null;
  const storiesData = isStoriesPost && editingPost?.story_sequence_detail ? (editingPost.story_sequence_detail as any) : null;

  const contentPreview = contentDraft && contentDraft.length > 200 && !showFullContent
    ? contentDraft.slice(0, 200) + "..."
    : contentDraft;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isReelPost ? "🎬 Script Reel" : isStoriesPost ? "📱 Séquence Stories" : editingPost ? "Modifier le post" : "Ajouter un post"}
          </DialogTitle>
          <DialogDescription className="sr-only">Formulaire de création ou modification d'un post du calendrier éditorial</DialogDescription>
        </DialogHeader>

        {/* Reel-specific view */}
        {isReelPost && editingPost ? (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-medium text-foreground mb-1">
                🎬 {editingPost.theme}
              </p>
              {reelData?.duree_cible && (
                <p className="text-xs text-muted-foreground">Durée : {reelData.duree_cible}</p>
              )}
              {editingPost.accroche && (
                <p className="text-xs text-muted-foreground mt-1 italic">Hook : "{editingPost.accroche}"</p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Statut</label>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button key={s.id} onClick={() => setStatus(s.id)}
                    className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${status === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowContentViewer(true)} className="rounded-pill text-xs gap-1.5">
                👁️ Voir le script
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (reelData?.script) {
                  const text = reelData.script.map((s: any) => `[${s.timing}] ${s.section?.toUpperCase()}\n"${s.texte_parle}"${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}`).join("\n\n───\n\n");
                  navigator.clipboard.writeText(text);
                  toast({ title: "Script copié !" });
                }
              }} className="rounded-pill text-xs gap-1.5">
                <Copy className="h-3 w-3" /> Script
              </Button>
              {reelData?.caption && (
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard.writeText(`${reelData.caption.text}\n\n${reelData.caption.cta}\n\n${reelData.hashtags?.join(" ") || ""}`);
                  toast({ title: "Caption copiée !" });
                }} className="rounded-pill text-xs gap-1.5">
                  <Copy className="h-3 w-3" /> Caption
                </Button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche, media_urls: mediaUrls.length > 0 ? mediaUrls : null })} className="flex-1 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux">
                Enregistrer
              </Button>
              {onUnplan && editingPost && (
                <Button variant="outline" size="icon" onClick={onUnplan} className="rounded-full text-muted-foreground hover:text-primary" title="Remettre en idée">
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={onDelete} className="rounded-full text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : isStoriesPost && editingPost ? (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-medium text-foreground mb-1">
                {editingPost.stories_structure || editingPost.theme} · {editingPost.stories_count || "?"} stories
              </p>
              <p className="text-xs text-muted-foreground">
                Objectif : {editingPost.stories_objective || editingPost.objectif || "—"}
              </p>
              {editingPost.stories_timing && (
                <div className="mt-2 space-y-1">
                  {Object.entries(editingPost.stories_timing).map(([k, v]) => {
                    const emoji = k === "matin" ? "🌅" : k === "midi" ? "☀️" : "🌙";
                    return (
                      <p key={k} className="text-xs text-muted-foreground">
                        {emoji} <span className="capitalize">{k}</span> : {v as string}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Statut</label>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button key={s.id} onClick={() => setStatus(s.id)}
                    className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${status === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {storiesData?.stories && (
                <Button variant="outline" size="sm" onClick={() => setShowContentViewer(true)} className="rounded-pill text-xs gap-1.5">
                  👁️ Voir la séquence
                </Button>
              )}
              {editingPost.stories_sequence_id && !storiesData?.stories && (
                <Button variant="outline" size="sm" onClick={handleViewStoriesSequence} className="rounded-pill text-xs gap-1.5">
                  👁️ Voir la séquence
                </Button>
              )}
              {storiesData?.stories && (
                <Button variant="outline" size="sm" onClick={() => {
                  const text = storiesData.stories.map((s: any) => `${s.timing_emoji || ""} STORY ${s.number} · ${s.role}\n${s.format_label || s.format}\n\n${s.text}${s.sticker ? `\n🎯 ${s.sticker.label}${s.sticker.options ? ` → ${s.sticker.options.join(" / ")}` : ""}` : ""}`).join("\n\n───\n\n");
                  navigator.clipboard.writeText(text);
                  toast({ title: "Séquence copiée !" });
                }} className="rounded-pill text-xs gap-1.5">
                  <Copy className="h-3 w-3" /> Copier tout
                </Button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche, media_urls: mediaUrls.length > 0 ? mediaUrls : null })} className="flex-1 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux">
                Enregistrer
              </Button>
              {onUnplan && editingPost && (
                <Button variant="outline" size="icon" onClick={onUnplan} className="rounded-full text-muted-foreground hover:text-primary" title="Remettre en idée">
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={onDelete} className="rounded-full text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
        <div className="space-y-5 mt-2">
          {/* Tabs: Edit / Preview */}
          <div className="flex rounded-full border border-border overflow-hidden">
            <button
              onClick={() => setDialogTab("edit")}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${dialogTab === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              ✏️ Éditer
            </button>
            <button
              onClick={() => setDialogTab("preview")}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${dialogTab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              👁️ Prévisualiser
            </button>
          </div>

          {dialogTab === "preview" ? (
            <PreviewTab
              canal={postCanal}
              format={format}
              caption={contentDraft}
              theme={theme}
              username={igUsername || ownerName}
              displayName={ownerName}
              mediaUrls={mediaUrls}
              onNavigateToGenerator={() => handleNavigateToGenerator("generate")}
              hasAngle={!!angle}
              hasTheme={!!theme.trim()}
            />
          ) : (
          <>
          {/* ── ZONE 1 : ESSENTIEL ── */}

          {/* Theme */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-foreground">Thème / sujet</label>
            <Input autoFocus value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="De quoi parle ce post ?" className="rounded-[10px] h-11" />
          </div>

          {/* Canal */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-foreground">Canal</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "instagram", emoji: "📸", label: "Instagram" },
                { id: "linkedin", emoji: "💼", label: "LinkedIn" },
                { id: "pinterest", emoji: "📌", label: "Pinterest" },
              ].map((c) => (
                <button key={c.id} onClick={() => setPostCanal(c.id)}
                  className={`rounded-pill px-3 py-1.5 text-xs font-medium border transition-all ${postCanal === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-foreground">Statut</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button key={s.id} onClick={() => setStatus(s.id)}
                  className={`rounded-pill px-3 py-1.5 text-xs font-medium border transition-all ${status === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          {editingPost && selectedDate && (
            <div>
              <label className="text-xs font-semibold mb-1.5 block text-foreground">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-[10px] h-11")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDate(new Date(selectedDate + "T00:00:00"), "EEEE d MMMM yyyy", { locale: fr })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(selectedDate + "T00:00:00")}
                    onSelect={(d) => {
                      if (d && onDateChange && editingPost) {
                        const newDateStr = toLocalDateStr(d);
                        onDateChange(editingPost.id, newDateStr);
                      }
                    }}
                    locale={fr}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* ── ZONE 2 : AVANCÉ (Collapsible) ── */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-2">
              <span>⚙️ Plus d'options</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 pt-2">
              {/* Objectif */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-foreground">🎯 Objectif</label>
                <div className="flex flex-wrap gap-1.5">
                  {OBJECTIFS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setObjectif(objectif === o.id ? null : o.id)}
                      className="rounded-pill px-3 py-1.5 text-xs font-medium border transition-all"
                      style={
                        objectif === o.id
                          ? { backgroundColor: `hsl(var(--${o.cssVar}-bg))`, color: `hsl(var(--${o.cssVar}))`, borderColor: `hsl(var(--${o.cssVar}))` }
                          : undefined
                      }
                    >
                      {o.emoji} {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Angle */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-foreground">🧭 Angle</label>
                <div className="flex flex-wrap gap-1.5">
                  {ANGLES.map((a) => (
                    <button key={a} onClick={() => setAngle(angle === a ? null : a)}
                      className={`rounded-pill px-3 py-1.5 text-xs font-medium border transition-all ${angle === a ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-foreground">📐 Format</label>
                <div className="flex flex-wrap gap-1.5">
                  {(FORMAT_OPTIONS_BY_CANAL[postCanal] || FORMAT_OPTIONS_BY_CANAL.instagram).map((f) => (
                    <button key={f.id} onClick={() => setFormat(format === f.id ? null : f.id)}
                      className={`rounded-pill px-3 py-1.5 text-xs font-medium border transition-all ${format === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                      {f.emoji} {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block text-foreground">📝 Notes (optionnel)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Idées, brouillon, remarques..." className="rounded-[10px] min-h-[60px]" />
              </div>
            </CollapsibleContent>
           </Collapsible>

          {/* Visuels */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">🖼️ Visuels</label>
            
            {mediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mediaUrls.map((url, i) => (
                  <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => handleRemoveMedia(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    >x</button>
                  </div>
                ))}
              </div>
            )}
            
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Upload en cours..." : "Ajouter des visuels"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleMediaUpload}
                disabled={uploading}
              />
            </label>
          </div>

          {editingPost && theme.trim() && (
            <div>
              <label className="text-xs font-semibold mb-2 block text-foreground">✨ Générer</label>
              {editingPost.generated_content_id ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleNavigateToGenerator("view")}
                    variant="outline"
                    className="flex-1 rounded-pill gap-1.5"
                    size="sm"
                  >
                    👁️ Voir le contenu
                  </Button>
                  <Button
                    onClick={() => handleNavigateToGenerator("regenerate")}
                    variant="outline"
                    className="flex-1 rounded-pill gap-1.5"
                    size="sm"
                  >
                    <RefreshCw className="h-3 w-3" /> Régénérer
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => handleNavigateToGenerator("generate")}
                  className="w-full rounded-pill gap-2"
                  size="lg"
                >
                  <Sparkles className="h-4 w-4" />
                  Générer le contenu →
                </Button>
              )}
            </div>
          )}

          {/* Rédaction section */}
          <div>
            <label className="text-xs font-semibold mb-2 block text-foreground">✍️ Rédaction</label>

            {contentDraft && !isEditing ? (
              /* Content exists - show preview */
              <div className="space-y-3">
                <div className="rounded-[10px] border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {contentPreview}
                  {contentDraft.length > 200 && !showFullContent && (
                    <button onClick={() => setShowFullContent(true)} className="block mt-1 text-xs text-primary hover:underline">
                      voir la suite ↓
                    </button>
                  )}
                  {showFullContent && contentDraft.length > 200 && (
                    <button onClick={() => setShowFullContent(false)} className="block mt-1 text-xs text-primary hover:underline">
                      réduire ↑
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="rounded-pill text-xs gap-1.5">
                    <Copy className="h-3 w-3" /> Copier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="rounded-pill text-xs gap-1.5">
                    ✏️ Modifier
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleQuickGenerate} disabled={isGenerating || !angle} className="rounded-pill text-xs gap-1.5">
                    {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Regénérer
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleOpenAtelier} className="rounded-pill text-xs gap-1.5">
                    <Sparkles className="h-3 w-3" /> Retravailler à l'atelier
                  </Button>
                </div>
              </div>
            ) : isEditing ? (
              /* Editing mode */
              <div className="space-y-2">
                <Textarea
                  value={contentDraft || ""}
                  onChange={(e) => setContentDraft(e.target.value)}
                  className="rounded-[10px] min-h-[120px] text-sm"
                  placeholder="Écris ou colle ton contenu ici..."
                  aria-label="Contenu du post"
                />
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="rounded-pill text-xs">
                  ✅ Terminer l'édition
                </Button>
              </div>
            ) : (
              /* No content yet */
              <div className="space-y-2">
                {!angle && (
                  <p className="text-xs italic text-muted-foreground mb-1">
                    💡 Choisis un angle pour débloquer la rédaction rapide.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mb-2">Pas encore de contenu rédigé.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleOpenAtelier} className="rounded-pill text-xs gap-1.5">
                    <Sparkles className="h-3 w-3" /> Rédiger avec l'atelier créatif
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleQuickGenerate} disabled={isGenerating || !theme.trim() || !angle} className="rounded-pill text-xs gap-1.5">
                    {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Générer en mode rapide
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="rounded-pill text-xs gap-1.5">
                    ✏️ Écrire manuellement
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Production guide */}
          {guide && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors w-full">
                <span>📝 Comment produire ce post</span>
                <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <ol className="space-y-3 text-[13px] leading-relaxed text-foreground">
                  {guide.map((step, i) => (
                    <li key={i}>
                      <span className="font-semibold text-primary">{step.label}</span>
                      <p className="mt-0.5 text-muted-foreground">{step.detail}</p>
                    </li>
                  ))}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Comments section */}
          {editingPost && (
            <PostCommentsSection postId={editingPost.id} ownerName={ownerName} />
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={!theme.trim()} className="flex-1 rounded-pill bg-primary text-primary-foreground hover:bg-primary/90">
              💾 Enregistrer
            </Button>
            {onUnplan && editingPost && (
              <Button variant="outline" size="icon" onClick={onUnplan} className="rounded-full text-muted-foreground hover:text-primary" title="Remettre en idée">
                <Undo2 className="h-4 w-4" />
              </Button>
            )}
            {editingPost && (
              <Button variant="outline" size="icon" onClick={onDelete} className="rounded-full text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          </>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Content Viewer Sheet — now uses ContentPreview with inline editing */}
    <Sheet open={showContentViewer} onOpenChange={setShowContentViewer}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">
            {isReelPost ? "🎬 Script complet" : "📱 Séquence complète"}
          </SheetTitle>
          <SheetDescription className="sr-only">Visualisation du contenu généré</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <ContentPreview
            contentData={editingPost?.story_sequence_detail}
            contentType={isReelPost ? "reel" : isStoriesPost ? "stories" : undefined}
            editable
            onContentChange={async (updatedData) => {
              if (!editingPost) return;
              await supabase
                .from("calendar_posts")
                .update({ story_sequence_detail: updatedData, updated_at: new Date().toISOString() })
                .eq("id", editingPost.id);
            }}
          />

          {/* Revert to AI version */}
          {editingPost && (editingPost as any).original_content_data && (
            <RevertToOriginalButton onRevert={async () => {
              const original = (editingPost as any).original_content_data;
              await supabase
                .from("calendar_posts")
                .update({ story_sequence_detail: original, updated_at: new Date().toISOString() })
                .eq("id", editingPost.id);
              toast({ title: "Version originale restaurée" });
              setShowContentViewer(false);
            }} />
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

// ── Preview Tab ──

function PreviewTab({ canal, format, caption, theme, username, displayName, mediaUrls, onNavigateToGenerator, hasAngle, hasTheme }: {
  canal: string;
  format: string | null;
  caption: string | null;
  theme: string;
  username: string;
  displayName: string;
  mediaUrls?: string[];
  onNavigateToGenerator: () => void;
  hasAngle: boolean;
  hasTheme: boolean;
}) {
  if (!caption) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-3xl mb-3">👁️</p>
        <p className="text-sm text-muted-foreground mb-4">
          Génère d'abord ton contenu pour le prévisualiser ici.
        </p>
        {hasTheme && hasAngle && (
          <Button onClick={onNavigateToGenerator} className="rounded-full gap-1.5">
            <Sparkles className="h-4 w-4" /> Générer le contenu
          </Button>
        )}
        {(!hasTheme || !hasAngle) && (
          <p className="text-xs text-muted-foreground italic">
            Remplis le thème et l'angle dans l'onglet Éditer.
          </p>
        )}
      </div>
    );
  }

  let parsed: any = null;
  try { parsed = JSON.parse(caption); } catch { /* plain text */ }

  // Structured JSON (reel script, stories sequence) → ContentPreview
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return (
      <div className="py-2 overflow-y-auto">
        <ContentPreview contentData={parsed} />
      </div>
    );
  }

  // Array JSON (carousel slides) → SocialMockup
  if (parsed && Array.isArray(parsed)) {
    const slides = parsed.map((s: any, i: number) => ({
      title: s.title || s.titre || `Slide ${i + 1}`,
      body: s.body || s.texte || s.content || "",
      slideNumber: i + 1,
    }));
    const mockupCanal = (canal === "instagram" || canal === "linkedin") ? canal : "instagram";
    return (
      <div className="flex justify-center py-2 overflow-y-auto">
        <SocialMockup
          canal={mockupCanal}
          format="carousel"
          username={username || "mon_compte"}
          displayName={displayName || ""}
          caption={theme}
          slides={slides}
          mediaUrls={mediaUrls}
          showComments={false}
          readonly
          hideFollowButton
        />
      </div>
    );
  }

  // Plain text → SocialMockup
  const mockupCanal = (canal === "instagram" || canal === "linkedin") ? canal : "instagram";
  const mockupFormat = (() => {
    if (format === "post_carrousel") return "carousel" as const;
    if (format === "reel") return "reel" as const;
    if (format === "story_serie") return "story" as const;
    return "post" as const;
  })();

  return (
    <div className="flex justify-center py-2 overflow-y-auto">
      <SocialMockup
        canal={mockupCanal}
        format={mockupFormat}
        username={username || "mon_compte"}
        displayName={displayName || ""}
        caption={caption}
        mediaUrls={mediaUrls}
        showComments={false}
        readonly
        hideFollowButton
      />
    </div>
  );
}
