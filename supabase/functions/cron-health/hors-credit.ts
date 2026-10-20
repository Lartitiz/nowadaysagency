// cron-health : appels IA comptés SANS crédit (table ai_usage_hors_credit, audit de
// coût API du 20/10/2026). Compte de recette (visite du matin, tests réels),
// diagnostic d'inscription, étapes gratuites de création, passerelle Lovable,
// passes internes. Avant, ces appels étaient payés sans aucune trace en base.
//
// Daily : `compte_test_24h` (coût de la visite du matin, sonde 🧪).
// Weekly : `hors_credit_7j` par source + `cout_estime_total_7j`, le chiffre à
// comparer chaque lundi au coût de la console Anthropic (sonde 💳 : alerte si la
// console dépasse 3 fois ce total).
import { summarize } from "./couts.ts";
import { inWindow } from "./fenetres.ts";
import { DAY, fetchAllRows } from "./lecture.ts";

const COLONNES = "user_id, created_at, source, action_type, model_used, tokens_used";

export async function lireHorsCredit(supabase: any, depuis: number): Promise<any[] | { erreur: string }> {
  try {
    return await fetchAllRows(supabase, "ai_usage_hors_credit", COLONNES, (q) => q.gte("created_at", new Date(depuis).toISOString()));
  } catch (e) {
    return { erreur: String((e as any)?.message || e).slice(0, 90) };
  }
}

/** Résumé par source sur une fenêtre : appels, tokens, coût estimé (mêmes tarifs qu'ai_usage). */
export function horsCreditParSource(rows: any[], from: number, to: number) {
  const fenetre = rows.filter((r) => inWindow(r.created_at, from, to));
  const sources = [...new Set(fenetre.map((r) => r.source))].sort();
  const par_source = sources.map((source) => {
    const s = summarize(fenetre.filter((r) => r.source === source));
    return { source, appels: s.appels, tokens: s.tokens, cout_estime_eur: s.cout_total_estime_eur, modeles_non_tarifes: s.modeles_non_tarifes };
  });
  const total = Math.round(par_source.reduce((t, s) => t + (s.cout_estime_eur || 0), 0) * 100) / 100;
  return { par_source, cout_estime_eur: total };
}

/** Bulletin du matin : générations du compte de recette sur 24 h (la visite). */
export function compteTest24h(rows: any[] | { erreur: string }, now: number) {
  if (!Array.isArray(rows)) return rows;
  const lignes = rows.filter((r) => r.source === "compte_test" && inWindow(r.created_at, now - DAY, now + 1));
  const s = summarize(lignes);
  const actions: Record<string, number> = {};
  for (const r of lignes) actions[r.action_type || "inconnu"] = (actions[r.action_type || "inconnu"] || 0) + 1;
  return { generations: lignes.length, tokens: s.tokens, cout_estime_eur: s.cout_total_estime_eur, actions };
}
