import { useEffect, useState } from "react";

/**
 * Durée honnête annoncée pendant la génération (chantier C, 15/10/2026).
 *
 * Avant : un carrousel prenait 2 à 4 minutes, mais seul « une petite minute »
 * (le plan des slides) était annoncé. Chiffres mesurés : carrousel complet
 * 2 min 20 à 3 min 30 (content_quality_events, perf-carousel : texte ~180 s,
 * visuels ~210 s ; carrousel photo ~3 min), stories ~50 s, reel ~1 min 20,
 * textes en flux en moins d'une minute. On annonce le TOTAL et le temps écoulé.
 */
function totalDurationLabel(format: string, opts: { afterPlan?: boolean } = {}): string {
  if (format === "carousel") return opts.afterPlan ? "encore 2 à 3 minutes" : "3 à 4 minutes en tout";
  if (format === "reel") return "1 à 2 minutes";
  return "environ 1 minute";
}

const elapsedLabel = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`);

export default function GenerationTimeHint({
  format,
  startedAt,
  afterPlan,
  qualityMax,
}: {
  format: string;
  startedAt: number;
  afterPlan?: boolean;
  qualityMax?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
  return (
    <p data-testid="generation-time-hint" className="text-xs text-center text-muted-foreground">
      Compte {totalDurationLabel(format, { afterPlan })}
      {qualityMax ? ", un peu plus avec la rédaction la plus soignée" : ""}. Déjà {elapsedLabel(elapsed)}. Tu peux rester sur cette page.
    </p>
  );
}
