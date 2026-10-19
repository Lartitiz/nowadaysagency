// cron-health, scope weekly : « Refaire cette slide » (chantier AA, 18/10/2026).
// Ligne du bilan du lundi demandée par Laetitia le 19/10/2026 : « 🔁 Slides
// refaites : N (N clientes) », lue dans ai_usage (action `slide_redo`, une ligne
// par slide refaite et payée). Pas de seuil : elle sert à appliquer la règle
// d'usage dans 60 jours (moins de 3 clientes en 60 jours = on n'investit plus).
// Les comptes internes sont comptés à part, jamais dans les clientes.
import { inWindow } from "./fenetres.ts";

const count = (rows: any[], from: number, to: number) => {
  const inWeek = rows.filter((r) => r?.action_type === "slide_redo" && inWindow(r.created_at, from, to));
  return { n: inWeek.length, personnes: new Set(inWeek.map((r) => r.user_id)).size };
};

export function slidesRefaites({ ai, aiRows, internalIds, curFrom, curTo, prevFrom, prevTo }: {
  /** Lignes ai_usage des clientes seulement. */
  ai: any[];
  /** Toutes les lignes ai_usage (pour les comptes internes). */
  aiRows: any[];
  internalIds: Set<string>;
  curFrom: number;
  curTo: number;
  prevFrom: number;
  prevTo: number;
}) {
  const cur = count(ai, curFrom, curTo);
  const internes = count(aiRows.filter((r) => internalIds.has(r.user_id)), curFrom, curTo);
  return { n: cur.n, clientes: cur.personnes, n_s1: count(ai, prevFrom, prevTo).n, internes: internes.n };
}
