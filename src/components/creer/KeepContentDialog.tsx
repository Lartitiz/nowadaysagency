import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { KeepContentReason } from "@/features/creer/keep-content";

const WHY: Record<KeepContentReason, string> = {
  format: "Passer à un autre format efface ton contenu actuel.",
  subject: "Changer de sujet efface ton contenu actuel.",
  linkedin_carousel: "Le carrousel prend la place de ton post. Il compte pour 1 carrousel du mois.",
};

/** Chantier J (18/10/2026) : « Tu as déjà un contenu » avant tout effacement dans /creer. */
export default function KeepContentDialog({ reason, saving, onKeep, onReplace, onCancel }: {
  reason: KeepContentReason | null;
  saving: boolean;
  onKeep: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={!!reason} onOpenChange={(next) => { if (!next && !saving) onCancel(); }}>
      <AlertDialogContent data-testid="keep-content-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Tu as déjà un contenu</AlertDialogTitle>
          <AlertDialogDescription>
            {reason ? WHY[reason] : ""} Tu peux le garder dans Mes idées pour le retrouver plus tard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:flex-col-reverse sm:space-x-0">
          <AlertDialogCancel className="mt-0" disabled={saving} onClick={onCancel}>Annuler</AlertDialogCancel>
          <Button variant="outline" disabled={saving} onClick={onReplace} data-testid="keep-content-replace">
            Le remplacer
          </Button>
          <Button disabled={saving} onClick={onKeep} data-testid="keep-content-keep">
            {saving ? "Enregistrement…" : "Le garder dans mes idées"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * `ask(reason, run)` : sans contenu à perdre, `run` part tout de suite ; sinon
 * la fenêtre s'ouvre.
 *   - « Le garder dans mes idées » : contenu déjà rangé tel quel → la suite
 *     ne réécrira plus dans sa fiche (`detach`) ; sinon une copie est rangée
 *     (`saveCopy`). Puis `run`. Si la copie échoue, rien n'est effacé.
 *   - « Le remplacer » : `run`.
 *   - « Annuler » : `onCancel(reason)` (retour au contenu), rien n'est effacé.
 */
export function useKeepContentConfirm(o: {
  hasContent: () => boolean;
  alreadyKept: () => boolean;
  saveCopy: () => Promise<unknown>;
  detach: () => void;
  onCancel: (reason: KeepContentReason) => void;
}) {
  const [reason, setReason] = useState<KeepContentReason | null>(null);
  const [saving, setSaving] = useState(false);
  const runRef = useRef<(() => void) | null>(null);
  const latest = useRef(o);
  latest.current = o;

  const ask = useCallback((why: KeepContentReason, run: () => void) => {
    if (!latest.current.hasContent()) { run(); return; }
    runRef.current = run;
    setReason(why);
  }, []);

  const close = () => { runRef.current = null; setReason(null); };
  const proceed = () => { const run = runRef.current; close(); run?.(); };

  const onKeep = async () => {
    if (saving) return;
    if (latest.current.alreadyKept()) {
      latest.current.detach();
      toast.success("Ton contenu reste dans Mes idées → En cours.");
      proceed();
      return;
    }
    setSaving(true);
    try {
      await latest.current.saveCopy();
      toast.success("Ton contenu est gardé dans Mes idées → En cours.");
    } catch {
      toast.error("Ton contenu n'a pas pu être gardé. Rien n'a été effacé : réessaie.");
      return;
    } finally {
      setSaving(false);
    }
    proceed();
  };

  return {
    ask,
    dialog: {
      reason,
      saving,
      onKeep: () => void onKeep(),
      onReplace: proceed,
      onCancel: () => { if (saving || !reason) return; const why = reason; close(); latest.current.onCancel(why); },
    },
  };
}
