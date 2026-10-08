// Contrôle du fil des carrousels (08/10/2026) — compteur hebdo, testable.
//
// Pourquoi : quand le juge du fil trouve un défaut, une réparation est tentée
// (locale depuis #1392, sinon complète) puis relue par un 2e juge, qui ne la
// garde que s'il la trouve meilleure. Mesure du 08/10 : réparation 16 s +
// relecture 44 s, puis refusée → une minute d'attente pour le même texte.
// Laetitia tranchera sur ces chiffres : combien de réparations sont GARDÉES ?
// Source : content_quality_events.content_preview.fil (cf. threadOutcome).

export interface FilStats {
  /** Carrousels dont le contrôle du fil est enregistré. */
  carrousels: number;
  /** Contrôle qui n'a pas abouti (juge coupé, réponse invalide…). */
  controle_non_abouti: number;
  /** Verdict « à réparer » du 1er juge. */
  a_reparer: number;
  /** Réparations lancées, gardées par le 2e juge, et détail locale / complète. */
  reparations: { tentees: number; gardees: number; locales: number; locales_gardees: number; completes: number; completes_gardees: number };
  /** Réparations voulues mais sautées : pas le temps de les finir. */
  sautees_faute_de_temps: number;
}

export function filStats(
  events: { created_at: string | null; content_preview?: any }[],
  inWindow: (iso: string | null) => boolean,
): FilStats {
  const s: FilStats = {
    carrousels: 0, controle_non_abouti: 0, a_reparer: 0,
    reparations: { tentees: 0, gardees: 0, locales: 0, locales_gardees: 0, completes: 0, completes_gardees: 0 },
    sautees_faute_de_temps: 0,
  };
  for (const e of events) {
    if (!inWindow(e.created_at)) continue;
    const fil = e.content_preview?.fil;
    if (!fil || typeof fil !== "object") continue;
    s.carrousels++;
    if (fil.status !== "completed") s.controle_non_abouti++;
    if (fil.verdict === "needs_repair") s.a_reparer++;
    if (fil.sautee === "time-budget") s.sautees_faute_de_temps++;
    const r = fil.reparation;
    if (r && typeof r === "object") {
      s.reparations.tentees++;
      if (r.acceptee) s.reparations.gardees++;
      if (r.scope === "local") { s.reparations.locales++; if (r.acceptee) s.reparations.locales_gardees++; }
      else { s.reparations.completes++; if (r.acceptee) s.reparations.completes_gardees++; }
    }
  }
  return s;
}
