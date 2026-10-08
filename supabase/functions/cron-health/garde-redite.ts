// Garde anti-redite d'accroche (#915) — compteur hebdo, extrait de `index.ts`
// pour être TESTABLE.
//
// Pourquoi : le quality_check et redac_score ne voient que le contenu APRÈS
// correction. Quand la garde a réécrit une accroche qui redisait une accroche
// précédente, hook_echoes y est vide. La seule preuve était la ligne de log
// « échos d'accroche N→M », illisible depuis la routine du lundi : la question
// « la garde mord-elle sur du vrai contenu ? » est restée ouverte six semaines.
// Depuis, chaque génération range dans content_quality_events.content_preview
// `hook_echoes_before` (nombre d'échos AVANT correction), absent quand la garde
// n'était pas armée (aucune accroche précédente sur ce sujet).

export interface GardeRediteStats {
  /** Contenus enregistrés dans la fenêtre. */
  contenus: number;
  /** Contenus où la garde était armée (accroches précédentes sur le même sujet). */
  garde_armee: number;
  /** Contenus où l'accroche redisait une accroche précédente AVANT correction. */
  a_mordu: number;
  /** Total des échos détectés avant correction. */
  echos_avant: number;
  /** a_mordu par format (carousel_express_full, linkedin, stories…). */
  par_format: Record<string, number>;
}

export function gardeRediteStats(
  events: { created_at: string | null; format?: string | null; content_preview?: any }[],
  inWindow: (iso: string | null) => boolean,
): GardeRediteStats {
  const stats: GardeRediteStats = { contenus: 0, garde_armee: 0, a_mordu: 0, echos_avant: 0, par_format: {} };
  for (const e of events) {
    if (!inWindow(e.created_at)) continue;
    stats.contenus++;
    const n = e.content_preview?.hook_echoes_before;
    if (typeof n !== "number" || !Number.isFinite(n)) continue;
    stats.garde_armee++;
    if (n <= 0) continue;
    stats.a_mordu++;
    stats.echos_avant += n;
    const f = e.format || "inconnu";
    stats.par_format[f] = (stats.par_format[f] || 0) + 1;
  }
  return stats;
}

/**
 * L'extrait a-t-il du texte à juger ? Une ligne peut ne porter que
 * `hook_echoes_before` (contenu illisible) : elle ne doit ni entrer dans
 * l'échantillon du juge ni le faire basculer sur la source « events ».
 */
export function hasPreviewText(p: any): boolean {
  return !!p && (!!p.hook || !!p.sujet || !!p.caption || (Array.isArray(p.apercu_slides) && p.apercu_slides.length > 0));
}
