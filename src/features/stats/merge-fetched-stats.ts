// Fusion des chiffres récupérés automatiquement (Instagram) avec le relevé du mois.
// Décision produit (16/10/2026) : la saisie à la main prime. Un champ déjà rempli
// (ni null ni undefined, 0 compris) n'est jamais remplacé ; seuls les champs vides
// sont complétés. Fonctions pures, testées dans src/test/merge-fetched-stats.test.ts.

type Row = Record<string, unknown> | null | undefined;

const isEmpty = (v: unknown) => v === null || v === undefined;

/** Garde du `fetched` seulement les champs vides de `existing`. */
export function fillEmptyFields(existing: Row, fetched: Record<string, number>) {
  const patch: Record<string, number> = {};
  const kept: string[] = [];
  for (const [field, value] of Object.entries(fetched)) {
    if (isEmpty(existing?.[field])) patch[field] = value;
    else kept.push(field);
  }
  return { patch, kept };
}

// Colonne de monthly_stats, clé renvoyée par instagram-insights-fetch, libellé du toast.
const INSTAGRAM_FIELDS: [string, string, string][] = [
  ["followers", "followers", "abonnés"],
  ["reach", "reach30d", "portée (28 j)"],
  ["views", "views30d", "vues"],
  ["interactions", "totalInteractions30d", "interactions"],
  ["accounts_engaged", "accountsEngaged30d", "comptes engagés"],
  ["profile_visits", "profileViews30d", "visites du profil"],
  ["followers_gained", "followerGrowth30d", "abonnés gagnés"],
  ["posts_count", "postsMonthCount", "posts publiés"],
];
const labelOf = (column: string) => INSTAGRAM_FIELDS.find(([c]) => c === column)![2];

/**
 * Patch des colonnes du mois à partir des métriques Instagram.
 * `filled` : libellés des champs complétés ; `kept` : libellés des champs
 * déjà remplis (à la main ou avant) que la récupération n'a pas touchés.
 */
export function instagramMonthPatch(m: Record<string, unknown> | null | undefined, existing: Row) {
  const fetched: Record<string, number> = {};
  for (const [column, key] of INSTAGRAM_FIELDS) {
    const v = m?.[key];
    if (typeof v !== "number") continue;
    if (column === "followers_gained" && v < 0) continue;
    fetched[column] = v;
  }
  const { patch, kept } = fillEmptyFields(existing, fetched);
  // Record<string, unknown> : la page y ajoute ensuite `custom_data`.
  return { patch: patch as Record<string, unknown>, filled: Object.keys(patch).map(labelOf), kept: kept.map(labelOf) };
}
