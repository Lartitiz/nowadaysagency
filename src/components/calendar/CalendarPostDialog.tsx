import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PostCommentsSection } from "@/components/calendar/PostCommentsSection";
import { friendlyError } from "@/lib/error-messages";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Trash2, ChevronDown, Upload, Undo2 } from "lucide-react";
import { getGuide } from "@/lib/production-guides";
import { type CalendarPost } from "@/lib/calendar-constants";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ContentPreview, RevertToOriginalButton } from "@/components/ContentPreview";

import { CalendarPostMetadata } from "./CalendarPostMetadata";
import { CalendarPostContent } from "./CalendarPostContent";
import { CalendarPostPreview } from "./CalendarPostPreview";

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
  const [igUsername, setIgUsername] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

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
  const [dialogTab, setDialogTab] = useState<"edit" | "preview">("edit");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showContentViewer, setShowContentViewer] = useState(false);

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
      setAccroche((editingPost as any).accroche || null);
      setMediaUrls((editingPost as any).media_urls || []);
    } else if (prefillData) {
      setTheme(prefillData.theme || "");
      setAngle(null); setStatus("idea"); setNotes(prefillData.notes || "");
      setObjectif(null); setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
      setFormat(null); setContentDraft(null); setAccroche(null); setMediaUrls([]);
    } else {
      setTheme(""); setAngle(null); setStatus("idea"); setNotes("");
      setObjectif(null); setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
      setFormat(null); setContentDraft(null); setAccroche(null); setMediaUrls([]);
    }
    setDialogTab("edit");
    setShowAdvanced(false);
  }, [editingPost, open, defaultCanal, prefillData]);

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

  const handleSave = () => {
    if (!theme.trim()) return;
    onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche, media_urls: mediaUrls.length > 0 ? mediaUrls : null });
  };

  const handleCopy = () => {
    if (contentDraft) { navigator.clipboard.writeText(contentDraft); toast({ title: "Texte copié !" }); }
  };

  const ANGLE_TO_CAROUSEL: Record<string, string> = {
    "Storytelling": "storytelling", "Mythe à déconstruire": "mythe_realite",
    "Coup de gueule": "prise_de_position", "Enquête / décryptage": "prise_de_position",
    "Conseil contre-intuitif": "tips", "Test grandeur nature": "etude_de_cas",
    "Before / After": "before_after", "Histoire cliente": "etude_de_cas",
    "Regard philosophique": "prise_de_position", "Surf sur l'actu": "prise_de_position",
  };

  const handleQuickGenerate = async () => {
    if (!theme.trim()) { toast({ title: "Il me faut un sujet !", description: "Remplis le thème au-dessus.", variant: "destructive" }); return; }
    setIsGenerating(true);
    try {
      const validObjectifs = ["visibilite", "confiance", "vente", "credibilite"];
      const safeObjectif = objectif && validObjectifs.includes(objectif) ? objectif : null;
      const res = await invokeWithTimeout("generate-content", {
        body: { type: "calendar-quick", theme, objectif: safeObjectif, angle, format: format || "post_carrousel", notes, profile: profileData || {}, canal: postCanal },
      }, 60000);
      // Handle quota limit
      if (res.data?.error === "limit_reached") {
        toast({ title: "Plus de crédits ce mois-ci 🌸", description: res.data.message || "Tes crédits se renouvellent le 1er du mois.", variant: "default" });
        setIsGenerating(false);
        return;
      }
      if (res.error) throw res.error;
      const generated = res.data?.content || "";
      setContentDraft(generated);
      setAccroche(generated.split(/[.\n]/)[0]?.trim() || null);
      if (status === "idea" || status === "a_rediger") setStatus("drafting");
      toast({ title: "Contenu généré !" });
    } catch (e: any) {
      toast({ title: e?.isTimeout ? "Ça prend plus longtemps que prévu" : "Erreur de génération", description: e?.isTimeout ? e.message : friendlyError(e), variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  const handleSmartGenerate = () => {
    if (!theme.trim()) { toast({ title: "Il me faut un sujet !", variant: "destructive" }); return; }
    const fmt = format || "post_carrousel";
    if (fmt === "post_carrousel" || fmt === "carousel" || fmt === "reel" || fmt === "story_serie" || postCanal === "linkedin") {
      handleNavigateToGenerator("generate"); return;
    }
    handleQuickGenerate();
  };

  const handleOpenAtelier = () => {
    if (theme.trim()) onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche, media_urls: mediaUrls.length > 0 ? mediaUrls : null });
    onOpenChange(false);
    setTimeout(() => {
      navigate("/creer?canal=" + (postCanal || "instagram"), {
        state: { fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche, launchId: editingPost?.launch_id, contentType: editingPost?.content_type, contentTypeEmoji: editingPost?.content_type_emoji, category: editingPost?.category, objective: editingPost?.objective, angleSuggestion: editingPost?.angle_suggestion, chapter: (editingPost as any)?.chapter, chapterLabel: (editingPost as any)?.chapter_label, audiencePhase: (editingPost as any)?.audience_phase },
      });
    }, 100);
  };

  const handleNavigateToGenerator = (mode: "generate" | "regenerate" | "view") => {
    if (theme.trim()) onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche, media_urls: mediaUrls.length > 0 ? mediaUrls : null });
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

  const handleNavigateToDeepen = () => {
    if (theme.trim()) onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche, media_urls: mediaUrls.length > 0 ? mediaUrls : null });
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

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display">{editingPost ? "Modifier le post" : "Ajouter un post"}</DialogTitle>
            {editingPost && (
              <div className="flex rounded-full border border-border overflow-hidden mr-6">
                <button onClick={() => setDialogTab("edit")} className={`px-3 py-1 text-[11px] font-medium transition-colors ${dialogTab === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>✏️ Éditer</button>
                <button onClick={() => setDialogTab("preview")} className={`px-3 py-1 text-[11px] font-medium transition-colors ${dialogTab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>👁️ Preview</button>
              </div>
            )}
          </div>
          <DialogDescription className="sr-only">Formulaire de création ou modification d'un post du calendrier éditorial</DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {dialogTab === "preview" ? (
            <CalendarPostPreview
              canal={postCanal} format={format} caption={contentDraft} theme={theme}
              username={igUsername || ownerName} displayName={ownerName} mediaUrls={mediaUrls}
              visualHtml={(editingPost?.story_sequence_detail as any)?.visual_html || null}
              visualUrls={(editingPost?.story_sequence_detail as any)?.visual_urls || null}
              onNavigateToGenerator={() => handleNavigateToGenerator("generate")}
              hasAngle={!!angle} hasTheme={!!theme.trim()}
            />
          ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-5">
              {/* Left column: Content */}
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
                  onShowContentViewer={() => setShowContentViewer(true)}
                />

                <div>
                  <label className="text-xs font-semibold mb-1.5 block text-foreground">📝 Notes</label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Idées, brouillon, remarques..." className="rounded-[10px] min-h-[80px]" />
                </div>

                {/* Visuels */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">🖼️ Visuels</label>
                  {mediaUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {mediaUrls.map((url, i) => (
                        <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border">
                          <img src={url} alt={`Visuel ${i + 1}`} className="w-full h-full object-cover" />
                          <button onClick={() => setMediaUrls(prev => prev.filter((_, idx) => idx !== i))} aria-label={`Supprimer le visuel ${i + 1}`} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs">x</button>
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

                {editingPost && <PostCommentsSection postId={editingPost.id} ownerName={ownerName} />}
              </div>

              {/* Right column (desktop): Metadata */}
              <div className="hidden sm:block space-y-4 sm:border-l sm:border-border sm:pl-5">
                <CalendarPostMetadata
                  status={status} setStatus={setStatus} postCanal={postCanal} setPostCanal={setPostCanal}
                  format={format} setFormat={setFormat} objectif={objectif} setObjectif={setObjectif}
                  angle={angle} setAngle={setAngle} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
                  editingPostId={editingPost?.id} selectedDate={selectedDate} onDateChange={onDateChange}
                />
              </div>

              {/* Mobile: Metadata collapsible */}
              <div className="sm:hidden">
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary w-full py-2">
                    <span>📋 Canal, statut, date, format</span>
                    <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-2">
                    <CalendarPostMetadata
                      status={status} setStatus={setStatus} postCanal={postCanal} setPostCanal={setPostCanal}
                      format={format} setFormat={setFormat} objectif={objectif} setObjectif={setObjectif}
                      angle={angle} setAngle={setAngle} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
                      editingPostId={editingPost?.id} selectedDate={selectedDate} onDateChange={onDateChange}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 mt-4 border-t border-border">
              <Button onClick={handleSave} disabled={!theme.trim()} className="flex-1 rounded-pill bg-primary text-primary-foreground hover:bg-primary/90">💾 Enregistrer</Button>
              {onUnplan && editingPost && (
                <Button variant="outline" size="icon" onClick={onUnplan} className="rounded-full text-muted-foreground hover:text-primary" title="Remettre en idée">
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              {editingPost && (
                <Button variant="outline" size="icon" onClick={() => { if (window.confirm("Supprimer ce post du calendrier ? Cette action est irréversible.")) onDelete(); }} className="rounded-full text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
          )}
        </div>
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
