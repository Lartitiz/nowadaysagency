// « Tout corriger » (12/11/2026) : branche le calcul de carousel-fix-all.ts sur
// l'éditeur. Une seule étape d'Annuler, et un message qui dit ce qui reste à
// faire à la main. Utilisé par le panneau « Contrôle qualité » et la barre
// sous la slide.
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { CarouselDocument } from "@/lib/carousel-editor";
import { applyFixPatches, describeRemaining, fixCarouselQuality } from "@/lib/carousel-fix-all";

export interface FixAll {
  busy: boolean;
  /** Corrige tout le carrousel. */
  run: () => Promise<void>;
}

export function useFixAll(
  current: MutableRefObject<CarouselDocument>,
  commit: (next: CarouselDocument) => void,
  undo: () => unknown,
): FixAll {
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const run = async () => {
    if (abort.current) return;
    const controller = (abort.current = new AbortController());
    setBusy(true);
    try {
      const result = await fixCarouselQuality(current.current, controller.signal);
      if (controller.signal.aborted) return;
      const lines = describeRemaining(result);
      if (!result.patches.length) {
        toast(lines.length ? "Rien n’a pu être corrigé tout seul" : "Rien à corriger", {
          description: lines.length ? `À faire toi-même : ${lines.join(" ")}` : "Aucun point signalé sur tes slides.",
          duration: lines.length ? 12000 : 4000,
        });
        return;
      }
      const next = applyFixPatches(current.current, result.patches);
      commit(next);
      const count = new Set(result.patches.map((p) => `${p.slideId}/${p.elementId}`)).size;
      toast.success(`${count} élément${count > 1 ? "s" : ""} corrigé${count > 1 ? "s" : ""}`, {
        description: lines.length ? `Reste à faire toi-même : ${lines.join(" ")}` : "Tout ce qui était signalé est corrigé.",
        duration: lines.length ? 15000 : 6000,
        action: {
          label: "Annuler",
          // N'annule que « Tout corriger », jamais une retouche faite après.
          onClick: () => current.current === next && undo(),
        },
      });
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error("La correction n’a pas pu se faire", {
          description: (error as Error)?.message || "Réessaie dans un instant.",
        });
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  };
  return { busy, run };
}
