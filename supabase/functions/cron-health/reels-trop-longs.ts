// Reels trop longs pour le montage (12/11/2026) — bilan hebdo, testable.
//
// Le montage automatique (JSON2Video) s'arrête à 60 s ; les scripts sont
// limités à 55 s depuis la PR #1854 (plafond de mots + coupe dédiée). La durée
// de chaque script est gardée dans content_quality_events.content_preview.durees
// (creative-flow/telemetry.ts) : on compte ceux qui dépassent encore.
// Seuil : au moins 3 reels au-delà de 55 s sur la semaine → alerte.

export const REEL_MAX_SECONDES = 55;
export const REELS_TROP_LONGS_MIN_ALERTE = 3;

export interface ReelsTropLongs {
  /** Reels dont la durée est mesurée. */
  mesures: number;
  au_dela_55s: number;
  max_s: number | null;
  alerte: string | null;
}

export function reelsTropLongs(
  events: { format?: string | null; created_at: string | null; content_preview?: any }[],
  inWindow: (iso: string | null) => boolean,
): ReelsTropLongs {
  const secondes = events
    .filter((e) => e.format === "reel" && inWindow(e.created_at))
    .map((e) => e.content_preview?.durees?.reel_secondes)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s) && s > 0);
  const trop = secondes.filter((s) => s > REEL_MAX_SECONDES).length;
  return {
    mesures: secondes.length,
    au_dela_55s: trop,
    max_s: secondes.length ? Math.max(...secondes) : null,
    alerte: trop >= REELS_TROP_LONGS_MIN_ALERTE
      ? `${trop} reel(s) au-delà de ${REEL_MAX_SECONDES} s : la coupe ne suffit plus (journaux : reel_trop_long)`
      : null,
  };
}
