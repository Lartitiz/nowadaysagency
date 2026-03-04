import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sparkles, Copy, RefreshCw, Loader2, MoreHorizontal, CheckCircle2 } from "lucide-react";
import type { CalendarPost } from "@/lib/calendar-constants";

interface Props {
  editingPost: CalendarPost | null;
  theme: string;
  contentDraft: string | null;
  setContentDraft: (v: string | null) => void;
  accroche: string | null;
  setAccroche: (v: string | null) => void;
  status: string;
  setStatus: (s: string) => void;
  isGenerating: boolean;
  onSmartGenerate: () => void;
  onCopy: () => void;
  onOpenAtelier: () => void;
  onNavigateToDeepen: () => void;
  onNavigateToFormat: (format: string) => void;
  postCanal: string;
  format: string | null;
  angle: string | null;
  objectif: string | null;
  notes: string;
  mediaUrls: string[];
  onSaveAndClose: () => void;
}

export function CalendarPostContent({
  editingPost, theme, contentDraft, setContentDraft, accroche, setAccroche,
  status, setStatus, isGenerating, onSmartGenerate, onCopy, onOpenAtelier,
  onNavigateToDeepen, onNavigateToFormat, postCanal, format,
  angle, objectif, notes, mediaUrls, onSaveAndClose,
}: Props) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);
  const [showContentViewer, setShowContentViewer] = useState(false);

  if (!editingPost || !theme.trim()) return null;

  const hasContent = !!(contentDraft || editingPost.generated_content_id);
  const isPublished = status === "published";
  const isReady = status === "ready" || status === "draft_ready";

  const contentPreview = contentDraft && contentDraft.length > 200 && !showFullContent
    ? contentDraft.slice(0, 200) + "..."
    : contentDraft;

  const ExpandCollapseButtons = () => (
    <>
      {contentDraft && contentDraft.length > 200 && !showFullContent && (
        <button onClick={() => setShowFullContent(true)} className="block mt-1 text-xs text-primary hover:underline">voir la suite ↓</button>
      )}
      {showFullContent && contentDraft && contentDraft.length > 200 && (
        <button onClick={() => setShowFullContent(false)} className="block mt-1 text-xs text-primary hover:underline">réduire ↑</button>
      )}
    </>
  );

  const ContentEditable = () => (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const newText = e.currentTarget.innerText || "";
        if (newText !== contentDraft) {
          setContentDraft(newText);
          setShowFullContent(true);
        }
      }}
      className="rounded-[10px] border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap cursor-text transition-colors hover:bg-muted/30 focus:bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
    >
      {contentPreview}
    </div>
  );

  const DeepenAndFormatActions = () => (
    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
      <Button
        variant="ghost"
        size="sm"
        className="rounded-pill text-xs gap-1.5 text-primary hover:bg-primary/10"
        onClick={onNavigateToDeepen}
      >
        <Sparkles className="h-3 w-3" /> Approfondir avec l'IA
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-pill text-xs gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3 w-3" /> Changer de format
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {postCanal === "instagram" && (
            <>
              <DropdownMenuItem onClick={() => onNavigateToFormat("carousel")}>📑 Transformer en carrousel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNavigateToFormat("reel")}>🎬 Transformer en reel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNavigateToFormat("story")}>📱 Transformer en stories</DropdownMenuItem>
            </>
          )}
          {postCanal === "linkedin" && (
            <DropdownMenuItem onClick={() => onNavigateToFormat("linkedin")}>📝 Transformer en post LinkedIn</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => navigate("/transformer")}>🔄 Recycler (crosspost)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editingPost?.story_sequence_detail && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowContentViewer(true)}
          className="rounded-pill text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        >
          👁️ {(editingPost.story_sequence_detail as any)?.type === "reel"
            ? "Voir le script"
            : (editingPost.story_sequence_detail as any)?.type === "stories"
            ? "Voir la séquence"
            : (editingPost.story_sequence_detail as any)?.type === "carousel"
            ? "Voir les slides"
            : "Voir le détail"}
        </Button>
      )}
    </div>
  );

  return (
    <div>
      <label className="text-xs font-semibold mb-2 block text-foreground">✍️ Contenu</label>

      {isEditing ? (
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

      ) : isPublished && hasContent ? (
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-pill">
            <CheckCircle2 className="h-3 w-3" /> Publié
          </span>
          <div className="rounded-[10px] border border-border bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap opacity-80">
            {contentPreview}
          </div>
          <ExpandCollapseButtons />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCopy} className="rounded-pill text-xs gap-1.5">
              <Copy className="h-3 w-3" /> Copier
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-pill px-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/transformer")}>🔄 Recycler (crosspost)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      ) : hasContent && isReady ? (
        <div className="space-y-3">
          <ContentEditable />
          <ExpandCollapseButtons />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCopy} className="rounded-pill text-xs gap-1.5">
              <Copy className="h-3 w-3" /> Copier
            </Button>
            <Button size="sm" onClick={() => setStatus("published")} className="rounded-pill text-xs gap-1.5">
              ✅ Marquer comme publié
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-pill px-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>✏️ Modifier</DropdownMenuItem>
                <DropdownMenuItem onClick={onSmartGenerate}>🔄 Nouvelle version IA</DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenAtelier}>✨ Ouvrir dans l'atelier</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <DeepenAndFormatActions />
        </div>

      ) : hasContent ? (
        <div className="space-y-3">
          <ContentEditable />
          <ExpandCollapseButtons />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="rounded-pill text-xs gap-1.5">
              ✏️ Modifier
            </Button>
            <Button variant="outline" size="sm" onClick={onCopy} className="rounded-pill text-xs gap-1.5">
              <Copy className="h-3 w-3" /> Copier
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-pill px-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onSmartGenerate}>🔄 Nouvelle version IA</DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenAtelier}>✨ Ouvrir dans l'atelier</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setContentDraft(null); setAccroche(null); }} className="text-destructive">
                  🗑️ Supprimer le contenu
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <DeepenAndFormatActions />
        </div>

      ) : (
        <div className="space-y-3">
          {!angle && (
            <p className="text-xs italic text-muted-foreground">💡 Choisis un angle pour un meilleur résultat</p>
          )}
          <p className="text-xs text-muted-foreground">Pas encore de contenu.</p>
          <Button
            onClick={onSmartGenerate}
            disabled={isGenerating || !theme.trim()}
            className="w-full rounded-pill gap-2"
            size="default"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            ✨ Rédiger avec l'IA
          </Button>
          <button
            onClick={() => setIsEditing(true)}
            className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            ou écrire moi-même
          </button>
        </div>
      )}
    </div>
  );
}
