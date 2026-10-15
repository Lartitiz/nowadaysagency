import { useEffect, useRef, useState } from "react";
import type { saveFlowState as persistFlowState } from "@/hooks/use-flow-persistence";

type SaveFlowState = (state: Parameters<typeof persistFlowState>[0]) => void;

/**
 * Filets anti-perte de /creer quand la page est rechargée (ou fermée) en pleine
 * génération. Sorti de CreerUnifie.tsx le 15/10/2026.
 *
 * 1. Texte déjà reçu (post Instagram, Pinterest : le texte arrive au fil de
 *    l'eau) : gardé dans `pendingStream`, au plus toutes les 1,5 s ET à la fin
 *    — avant, la dernière seconde et demie n'était jamais sauvée, et un reload
 *    pendant la relecture (« Derniers ajustements… ») rendait un texte amputé.
 * 2. Génération en cours : `generationInFlight` posé au départ, retiré à la fin
 *    (résultat ou erreur). LinkedIn, newsletter et carrousel n'envoient RIEN
 *    avant la fin : sans cette marque, un rechargement renvoyait à l'étape 2
 *    sans un mot (bug du 14/10, compte gratuit neuf). Encore là au rechargement
 *    = création interrompue : l'étape résultat le dit et propose de relancer.
 * 3. Résultat en place : texte partiel purgé (il ne sert qu'à une vraie coupure).
 *
 * Renvoie vrai tant que le message « création interrompue » doit s'afficher.
 */
export function useGenerationReloadGuard({
  restoredInterrupted, step, result, busy, streaming, streamingContent, selectedFormat, conflictPending, saveFlowState,
}: {
  restoredInterrupted: boolean;
  step: string;
  result: unknown;
  busy: boolean;
  streaming: boolean;
  streamingContent: string;
  selectedFormat: string | null;
  conflictPending: boolean;
  saveFlowState: SaveFlowState;
}): boolean {
  const lastStreamSaveRef = useRef(0);
  useEffect(() => {
    if (!streaming || !streamingContent) return;
    const save = () => {
      const now = Date.now();
      lastStreamSaveRef.current = now;
      saveFlowState({ step: "result", pendingStream: { text: streamingContent, format: selectedFormat || "post", ts: now } });
    };
    const wait = 1500 - (Date.now() - lastStreamSaveRef.current);
    if (wait <= 0) { save(); return; }
    const timer = setTimeout(save, wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, streamingContent, selectedFormat]);

  const busyRef = useRef(false);
  useEffect(() => {
    if (conflictPending) return;
    if (busy && step === "result") {
      if (busyRef.current) return;
      busyRef.current = true;
      saveFlowState({ generationInFlight: { format: selectedFormat || "post", ts: Date.now() } });
    } else if (busyRef.current && !busy) {
      busyRef.current = false;
      saveFlowState({ generationInFlight: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, step, conflictPending, selectedFormat]);

  // Le message s'efface dès qu'une génération repart, qu'un résultat est là ou
  // que l'étape change (la marque persistée aussi).
  const [interrupted, setInterrupted] = useState(restoredInterrupted);
  useEffect(() => {
    if (!interrupted || !(busy || result || step !== "result")) return;
    setInterrupted(false);
    if (!busy) saveFlowState({ generationInFlight: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupted, busy, result, step]);

  useEffect(() => {
    if (result) saveFlowState({ pendingStream: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return interrupted;
}
