// Séquence de lancement (angle « lancement » = 5 contenus, un par chapitre).
// Sorti à l'identique de CreerUnifie.tsx (lot E, docs/robustesse/gros-fichiers.md, fiche 1).
// La page appelle ce hook à l'endroit où vivaient ses états (ils sont lus tôt
// par la sauvegarde CREER_RESULT_KEY) ; `generate` n'existe que plus bas dans
// la page, d'où son passage au moment du lancement.
import { useState } from "react";
import { toast } from "sonner";
import { CONTENT_STRUCTURES, getStructureForCombo } from "@/lib/content-structures";
import type { GenerateParams } from "@/hooks/use-content-generator";

type LaunchContext = {
  generate: (params: GenerateParams) => Promise<any>;
  ideaText: string;
  objective: string | null;
};

export function useLaunchSequence() {
  const [launchResults, setLaunchResults] = useState<any[]>([]);
  const [launchIndex, setLaunchIndex] = useState(0);
  const [launchGenerating, setLaunchGenerating] = useState(false);

  // ── Launch sequence (5 chapters) ──

  const runLaunchSequence = async (format: string, angle: string, { generate, ideaText, objective }: LaunchContext) => {
    if (launchGenerating) return; // garde anti double-clic (chaque chapitre est facturé)
    const structureId = getStructureForCombo(format, angle);
    const structure = CONTENT_STRUCTURES[structureId];
    if (!structure) return;

    setLaunchGenerating(true);
    setLaunchResults([]);
    const chapters = 5;
    const results: any[] = [];

    try {
      for (let i = 0; i < chapters; i++) {
        setLaunchIndex(i);
        const chapterSubject = `${ideaText} — Chapitre ${i + 1}/${chapters}`;
        const res = await generate({
          format: format as any,
          subject: chapterSubject,
          objective: objective || undefined,
          editorialAngle: angle,
        });
        results.push(res);
      }
      setLaunchResults(results);
    } catch (e: any) {
      // Sans ce filet, une erreur au chapitre N laissait le spinner tourner à l'infini.
      if (results.length > 0) setLaunchResults(results); // garde les chapitres déjà générés
      toast.error(e?.message || "Erreur pendant la génération de la séquence. Réessaie.");
    } finally {
      setLaunchGenerating(false);
    }
  };

  return { launchResults, setLaunchResults, launchIndex, setLaunchIndex, launchGenerating, runLaunchSequence };
}
