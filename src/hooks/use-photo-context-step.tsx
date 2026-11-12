// Étape « Que montre chaque photo ? » branchée sur doGenerate (carrousel photo
// et mixte). Logique pure : src/features/creer/photo-context-step.ts ; fenêtre :
// src/components/creer/PhotoContextStepDialog.tsx.
//
// doGenerate demande `intercept(...)` avant de lancer quoi que ce soit. Si une
// photo n'a pas de contexte (et qu'on n'a pas déjà posé la question pour ce lot
// de photos), la fenêtre s'ouvre et doGenerate s'arrête. « Créer mon carrousel »
// écrit les contextes dans les photos, puis relance doGenerate au rendu suivant
// (état à jour, pas de fermeture périmée). « Passer » relance sans rien changer.
import { useEffect, useRef, useState, type ReactNode } from "react";
import PhotoContextStepDialog from "@/components/creer/PhotoContextStepDialog";
import {
  applyContextRows, contextStepSignature, initialRows, needsContextStep, stepPhotos,
  type ContextStepPhoto, type ContextStepRow,
} from "@/features/creer/photo-context-step";

type Resume = () => void;

export interface PhotoContextStepOptions {
  /** Applique les photos mises à jour (état + copie de secours). */
  applyPhotos: (photos: any[]) => void;
}

export function usePhotoContextStep({ applyPhotos }: PhotoContextStepOptions) {
  const asked = useRef(new Set<string>());
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ContextStepRow[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const pending = useRef<{ photos: any[]; resume: Resume } | null>(null);
  const resumeNext = useRef<Resume | null>(null);
  const [tick, setTick] = useState(0);

  // Relance après le rendu qui a pris les nouvelles photos : la fonction
  // `resume` lit alors le doGenerate de CE rendu.
  useEffect(() => {
    const go = resumeNext.current;
    if (!go) return;
    resumeNext.current = null;
    go();
  }, [tick]);

  /** true = la fenêtre est ouverte, doGenerate doit s'arrêter là. */
  const intercept = (photos: ContextStepPhoto[], resume: Resume): boolean => {
    if (!needsContextStep(photos)) return false;
    const sig = contextStepSignature(photos);
    if (asked.current.has(sig)) return false;
    asked.current.add(sig);
    pending.current = { photos, resume };
    setRows(initialRows(photos));
    setPreviews(stepPhotos(photos).map((p) => p.preview || ""));
    setOpen(true);
    return true;
  };

  const finish = (apply: boolean) => {
    const p = pending.current;
    pending.current = null;
    setOpen(false);
    if (!p) return;
    if (apply) applyPhotos(applyContextRows(p.photos, rows));
    resumeNext.current = p.resume;
    setTick((t) => t + 1);
  };

  const cancel = () => {
    const p = pending.current;
    pending.current = null;
    setOpen(false);
    // Fermée sans choisir : on pourra reposer la question au prochain clic.
    if (p) asked.current.delete(contextStepSignature(p.photos));
  };

  const dialog: ReactNode = (
    <PhotoContextStepDialog
      open={open}
      previews={previews}
      rows={rows}
      onRowsChange={setRows}
      onConfirm={() => finish(true)}
      onSkip={() => finish(false)}
      onCancel={cancel}
    />
  );

  return { intercept, dialog };
}
