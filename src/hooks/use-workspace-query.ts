import { useEffect } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

/**
 * Returns the active workspace ID, falling back to the user ID
 * for backward compatibility when no workspace is selected.
 */
export function useWorkspaceId(): string {
  const { user } = useAuth();
  let activeWorkspaceId: string | undefined;
  try {
    activeWorkspaceId = useWorkspace().activeWorkspace?.id;
  } catch {
    // WorkspaceProvider not mounted yet — fallback
  }
  return activeWorkspaceId ?? user?.id ?? "";
}

/**
 * Returns a filter object to scope queries by workspace or user.
 * Use with supabase `.eq(filter.column, filter.value)`.
 */
export function useWorkspaceFilter(): { column: string; value: string } {
  const { user } = useAuth();
  let activeWorkspaceId: string | undefined;
  try {
    activeWorkspaceId = useWorkspace().activeWorkspace?.id;
  } catch {
    // fallback
  }
  if (activeWorkspaceId) {
    return { column: "workspace_id", value: activeWorkspaceId };
  }
  return { column: "user_id", value: user?.id ?? "" };
}


/**
 * True when the active workspace is the user's own (or none). Used to safely
 * "adopt" legacy rows (workspace_id null, created before workspaces) into the
 * active workspace — never when managing someone else's space.
 */
export function useIsOwnSpace(): boolean {
  let active: { id: string } | null = null;
  let own: { id: string } | null = null;
  try {
    const ws = useWorkspace();
    active = ws.activeWorkspace;
    own = ws.ownWorkspace;
  } catch {
    // fallback
  }
  return !active || active.id === own?.id;
}

/**
 * True once the WorkspaceContext has resolved (or when no provider is mounted).
 * Gate the data effects on this: before resolution, useWorkspaceFilter renvoie
 * le filtre user_id legacy → requêtes fantômes et flashs d'UI erronés
 * (« Connecte ton compte » alors que la connexion existe, scopée workspace).
 */
export function useWorkspaceReady(): boolean {
  let loading = false;
  try {
    loading = useWorkspace().loading;
  } catch {
    // provider absent : rien à attendre
  }
  return !loading;
}

/**
 * Returns the user_id of the workspace owner.
 * When viewing a client workspace (role = manager), returns the client's user_id.
 * When on own workspace (role = owner), returns auth user's id.
 * Useful for tables like "profiles" that don't have workspace_id.
 *
 * If the owner lookup fails while managing a client workspace, this must NOT
 * fall back to the manager's own id — that would silently read/write the
 * manager's account instead of the client's (data leak between comptes).
 * It returns "" instead, which fails safe: reads come back empty and writes
 * are rejected (user_id columns are uuid, "" isn't a valid uuid).
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

  const { data: ownerUserId, isError } = useQuery({
    queryKey: ["workspace-owner", activeWorkspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", activeWorkspace!.id)
        .eq("role", "owner")
        .maybeSingle();
      if (error) throw error;
      return data?.user_id as string | null;
    },
    enabled: isManager,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const ownerLookupFailed = isManager && isError;

  useEffect(() => {
    if (ownerLookupFailed) {
      toast.error("Impossible de charger l'espace de la personne accompagnée", {
        id: "profile-owner-lookup-error",
        description: "Réessaie dans un instant avant d'enregistrer quoi que ce soit ici.",
      });
    }
  }, [ownerLookupFailed]);

  if (ownerLookupFailed) return "";
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

/**
 * Returns a dual filter: tries workspace_id first, then falls back to user_id.
 * Use for tables that may have old rows without workspace_id.
 */
export function useWorkspaceFilterWithFallback(): {
  column: string;
  value: string;
  fallbackColumn: string;
  fallbackValue: string;
} {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  try {
    const { activeWorkspace } = useWorkspace();
    if (activeWorkspace?.id) {
      return {
        column: "workspace_id",
        value: activeWorkspace.id,
        fallbackColumn: "user_id",
        fallbackValue: userId,
      };
    }
  } catch {
    // fallback
  }
  return {
    column: "user_id",
    value: userId,
    fallbackColumn: "user_id",
    fallbackValue: userId,
  };
}
