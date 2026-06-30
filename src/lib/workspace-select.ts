/**
 * Choix de l'espace actif au chargement (logique pure, testable sans React).
 * Priorité :
 *   1. l'espace explicitement persisté (`savedId`) s'il est toujours accessible ;
 *   2. À DÉFAUT, l'espace dont on est `owner` (le sien) — JAMAIS `loaded[0]` qui
 *      est arbitraire (un·e admin/binôme est membre d'espaces clients, et sans
 *      cette règle atterrissait par défaut chez un·e client·e, avec son profil) ;
 *   3. en dernier recours, le premier de la liste.
 */
export function pickActiveWorkspace<T extends { id: string; _role: string }>(
  loaded: T[],
  savedId: string | null,
): T | null {
  return (
    loaded.find((w) => w.id === savedId) ||
    loaded.find((w) => w._role === "owner") ||
    loaded[0] ||
    null
  );
}
