import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { assertWorkspaceMembership } from "./workspace-guard.ts";

/** Resolve the resource owner, never silently substitute the connected manager. */
export async function generationOwner(sb: SupabaseClient, userId: string, workspaceId?: string): Promise<string> {
  const membership = await assertWorkspaceMembership(sb, userId, workspaceId);
  if (!membership.ok || !["legacy", "owner", "manager", "editor"].includes(membership.role)) {
    throw Object.assign(new Error("Tu n'as pas accès à la génération dans cet espace."), { status: 403 });
  }
  if (!workspaceId) return userId;
  const { data, error } = await sb.from("workspace_members").select("user_id")
    .eq("workspace_id", workspaceId).eq("role", "owner").single();
  if (error || !data?.user_id) {
    throw Object.assign(new Error("Impossible de retrouver le propriétaire de cet espace."), { status: 403 });
  }
  return data.user_id;
}
