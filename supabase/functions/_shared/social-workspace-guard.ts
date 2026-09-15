import { assertWorkspaceMembership, type WorkspaceGuardResult } from "./workspace-guard.ts";

// Publishing changes external state. Match the workspace's existing write roles;
// status, exports and revoking one's own authorization keep their separate rules.
export async function assertWorkspacePublication(
  sb: any,
  userId: string,
  workspaceId: string | null | undefined,
): Promise<WorkspaceGuardResult> {
  const membership = await assertWorkspaceMembership(sb, userId, workspaceId);
  if (!membership.ok) return membership;
  if (workspaceId && !["owner", "manager", "editor"].includes(membership.role)) {
    return { ok: false, status: 403 };
  }
  return membership;
}
