import { useState, useCallback, useRef, useEffect } from "react";
import { useTextEditHistory } from "@/hooks/use-text-edit-history";
import { editHistoryShortcut } from "@/lib/edit-history-shortcut";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Copy, Save, CalendarDays, Loader2, Undo2, Redo2 } from "lucide-react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { toast } from "sonner";

interface Props {
  content: string;
  format: string;
  subject?: string;
  newsContext?: string | null;
  workspaceId?: string;
  onSave: (editedContent: string) => void;
  onBack: () => void;
  onCopy: (text: string) => void;
  onCalendar?: () => void;
}

const ADJUSTMENTS = [
  { id: "shorter", label: "Plus court", emoji: "✂️" },
  { id: "punchy", label: "Plus punchy", emoji: "💥" },
  { id: "tone", label: "Ajuste le ton", emoji: "🎨" },
  { id: "storytelling", label: "Plus de storytelling", emoji: "📖" },
];

const QUALITY_CHECKLIST = [
  "Le contenu est clair, affirmé, punchy ?",
  "Y a-t-il du storytelling ou un exemple concret ?",
  "Écriture inclusive avec point médian ?",
  "L'accroche donne envie de lire la suite ?",
  "Le CTA est naturel et non agressif ?",
];

export default function CreerStepEdit({ content, format, subject, newsContext, workspaceId, onSave, onBack, onCopy, onCalendar }: Props) {
  const history = useTextEditHistory(content);
  const editedContent = history.value;
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
          contentType: format === "linkedin" ? "linkedin_post" : format === "newsletter" ? "newsletter" : "instagram_post",
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

      const adjusted = typeof data === "string" ? data : data?.content || data?.text || data?.adjusted || editedContent;
      if (!active.current) return;
      history.change(adjusted);
      toast.success("Contenu ajusté !");
    } catch (e: any) {
      if (!active.current) return;
      toast.error(e?.message || "Erreur lors de l'ajustement");
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
            {adj.label}
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
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => onCopy(editedContent)} className="gap-1.5">
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
    </div>
  );
}
