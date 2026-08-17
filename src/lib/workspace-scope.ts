/**
 * Filtre workspace_id → user_id (logique pure, testable sans React).
 * Utilisé par useWorkspaceFilter (contexte React) et par les callers qui
 * calculent leur propre workspace effectif (ex: override de params dans un
 * useCallback, où useWorkspaceFilter ne peut pas être appelé — ce n'est pas
 * le rendu du composant qui décide, et les hooks ne s'appellent pas dans une
 * closure conditionnelle).
 */
export function workspaceScopeFilter(
  workspaceId: string | null | undefined,
  userId: string,
): { column: "workspace_id" | "user_id"; value: string } {
  return workspaceId
    ? { column: "workspace_id", value: workspaceId }
    : { column: "user_id", value: userId };
}
