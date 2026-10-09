import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { toast } from "sonner";
import { RECAP_PREFIX, isRecapBrief, splitBriefSubjects, stripRecapPrefix, type BriefSubject } from "../../../supabase/functions/_shared/multi-subject";

interface Props {
  idea: string;
  /** Format en cours, pour les sujets rangés dans Mes idées. */
  format: string;
  onIdeaChange: (text: string) => void;
  /** « C'est un seul sujet » : la détection s'est trompée, on garde le texte tel quel. */
  onSingleSubject: () => void;
}

/**
 * Brief à plusieurs sujets pour des stories ou un reel (09/10/2026) : la
 * rédaction attend un seul sujet, elle gardait donc le premier en silence. On
 * demande : un récap de tous les sujets, ou un seul sujet (les autres rangés en
 * briefs dans Mes idées, avec leur texte complet), ou « c'est un seul sujet »
 * quand des intertitres ont été pris pour des sujets.
 */
export default function MultiSubjectChoice({ idea, format, onIdeaChange, onSingleSubject }: Props) {
  const isReel = format === "reel";
  const unit = isReel ? "un Reel" : "une séquence";
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [keepOthers, setKeepOthers] = useState(true);
  const [saving, setSaving] = useState(false);

  if (isRecapBrief(idea)) {
    const count = splitBriefSubjects(idea).length;
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3" data-testid="multi-subject-recap">
        <p className="text-sm text-foreground">{isReel ? "Un Reel récap" : "Une séquence récap"} de tes {count} sujets.</p>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-primary shrink-0"
          onClick={() => onIdeaChange(stripRecapPrefix(idea))}
        >
          Changer
        </button>
      </div>
    );
  }

  const subjects = splitBriefSubjects(idea);
  if (subjects.length < 2) return null;

  const chooseOne = async (chosen: BriefSubject) => {
    const others = subjects.filter((s) => s.n !== chosen.n);
    if (keepOthers && others.length > 0) {
      if (!user) { toast.error("Reconnecte-toi pour ranger les autres sujets."); return; }
      setSaving(true);
      const { error } = await supabase.from("content_briefs").insert(others.map((s) => ({
        user_id: user.id,
        workspace_id: workspaceId && workspaceId !== user.id ? workspaceId : null,
        subject: s.block,
        format,
        questions: [],
        answers: {},
      })) as any);
      setSaving(false);
      if (error) {
        toast.error("Impossible de ranger les autres sujets", { description: "Rien n'a changé : réessaie, ou décoche « Ranger les autres sujets »." });
        return;
      }
      toast.success(`${others.length} sujet${others.length > 1 ? "s rangés" : " rangé"} dans Mes idées`);
    }
    onIdeaChange(chosen.block);
  };

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3 animate-fade-in" data-testid="multi-subject-choice">
      <div>
        <p className="text-sm font-semibold text-foreground">Ton texte contient {subjects.length} sujets</p>
        <p className="text-xs text-muted-foreground mt-0.5">{isReel ? "Un Reel porte une seule idée." : "Une séquence de stories porte un seul fil."} Qu'est-ce qu'on fait ?</p>
      </div>
      <Button type="button" variant="default" size="sm" className="w-full justify-start" disabled={saving} onClick={() => onIdeaChange(`${RECAP_PREFIX}\n\n${idea.trim()}`)}>
        {isReel ? "Un Reel récap" : "Une séquence récap"} des {subjects.length} sujets
      </Button>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Ou {unit} sur un seul sujet :</p>
        {subjects.map((s) => (
          <Button key={s.n} type="button" variant="outline" size="sm" className="w-full justify-start h-auto py-2 text-left whitespace-normal" disabled={saving} onClick={() => chooseOne(s)}>
            {s.n}. {s.title}
          </Button>
        ))}
        <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={keepOthers} onCheckedChange={(v) => setKeepOthers(v === true)} />
          Ranger les autres sujets dans Mes idées, pour en faire {isReel ? "d'autres Reels" : "d'autres séquences"}
        </label>
      </div>
      <button type="button" className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline" disabled={saving} onClick={onSingleSubject}>
        Non, c'est un seul sujet avec des intertitres
      </button>
    </div>
  );
}
