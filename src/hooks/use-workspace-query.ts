import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Returns the user_id of the workspace owner.
 * When viewing a client workspace (role = manager), returns the client's user_id.
 * When on own workspace (role = owner), returns auth user's id.
 * Useful for tables like "profiles" that don't have workspace_id.
 */
export function useProfileUserId(): string {
  const { user } = useAuth();
  let activeWorkspace: { id: string } | null = null;
  let activeRole: string = "owner";

  try {
    const ws = useWorkspace();
    activeWorkspace = ws.activeWorkspace;
    activeRole = ws.activeRole;
  } catch {
    // fallback
  }

  const isManager = activeRole === "manager" && !!activeWorkspace?.id;

  const { data: ownerUserId } = useQuery({
    queryKey: ["workspace-owner", activeWorkspace?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", activeWorkspace!.id)
        .eq("role", "owner")
        .maybeSingle();
      return data?.user_id as string | null;
    },
    enabled: isManager,
    staleTime: 5 * 60 * 1000,
  });

  if (isManager && ownerUserId) return ownerUserId;
  return user?.id ?? "";
}

/**
 * Returns a filter for profile-scoped tables (no workspace_id column).
 * Uses the workspace owner's user_id when in manager mode.
 */
export function useProfileFilter(): { column: "user_id"; value: string } {
  const profileUserId = useProfileUserId();
  return { column: "user_id", value: profileUserId };
}
