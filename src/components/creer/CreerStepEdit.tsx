import { useState, useCallback, useRef, useEffect } from "react";
import { readableError } from "@/lib/error-messages";
import { copyTextForChannel } from "@/lib/linkedin-copy";
import { useTextEditHistory } from "@/hooks/use-text-edit-history";
import { editHistoryShortcut } from "@/lib/edit-history-shortcut";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Copy, Save, CalendarDays, Loader2, Undo2, Redo2 } from "lucide-react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Props {
  content: string;
  /** Dernière version appliquée (« Sauver ») : au-delà, les modifications sont en attente. */
  savedContent?: string;
  /** Texte en cours, transmis au fil de la frappe pour la copie de secours. */
  onDraftChange?: (text: string) => void;
  format: string;
  subject?: string;
  newsContext?: string | null;
  workspaceId?: string;
  /** Retourne false si le texte n'a pas pu être appliqué (l'écran reste ouvert). */
  onSave: (editedContent: string) => boolean | void;
  onBack: () => void;
  onCopy: (text: string) => void;
  onCalendar?: () => void;
}

// Type de contenu envoyé à l'ajustement : avant le 14/10/2026, tout ce qui
// n'était ni LinkedIn ni newsletter partait comme un post Instagram.
const ADJUST_CONTENT_TYPES: Record<string, string> = {
  linkedin: "linkedin_post",
  newsletter: "newsletter",
  reel: "reel",
  story: "stories",
  carousel: "carousel",
  pinterest_visual: "post_pinterest",
  pinterest_photo: "post_pinterest",
};

const ADJUSTMENTS = [
  { id: "shorter", label: "Plus court", emoji: "✂️" },
  { id: "punchy", label: "Plus punchy", display: "Plus percutant", emoji: "💥" },
  { id: "tone", label: "Ajuste le ton", emoji: "🎨" },
  { id: "storytelling", label: "Plus de storytelling", display: "Raconter davantage ton histoire", emoji: "📖" },
];

const QUALITY_CHECKLIST = [
  "Le contenu est clair, affirmé, percutant ?",
  "Y a-t-il une histoire ou un exemple concret ?",
  "Écriture inclusive avec point médian ?",
  "L'accroche donne envie de lire la suite ?",
  "L'appel à l'action est naturel et non agressif ?",
];

export default function CreerStepEdit({ content, savedContent, onDraftChange, format, subject, newsContext, workspaceId, onSave, onBack, onCopy, onCalendar }: Props) {
  const history = useTextEditHistory(content);
  const editedContent = history.value;
  const [confirmBackOpen, setConfirmBackOpen] = useState(false);
  // Copie de secours au fil de la frappe (lot 6, 14/10/2026) : avant, le texte
  // ne quittait cet écran qu'au clic sur « Sauver ».
  const draftChange = useRef(onDraftChange);
  draftChange.current = onDraftChange;
  useEffect(() => {
    if (!draftChange.current || editedContent === content) return;
    const timer = setTimeout(() => draftChange.current?.(editedContent), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedContent]);
  const hasUnsavedChanges = editedContent !== (savedContent ?? content);
  const handleBack = () => {
    if (hasUnsavedChanges) setConfirmBackOpen(true);
    else onBack();
  };
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<boolean[]>(new Array(QUALITY_CHECKLIST.length).fill(false));

  const handleAdjust = useCallback(async (adjustmentId: string) => {
    setAdjusting(adjustmentId);
    try {
      const { data, error } = await invokeWithTimeout("creative-flow", {
        body: {
          step: "adjust",
          contentType: ADJUST_CONTENT_TYPES[format] || "instagram_post",
          content: editedContent,
          adjustment: ADJUSTMENTS.find((a) => a.id === adjustmentId)?.label || adjustmentId,
          context: subject || "",
          ...(newsContext?.trim() ? { news_context: newsContext.trim().slice(0, 3800) } : {}),
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        },
        // Budget serveur : appel unique borné à 60s (audit latences 17/08) — le
        // timeout client doit rester au-dessus pour ne pas courir avec le filet serveur.
      }, 90000);
      if (error) throw new Error(error.message);

      const adjusted = typeof data === "string" ? data : data?.content || data?.text || data?.adjusted;
      if (!active.current) return;
      if (typeof adjusted !== "string" || !adjusted.trim()) {
        // Avant : l'ancien texte restait et on affichait quand même « Contenu ajusté ! ».
        toast.error("L'ajustement n'a rien renvoyé. Ton texte est inchangé, réessaie.");
        return;
      }
      history.change(adjusted);
      toast.success("Contenu ajusté !");
    } catch (e: any) {
      if (!active.current) return;
      toast.error(readableError(e, "L'ajustement n'a pas abouti. Réessaie dans un instant."));
    } finally {
      if (active.current) setAdjusting(null);
    }
  }, [editedContent, format, subject, newsContext, workspaceId, history.change]);

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  return (
    <div className="space-y-5 animate-fade-in" onKeyDown={(event) => {
      const action = editHistoryShortcut(event.nativeEvent);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (!adjusting) history.travel(action === "redo");
    }}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!history.canUndo || !!adjusting} onClick={() => history.travel()} aria-label="Annuler la modification" aria-keyshortcuts="Meta+Z Control+Z" title="Annuler (⌘Z / Ctrl+Z)">
          <Undo2 className="h-3.5 w-3.5" /> Annuler
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!history.canRedo || !!adjusting} onClick={() => history.travel(true)} aria-label="Rétablir la modification" aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y" title="Rétablir (⌘⇧Z / Ctrl+⇧Z / Ctrl+Y)">
          <Redo2 className="h-3.5 w-3.5" /> Rétablir
        </Button>
      </div>
      {/* Editable content */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">✏️ Peaufine ton contenu</p>
        <Textarea
          value={editedContent}
          aria-label="Contenu à peaufiner"
          disabled={!!adjusting}
          onChange={(e) => history.change(e.target.value, true)}
          rows={10}
          className="resize-y font-mono text-sm"
        />
      </div>

      {/* Adjustment buttons */}
      <div className="flex flex-wrap gap-2">
        {ADJUSTMENTS.map((adj) => (
          <Button
            key={adj.id}
            variant="outline"
            size="sm"
            disabled={adjusting !== null}
            onClick={() => handleAdjust(adj.id)}
            className="gap-1.5"
          >
            {adjusting === adj.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>{adj.emoji}</span>
            )}
            {adj.display ?? adj.label}
          </Button>
        ))}
      </div>

      {/* Quality checklist */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Checklist qualité</p>
        {QUALITY_CHECKLIST.map((item, i) => (
          <label key={i} className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={checkedItems[i]}
              onCheckedChange={() => toggleCheck(i)}
              className="mt-0.5"
            />
            <span className="text-sm text-foreground">{item}</span>
          </label>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => onCopy(copyTextForChannel(editedContent, format))} className="gap-1.5">
          <Copy className="h-3.5 w-3.5" /> Copier
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSave(editedContent)} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Sauver
        </Button>
        {onCalendar && (
          <Button size="sm" onClick={onCalendar} className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Planifier
          </Button>
        )}
      </div>

      <AlertDialog open={confirmBackOpen} onOpenChange={setConfirmBackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tu as des modifications non appliquées</AlertDialogTitle>
            <AlertDialogDescription>
              Si tu reviens maintenant, elles ne seront pas gardées dans ton contenu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer à modifier</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (onSave(editedContent) !== false) onBack();
              }}
            >
              Appliquer et revenir
            </AlertDialogAction>
          </AlertDialogFooter>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 self-center"
            onClick={() => {
              setConfirmBackOpen(false);
              onBack();
            }}
          >
            Revenir sans les appliquer
          </button>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
