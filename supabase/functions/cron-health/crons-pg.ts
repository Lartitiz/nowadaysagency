// Automates de la base (pg_cron) : la date de leur dernier passage.
// Avant le 14/10/2026, la mort du cron de publication programmée ne se voyait
// qu'à travers « programmés en retard » — toujours 0 quand personne ne
// programme rien. Ici on lit le dernier passage réel de chaque automate
// (fonction SQL public.cron_jobs_health, service_role seulement).

export interface CronJobRow {
  jobname: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_status: string | null;
  last_message: string | null;
}

export interface CronJobVerdict {
  nom: string;
  dernier_passage: string | null;
  statut: string | null;
  en_panne: boolean;
  raison: string | null;
}

// Intervalle attendu (minutes) d'après l'expression cron : « *​/N * * * * » → N,
// « M H * * * » → 1 jour, « M H J * * » → 31 jours. Inconnu → null (pas jugé).
export function intervalleMinutes(schedule: string): number | null {
  const p = schedule.trim().split(/\s+/);
  if (p.length !== 5) return null;
  const [min, h, jour, mois, sem] = p;
  const tous = /^\*\/(\d+)$/.exec(min);
  if (tous && h === "*" && jour === "*" && mois === "*" && sem === "*") return Number(tous[1]);
  if (/^\d+$/.test(min) && /^\d+$/.test(h) && jour === "*" && mois === "*" && sem === "*") return 24 * 60;
  if (/^\d+$/.test(min) && /^\d+$/.test(h) && /^\d+$/.test(jour) && mois === "*" && sem === "*") return 31 * 24 * 60;
  return null;
}

// En panne = inactif, dernier passage en échec, jamais passé, ou dernier
// passage plus vieux que 2 intervalles + 10 min de marge.
export function jugerCrons(rows: CronJobRow[], now: number): CronJobVerdict[] {
  return rows.map((r) => {
    const iv = intervalleMinutes(r.schedule);
    const age = r.last_start ? (now - new Date(r.last_start).getTime()) / 60_000 : null;
    let raison: string | null = null;
    if (!r.active) raison = "désactivé";
    else if (r.last_status === "failed") raison = `dernier passage en échec${r.last_message ? ` : ${r.last_message}` : ""}`;
    else if (age === null) raison = "jamais passé";
    else if (iv !== null && age > 2 * iv + 10) raison = `pas passé depuis ${Math.round(age)} min (attendu toutes les ${iv} min)`;
    return { nom: r.jobname, dernier_passage: r.last_start, statut: r.last_status, en_panne: raison !== null, raison };
  });
}
