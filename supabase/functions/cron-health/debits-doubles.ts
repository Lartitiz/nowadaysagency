// cron-health, scope weekly : « 💳 Débits en double » (16/11/2026).
// Le 13/11/2026, une cliente a payé 2 carrousels du même format à 2 minutes
// d'écart pour un seul affiché : la 2e création avait été lancée pendant que la
// 1re tournait encore (fil d'étapes cliquable pendant l'attente, corrigé par
// #2010). Aucune routine ne le voyait : le bilan n'a vu, par ricochet, qu'une
// garde anti-redite non armée.
//
// Un carrousel met plus d'une minute et demie à s'écrire et son débit tombe à la
// fin. Deux débits du même format, pour la même personne, à moins de 4 minutes
// d'écart sont donc suspects ; ils sont comptés quand la 2e génération a démarré
// AVANT le débit de la 1re (durée lue dans content_quality_events), ou quand sa
// durée est inconnue. Deux créations enchaînées l'une après l'autre ne comptent pas.
// Attendu : 0. Les comptes internes sont comptés à part.
import { inWindow } from "./fenetres.ts";

/** Rédactions de carrousel : un débit = une génération longue (jamais une ligne par image). */
const ACTIONS = new Set(["carousel_express_full", "carousel_photo", "carousel_mix"]);
const ECART_MAX_MS = 4 * 60_000;
/** La ligne qualité s'écrit juste avant le débit (schémas, photos libres entre les deux). */
const LIGNE_AVANT_DEBIT_MS = 90_000;

const ms = (iso: string) => new Date(iso).getTime();

/** Durée (ms) de la génération débitée à `debit`, lue dans sa ligne qualité ; null si introuvable. */
function dureeDe(events: any[], userId: string, action: string, debit: number): number | null {
  let best: any = null;
  for (const e of events) {
    if (e?.user_id !== userId || e?.format !== action) continue;
    const t = ms(e.created_at);
    if (t > debit + 5_000 || t < debit - LIGNE_AVANT_DEBIT_MS) continue;
    if (!best || t > ms(best.created_at)) best = e;
  }
  const d = best?.content_preview?.durees?.total_ms;
  return typeof d === "number" && d > 0 ? d : null;
}

function paires(rows: any[], events: any[], from: number, to: number) {
  const parCle = new Map<string, any[]>();
  for (const r of rows) {
    if (!ACTIONS.has(r?.action_type) || !r?.user_id || !r?.created_at) continue;
    const k = `${r.user_id}|${r.action_type}`;
    if (!parCle.has(k)) parCle.set(k, []);
    parCle.get(k)!.push(r);
  }
  const trouvees: Array<{ user_id: string; action: string; ecart_s: number; quand: string }> = [];
  for (const lignes of parCle.values()) {
    lignes.sort((a, b) => ms(a.created_at) - ms(b.created_at));
    for (let i = 1; i < lignes.length; i++) {
      const d1 = ms(lignes[i - 1].created_at), d2 = ms(lignes[i].created_at);
      // La paire appartient à la semaine de son 2e débit.
      if (!inWindow(lignes[i].created_at, from, to) || d2 - d1 >= ECART_MAX_MS) continue;
      const duree = dureeDe(events, lignes[i].user_id, lignes[i].action_type, d2);
      // Enchaînées (la 2e a démarré après le débit de la 1re) : rien à signaler.
      if (duree !== null && d2 - duree >= d1) continue;
      trouvees.push({ user_id: lignes[i].user_id, action: lignes[i].action_type, ecart_s: Math.round((d2 - d1) / 1000), quand: lignes[i].created_at });
    }
  }
  return trouvees;
}

export function debitsDoubles({ ai, aiRows, cqAll, internalIds, curFrom, curTo, prevFrom, prevTo }: {
  /** Lignes ai_usage des clientes seulement. */
  ai: any[];
  /** Toutes les lignes ai_usage (pour les comptes internes). */
  aiRows: any[];
  /** Lignes content_quality_events, tous comptes (durée de chaque génération). */
  cqAll: any[];
  internalIds: Set<string>;
  curFrom: number;
  curTo: number;
  prevFrom: number;
  prevTo: number;
}) {
  const events = cqAll || [];
  const cur = paires(ai, events, curFrom, curTo);
  const internes = paires(aiRows.filter((r) => internalIds.has(r.user_id)), events, curFrom, curTo);
  return {
    n: cur.length,
    clientes: new Set(cur.map((p) => p.user_id)).size,
    n_s1: paires(ai, events, prevFrom, prevTo).length,
    internes: internes.length,
    // Jamais d'identité : format, écart et date suffisent pour retrouver la paire.
    exemples: cur.slice(0, 3).map(({ action, ecart_s, quand }) => ({ action, ecart_s, quand })),
  };
}
