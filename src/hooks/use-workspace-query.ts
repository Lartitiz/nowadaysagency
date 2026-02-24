import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns the active workspace ID, falling back to the user ID
 * for backward compatibility when no workspace is selected.
 */
export function useWorkspaceId(): string {
  try {
    const { activeWorkspace } = useWorkspace();
    if (activeWorkspace?.id) return activeWorkspace.id;
  } catch {
    // WorkspaceProvider not mounted yet — fallback
  }
  const { user } = useAuth();
  return user?.id ?? "";
}

/**
 * Returns a filter object to scope queries by workspace or user.
 * Use with supabase `.eq(filter.column, filter.value)`.
 */
export function useWorkspaceFilter(): { column: string; value: string } {
  try {
    const { activeWorkspace } = useWorkspace();
    if (activeWorkspace?.id) {
      return { column: "workspace_id", value: activeWorkspace.id };
    }
  } catch {
    // fallback
  }
  const { user } = useAuth();
  return { column: "user_id", value: user?.id ?? "" };
}
