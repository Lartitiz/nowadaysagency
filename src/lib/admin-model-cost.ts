// Grille de coût API par modèle pour l'onglet Stats de l'admin (sortie de
// AdminStatsTab.tsx le 26/10/2026, cliquet gros fichiers). Source de vérité du
// coût HEBDO = supabase/functions/cron-health/tarifs.ts ; ici une borne haute mensuelle.

/**
 * Coût estimé en €/token, indexé sur les tarifs de SORTIE par modèle.
 * `tokens_used` = input + output ; appliquer le tarif de sortie au total
 * surestime un peu (l'input est moins cher) → borne HAUTE volontaire, idéale
 * pour caler un plafond Premium prudent. Bien plus fiable que l'ancien taux
 * plat de 3 $/M qui ignorait l'écart Opus (~75 $/M) vs Haiku (~5 $/M).
 */
export const MODEL_COST_PER_TOKEN: { match: RegExp; rate: number }[] = [
  { match: /^gpt-6-astra(?:$|-)/i, rate: 0.00005 }, // $50/M output; conservative total-token estimate
  { match: /^claude-opus-5-5(?:$|-)/i, rate: 0.00002 }, // $20/M output (avant Opus 5, que la regex suivante couvrirait)
  { match: /^claude-opus-5(?:$|-)/i, rate: 0.000025 }, // $25/M output (before generic legacy Opus)
  { match: /opus/i, rate: 0.00007 },          // ~75 $/M
  { match: /sonnet/i, rate: 0.000014 },       // ~15 $/M
  { match: /^claude-haiku-5-5(?:$|-)/i, rate: 0.0000005 }, // $0.50/M output (tier Haiku depuis le 26/10/2026)
  { match: /haiku/i, rate: 0.000005 },        // ~5 $/M (Haiku 4.5)
  { match: /gemini.*flash/i, rate: 0.0000004 }, // gateway Lovable, scoring/suggestions (~0,3 $/M)
];
export const DEFAULT_COST_PER_TOKEN = 0.000014; // modèle inconnu / gateway → tarif Sonnet
