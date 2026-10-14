import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Filet « Régénérer » / « Changer d'angle » (lot 6 « robustesse création de
// contenu », 14/10/2026 ; voir docs/creation-contenu/CARTE.md).
//
// Une régénération vide le résultat avant d'appeler l'IA : sans ce filet, les
// retouches de l'utilisatrice (texte modifié, slides, visuels) disparaissaient,
// copie de secours du navigateur comprise, et pour de bon si la nouvelle
// génération échouait. Ici, on garde la version d'avant :
//   - échec (aucun nouveau résultat) → elle revient toute seule ;
//   - succès → un toast propose « Revenir à ma version précédente » ;
//   - étape intermédiaire (structure à valider, choix du hook) → on attend.
// Tant que la régénération n'est pas tranchée, la copie de secours garde
// l'ancienne version (voir `persisted` dans CreerUnifie).

export interface RegenerationSnapshot {
  result: any;
  visualSlides: { slide_number: number; html: string }[];
  editContent: string;
}

type Outcome = "waiting" | "succeeded" | "failed" | "abandoned";

/** Décision pure, testée à part : que faire d'une régénération en attente ? */
export function regenerationOutcome(params: {
  started: boolean;
  busy: boolean;
  result: unknown;
  previousResult: unknown;
  step: string;
}): Outcome {
  const { started, busy, result, previousResult, step } = params;
  if (busy || !started) return "waiting";
  if (result && result !== previousResult) return "succeeded";
  // Les échecs de génération laissent l'étape résultat vide, ou renvoient à
  // l'étape format (carrousel photo, structure non reçue…).
  if (!result && (step === "result" || step === "format")) return "failed";
  // Repartie de zéro (idée, questions) : la sauvegarde ne la concerne plus.
  if (step === "idea" || step === "questions") return "abandoned";
  return "waiting";
}

export function useRegenerationBackup(params: {
  result: any;
  step: string;
  busy: boolean;
  restore: (snapshot: RegenerationSnapshot) => void;
}) {
  const { result, step, busy, restore } = params;
  const [pending, setPending] = useState<RegenerationSnapshot | null>(null);
  const startedRef = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  /** À appeler juste avant de relancer la génération d'un résultat existant. */
  const begin = useCallback((snapshot: RegenerationSnapshot) => {
    if (!snapshot.result) return;
    startedRef.current = false;
    setPending(snapshot);
  }, []);

  /** Après l'appel : si rien n'a démarré (garde anti double-clic…), on oublie la sauvegarde. */
  const settleIfNotStarted = useCallback(() => {
    if (!startedRef.current) setPending(null);
  }, []);

  useEffect(() => {
    if (!pending) return;
    if (busy) startedRef.current = true;
    const outcome = regenerationOutcome({ started: startedRef.current, busy, result, previousResult: pending.result, step });
    if (outcome === "waiting") return;
    setPending(null);
    if (outcome === "failed") {
      restoreRef.current(pending);
      toast("La nouvelle version n'a pas pu être créée. Ta version précédente est revenue, avec tes modifications.", { id: "regeneration-backup", duration: 10000 });
    } else if (outcome === "succeeded") {
      const previous = pending;
      toast.success("Nouvelle version prête.", {
        id: "regeneration-backup",
        duration: 30000,
        action: { label: "Revenir à ma version précédente", onClick: () => restoreRef.current(previous) },
      });
    }
  }, [pending, busy, result, step]);

  return { pending, begin, settleIfNotStarted };
}
