import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Returns true if the current user can edit content in the active workspace.
 * Owners, managers, and editors can edit. Viewers cannot.
 * Falls back to true if WorkspaceProvider is not mounted.
 */
export function useCanEdit(): boolean {
  try {
    const { activeRole } = useWorkspace();
    return ["owner", "manager", "editor"].includes(activeRole);
  } catch {
    return true; // No workspace context = own space = can edit
  }
}

/**
 * Returns true if the current user is the workspace owner.
 */
export function useIsOwner(): boolean {
  try {
    const { activeRole } = useWorkspace();
    return activeRole === "owner";
  } catch {
    return true;
  }
}
