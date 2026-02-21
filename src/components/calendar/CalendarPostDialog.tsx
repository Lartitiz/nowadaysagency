import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, ChevronDown, Sparkles, Zap, Copy, RefreshCw, Loader2 } from "lucide-react";
import { getGuide } from "@/lib/production-guides";
import { ANGLES, STATUSES, OBJECTIFS, type CalendarPost } from "@/lib/calendar-constants";
import { FORMAT_EMOJIS, FORMAT_LABELS } from "@/lib/calendar-helpers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const FORMAT_OPTIONS = [
  { id: "post_carrousel", emoji: "📑", label: "Carrousel" },
  { id: "reel", emoji: "🎬", label: "Reel" },
  { id: "post_photo", emoji: "🖼️", label: "Post" },
  { id: "story_serie", emoji: "📱", label: "Stories" },
  { id: "live", emoji: "🎤", label: "Live" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPost: CalendarPost | null;
  selectedDate: string | null;
  defaultCanal: string;
  onSave: (data: { theme: string; angle: string | null; status: string; notes: string; canal: string; objectif: string | null; format: string | null; content_draft: string | null; accroche: string | null }) => void;
  onDelete: () => void;
  prefillData?: { theme?: string; notes?: string } | null;
}

export function CalendarPostDialog({ open, onOpenChange, editingPost, selectedDate, defaultCanal, onSave, onDelete, prefillData }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
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

  useEffect(() => {
    if (editingPost) {
      setTheme(editingPost.theme);
      setAngle(editingPost.angle);
      setStatus(editingPost.status);
      setNotes(editingPost.notes || "");
      setObjectif(editingPost.objectif || null);
      setPostCanal(editingPost.canal || "instagram");
      setFormat((editingPost as any).format || null);
      setContentDraft((editingPost as any).content_draft || null);
      setAccroche((editingPost as any).accroche || null);
    } else if (prefillData) {
      setTheme(prefillData.theme || "");
      setAngle(null);
      setStatus("idea");
      setNotes(prefillData.notes || "");
      setObjectif(null);
      setPostCanal(defaultCanal !== "all" ? defaultCanal : "instagram");
      setFormat(null);
      setContentDraft(null);
      setAccroche(null);
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
    }
    setIsEditing(false);
    setShowFullContent(false);
  }, [editingPost, open, defaultCanal, prefillData]);

  const guide = angle ? getGuide(angle) : null;

  const handleSave = () => {
    if (!theme.trim()) return;
    onSave({ theme, angle, status, notes, canal: postCanal, objectif, format, content_draft: contentDraft, accroche });
  };

  const handleQuickGenerate = async () => {
    if (!theme.trim() || !angle) return;
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connectée");

      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();

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
      toast({ title: "Erreur de génération", description: e.message, variant: "destructive" });
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

  const contentPreview = contentDraft && contentDraft.length > 200 && !showFullContent
    ? contentDraft.slice(0, 200) + "..."
    : contentDraft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editingPost ? "Modifier le post" : "Ajouter un post"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Theme */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Thème / sujet</label>
            <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="De quoi parle ce post ?" className="rounded-[10px] h-11" />
          </div>

          {/* Objectif */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Objectif</label>
            <div className="flex flex-wrap gap-1.5">
              {OBJECTIFS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setObjectif(objectif === o.id ? null : o.id)}
                  className="rounded-pill px-3 py-1 text-xs font-medium border transition-all"
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
            <label className="text-sm font-medium mb-1.5 block">Angle</label>
            <div className="flex flex-wrap gap-1.5">
              {ANGLES.map((a) => (
                <button key={a} onClick={() => setAngle(angle === a ? null : a)}
                  className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${angle === a ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Format</label>
            <div className="flex flex-wrap gap-1.5">
              {FORMAT_OPTIONS.map((f) => (
                <button key={f.id} onClick={() => setFormat(format === f.id ? null : f.id)}
                  className={`rounded-pill px-3 py-1 text-xs font-medium border transition-all ${format === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}>
                  {f.emoji} {f.label}
                </button>
              ))}
            </div>
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

          {/* Notes */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Notes (optionnel)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Idées, brouillon, remarques..." className="rounded-[10px] min-h-[60px]" />
          </div>

          {/* Separator */}
          <div className="border-t border-border" />

          {/* Rédaction section */}
          <div>
            <label className="text-sm font-medium mb-2 block">✍️ Rédaction</label>

            {!angle ? (
              <p className="text-xs italic text-muted-foreground">
                💡 Choisis un angle pour débloquer la rédaction.
              </p>
            ) : contentDraft && !isEditing ? (
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
                  <Button variant="outline" size="sm" onClick={handleQuickGenerate} disabled={isGenerating} className="rounded-pill text-xs gap-1.5">
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
                />
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="rounded-pill text-xs">
                  ✅ Terminer l'édition
                </Button>
              </div>
            ) : (
              /* No content yet */
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">Pas encore de contenu rédigé.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleOpenAtelier} className="rounded-pill text-xs gap-1.5">
                    <Sparkles className="h-3 w-3" /> Rédiger avec l'atelier créatif
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleQuickGenerate} disabled={isGenerating || !theme.trim()} className="rounded-pill text-xs gap-1.5">
                    {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Générer en mode rapide
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
                <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
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

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={!theme.trim()} className="flex-1 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux">
              Enregistrer
            </Button>
            {editingPost && (
              <Button variant="outline" size="icon" onClick={onDelete} className="rounded-full text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
