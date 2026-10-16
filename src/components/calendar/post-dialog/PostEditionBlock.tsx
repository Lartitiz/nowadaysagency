// Bloc d'édition de la fenêtre d'un post du calendrier : sujet, contenu,
// visuels, et le volet replié « Notes, brief & commentaires ». Sorti de
// CalendarPostDialog.tsx à l'identique (fiche 13 de
// docs/robustesse/gros-fichiers.md, lot 3). L'état, la lecture du brief lié
// (content_briefs) et le guide restent dans la fenêtre : sur mobile, l'onglet
// « Éditer » est démonté quand on change d'onglet, une lecture ici serait
// relancée à chaque retour.
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { PostCommentsSection } from "@/components/calendar/PostCommentsSection";
import { cn } from "@/lib/utils";
import type { CalendarPost } from "@/lib/calendar-constants";
import type { GuideStep } from "@/lib/production-guides";
import { CalendarPostContent } from "../CalendarPostContent";

export interface LinkedBrief {
  subject: string;
  questions: { id: string; question: string }[];
  answers: Record<string, string>;
  created_at: string;
}

interface PostEditionBlockProps {
  editingPost: CalendarPost | null;
  theme: string;
  setTheme: (v: string) => void;
  themeRef: MutableRefObject<HTMLTextAreaElement | null>;
  contentDraft: string | null;
  setContentDraft: (v: string | null) => void;
  accroche: string | null;
  setAccroche: (v: string | null) => void;
  status: string;
  setStatus: (v: string) => void;
  isGenerating: boolean;
  handleSmartGenerate: () => void;
  handleCopy: () => void;
  handleOpenAtelier: () => Promise<void>;
  handleNavigateToDeepen: () => Promise<void>;
  postCanal: string;
  format: string | null;
  angle: string | null;
  objectif: string | null;
  notes: string;
  setNotes: (v: string) => void;
  mediaUrls: string[];
  setMediaUrls: Dispatch<SetStateAction<string[]>>;
  handleSave: () => void;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  setShowContentViewer: (open: boolean) => void;
  uploading: boolean;
  handleMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  showSecondary: boolean;
  setShowSecondary: (open: boolean) => void;
  linkedBrief: LinkedBrief | null;
  guide: GuideStep[] | null;
  ownerName: string;
}

export function PostEditionBlock({ editingPost, theme, setTheme, themeRef, contentDraft, setContentDraft, accroche, setAccroche, status, setStatus, isGenerating, handleSmartGenerate, handleCopy, handleOpenAtelier, handleNavigateToDeepen, postCanal, format, angle, objectif, notes, setNotes, mediaUrls, setMediaUrls, handleSave, onOpenChange, isMobile, setShowContentViewer, uploading, handleMediaUpload, showSecondary, setShowSecondary, linkedBrief, guide, ownerName }: PostEditionBlockProps) {
  return (
    <div className="space-y-4 min-w-0">
      <div>
        <label className="text-xs font-semibold mb-1.5 block text-foreground">Thème / sujet</label>
        <textarea
          ref={themeRef}
          autoFocus
          rows={1}
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder="De quoi parle ce post ?"
          className="flex w-full rounded-[10px] border border-input bg-background px-3 py-2.5 text-sm leading-6 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-[7rem]"
        />
      </div>

      <CalendarPostContent
        editingPost={editingPost} theme={theme}
        contentDraft={contentDraft} setContentDraft={setContentDraft}
        accroche={accroche} setAccroche={setAccroche}
        status={status} setStatus={setStatus}
        isGenerating={isGenerating} onSmartGenerate={handleSmartGenerate}
        onCopy={handleCopy} onOpenAtelier={handleOpenAtelier}
        onNavigateToDeepen={handleNavigateToDeepen}
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
          {uploading ? "Import en cours..." : "Ajouter des visuels"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleMediaUpload} disabled={uploading} />
        </label>
      </div>

      {/* Secondaire replié : notes, brief créatif, guide de production, commentaires */}
      <Collapsible open={showSecondary} onOpenChange={setShowSecondary} className="border-t border-border pt-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1 w-full">
          <span>📝 Notes, consignes &amp; commentaires</span>
          <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", showSecondary && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div>
            <label className="text-xs font-semibold mb-1.5 block text-foreground">📝 Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Idées, brouillon, remarques..." className="rounded-[10px] min-h-[80px]" />
          </div>

          {linkedBrief && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground">📋 Idée de départ <span className="text-muted-foreground font-normal">— {Object.values(linkedBrief.answers).filter(v => v?.trim()).length} réponse(s)</span></p>
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
}
