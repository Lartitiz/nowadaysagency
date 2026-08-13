import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

const STEP_LABELS: Record<string, string> = {
  format: "choix du format",
  questions: "questions de cadrage",
  structure_review: "structure",
  hook_selection: "choix de l'accroche",
  user_slides: "tes slides",
  generating: "génération en cours",
  result: "contenu généré",
  edit: "relecture",
};

export interface DraftSummary {
  step: string;
  ideaText: string;
  selectedFormat: string | null;
  result: any;
  editContent: string;
  editingIdeaId?: string | null;
}

interface Props {
  open: boolean;
  draft: DraftSummary;
  newSubject: string;
  onResume: () => void;
  onStartNew: () => void;
}

export default function DraftConflictDialog({ open, draft, newSubject, onResume, onStartNew }: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [saveFirst, setSaveFirst] = useState(true);
  const [busy, setBusy] = useState(false);

  const draftTitle = draft.ideaText?.trim() || "Contenu sans titre";
  const stepLabel = STEP_LABELS[draft.step] || draft.step;

  const saveDraftToIdeas = async () => {
    if (!user) return;
    const contentData = draft.result ?? (draft.editContent ? { texte: draft.editContent } : null);
    const payload: any = {
      user_id: user.id,
      workspace_id: workspaceId && workspaceId !== user.id ? workspaceId : undefined,
      titre: `📝 ${draftTitle.slice(0, 120)}`,
      angle: "brouillon",
      format: draft.selectedFormat || "post",
      notes: "Brouillon mis de côté depuis l'espace Créer",
      content_draft:
        typeof contentData === "string" ? contentData : contentData ? JSON.stringify(contentData) : null,
      content_data: contentData,
    };
    if (draft.editingIdeaId) {
      const { error } = await supabase
        .from("saved_ideas")
        .update({ ...payload, user_id: undefined, updated_at: new Date().toISOString() })
        .eq("id", draft.editingIdeaId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("saved_ideas").insert(payload);
      if (error) throw error;
    }
  };

  const handleStartNew = async () => {
    setBusy(true);
    try {
      if (saveFirst) {
        await saveDraftToIdeas();
        toast.success("Brouillon enregistré dans ta boîte à idées");
      }
    } catch (e) {
      console.error("Save draft to ideas failed:", e);
      toast.error("Impossible d'enregistrer le brouillon — on continue quand même");
    } finally {
      setBusy(false);
      onStartNew();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" hideClose>
        <DialogHeader>
          <DialogTitle>Tu as déjà un contenu en cours</DialogTitle>
          <DialogDescription>
            Qu'est-ce qu'on en fait avant de lancer le nouveau&nbsp;?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
              En cours — {stepLabel}
            </p>
            <p className="text-sm text-foreground line-clamp-2">{draftTitle}</p>
          </div>

          {newSubject && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-2xs uppercase tracking-wider text-primary font-semibold">
                Nouvelle demande
              </p>
              <p className="text-sm text-foreground line-clamp-2">{newSubject}</p>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={saveFirst}
              onCheckedChange={(v) => setSaveFirst(v === true)}
              className="mt-0.5"
            />
            <span>Enregistrer le contenu en cours dans mes idées avant de le quitter</span>
          </label>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button className="rounded-full" onClick={handleStartNew} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Démarrer le nouveau contenu
          </Button>
          <Button variant="outline" className="rounded-full" onClick={onResume} disabled={busy}>
            Reprendre mon contenu en cours
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
