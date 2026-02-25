import { useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";

type AiContext = "audit" | "generation" | "branding" | "default";

interface AiLoadingIndicatorProps {
  context?: AiContext;
  isLoading: boolean;
  onComplete?: () => void;
}

const MESSAGES: Record<AiContext, string[]> = {
  audit: [
    "Analyse en cours…",
    "L'IA parcourt ton profil…",
    "Croisement des données…",
    "Rédaction du diagnostic…",
    "Dernières vérifications…",
  ],
  generation: [
    "L'IA rédige ton contenu…",
    "Personnalisation avec ta voix…",
    "Ajustement du ton…",
    "Vérification éthique…",
    "Peaufinage final…",
  ],
  branding: [
    "Analyse de ta marque…",
    "Comparaison déclaré vs réel…",
    "Identification des écarts…",
    "Rédaction des recommandations…",
    "C'est bientôt prêt…",
  ],
  default: [
    "Analyse en cours…",
    "L'IA travaille…",
    "Ça arrive…",
    "Encore quelques secondes…",
    "Presque fini…",
  ],
};

function getSimulatedProgress(elapsedMs: number): number {
  const s = elapsedMs / 1000;
  if (s <= 5) return (s / 5) * 30;
  if (s <= 20) return 30 + ((s - 5) / 15) * 30;
  if (s <= 50) return 60 + ((s - 20) / 30) * 25;
  // After 50s, creep very slowly toward 95
  return Math.min(85 + (s - 50) * 0.1, 95);
}

export default function AiLoadingIndicator({
  context = "default",
  isLoading,
  onComplete,
}: AiLoadingIndicatorProps) {
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const startRef = useRef(Date.now());
  const prevLoadingRef = useRef(isLoading);

  // Reset on new loading cycle
  useEffect(() => {
    if (isLoading && !prevLoadingRef.current) {
      startRef.current = Date.now();
      setProgress(0);
      setElapsed(0);
      setMsgIndex(0);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  // Animate progress + timer
  useEffect(() => {
    if (!isLoading) {
      if (progress > 0 && progress < 100) {
        setProgress(100);
        onComplete?.();
      }
      return;
    }

    const interval = setInterval(() => {
      const ms = Date.now() - startRef.current;
      setElapsed(Math.floor(ms / 1000));
      setProgress(getSimulatedProgress(ms));
    }, 200);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Rotate messages every ~8s
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES[context].length);
    }, 8000);
    return () => clearInterval(interval);
  }, [isLoading, context]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timerStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  if (!isLoading && progress === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      {/* Message */}
      <p className="text-center text-sm font-medium text-foreground animate-fade-in">
        {MESSAGES[context][msgIndex]}
      </p>

      {/* Progress bar */}
      <Progress value={progress} className="h-2.5" />

      {/* Timer + hint */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">⏱️ {timerStr}</span>
        <span className="text-[11px] text-muted-foreground">{Math.round(progress)}%</span>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Les analyses complètes prennent généralement 30 à 90 secondes.
      </p>
    </div>
  );
}
