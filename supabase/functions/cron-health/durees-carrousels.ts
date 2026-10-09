// Durées des carrousels (09/10/2026) — bilan hebdo, testable.
//
// Pourquoi : le budget du carrousel photo/mixte (rédaction, juge du fil,
// réparation, association des photos, borne 270 s) se règle sur des mesures.
// Les journaux edge s'effacent en quelques heures ; les durées sont désormais
// gardées dans content_quality_events.content_preview.durees (carouselDurations).

const ETAPES = ["total_ms", "prep_ms", "write_ms", "thread_judge_ms", "thread_repair_ms", "thread_recheck_ms", "match_ms"] as const;

export interface DureeEtape { n: number; mediane: number; p90: number; max: number }
export interface DureesParParcours {
  generations: number;
  /** Médiane / 90e centile / max en secondes, par étape mesurée. */
  etapes: Partial<Record<(typeof ETAPES)[number], DureeEtape>>;
  /** Réparations du fil sautées faute de temps. */
  reparations_sautees: number;
  /** Association des photos qui n'a pas fini (« time-budget », échec technique). */
  association_non_aboutie: number;
  /** Slides posées en ambiance (photo sans vérification acceptée). */
  slides_en_ambiance: number;
  /** Générations au-delà de 270 s (borne de l'association) et de 330 s (schémas). */
  au_dela_270s: number;
  au_dela_330s: number;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
const sec = (ms: number) => Math.round(ms / 100) / 10;

export function dureesStats(
  events: { created_at: string | null; content_preview?: any }[],
  inWindow: (iso: string | null) => boolean,
): Record<string, DureesParParcours> {
  const groups = new Map<string, any[]>();
  for (const e of events) {
    if (!inWindow(e.created_at)) continue;
    const d = e.content_preview?.durees;
    if (!d || typeof d !== "object" || typeof d.label !== "string") continue;
    const list = groups.get(d.label) ?? [];
    list.push(d);
    groups.set(d.label, list);
  }
  const out: Record<string, DureesParParcours> = {};
  for (const [label, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const etapes: DureesParParcours["etapes"] = {};
    for (const k of ETAPES) {
      const v = list.map((d) => d[k]).filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
      if (v.length) etapes[k] = { n: v.length, mediane: sec(quantile(v, 0.5)), p90: sec(quantile(v, 0.9)), max: sec(v[v.length - 1]) };
    }
    const assoc = list.map((d) => d.association).filter((a) => a && typeof a === "object");
    out[label] = {
      generations: list.length,
      etapes,
      reparations_sautees: list.filter((d) => d.thread_repair_skipped).length,
      association_non_aboutie: assoc.filter((a) => a.status !== "completed").length,
      slides_en_ambiance: assoc.reduce((n, a) => n + (typeof a.ambiance === "number" ? a.ambiance : 0), 0),
      au_dela_270s: list.filter((d) => typeof d.total_ms === "number" && d.total_ms > 270_000).length,
      au_dela_330s: list.filter((d) => typeof d.total_ms === "number" && d.total_ms > 330_000).length,
    };
  }
  return out;
}
