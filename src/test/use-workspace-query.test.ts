import { describe, it, expect } from "vitest";

/**
 * Pure logic tests for workspace filter behavior.
 * We test the logic without React context by replicating the filter function.
 */

function getWorkspaceFilter(
  activeWorkspaceId: string | null,
  userId: string
): { column: string; value: string } {
  if (activeWorkspaceId && activeWorkspaceId.length > 0) {
    return { column: "workspace_id", value: activeWorkspaceId };
  }
  return { column: "user_id", value: userId };
}

function getWorkspaceFilterWithFallback(
  activeWorkspaceId: string | null,
  userId: string
): { column: string; value: string; fallbackColumn: string; fallbackValue: string } {
  if (activeWorkspaceId) {
    return {
      column: "workspace_id",
      value: activeWorkspaceId,
      fallbackColumn: "user_id",
      fallbackValue: userId,
    };
  }
  return {
    column: "user_id",
    value: userId,
    fallbackColumn: "user_id",
    fallbackValue: userId,
  };
}

describe("useWorkspaceFilter logic", () => {
  it("returns workspace_id filter when workspace is active", () => {
    const filter = getWorkspaceFilter("ws-123", "user-456");
    expect(filter.column).toBe("workspace_id");
    expect(filter.value).toBe("ws-123");
  });

  it("falls back to user_id when no workspace", () => {
    const filter = getWorkspaceFilter(null, "user-456");
    expect(filter.column).toBe("user_id");
    expect(filter.value).toBe("user-456");
  });

  it("falls back to user_id when workspace id is empty string", () => {
    const filter = getWorkspaceFilter("", "user-456");
    expect(filter.column).toBe("user_id");
    expect(filter.value).toBe("user-456");
  });
});

/**
 * Replicates the fallback decision in useProfileUserId (src/hooks/use-workspace-query.ts).
 * Regression coverage for the "succès menteur" bug: when the workspace-owner
 * lookup fails while managing a client's workspace, this must NOT fall back
 * to the manager's own id — that would silently read/write the manager's
 * account instead of the client's.
 */
function getProfileUserId(
  isManager: boolean,
  isError: boolean,
  ownerUserId: string | null,
  authUserId: string
): string {
  const ownerLookupFailed = isManager && isError;
  if (ownerLookupFailed) return "";
  if (isManager && ownerUserId) return ownerUserId;
  return authUserId;
}

describe("useProfileUserId fallback logic", () => {
  it("returns the auth user id when not managing a client workspace", () => {
    expect(getProfileUserId(false, false, null, "manager-1")).toBe("manager-1");
  });

  it("returns the client owner id when the lookup succeeds", () => {
    expect(getProfileUserId(true, false, "client-1", "manager-1")).toBe("client-1");
  });

  it("never falls back to the manager's own id when the owner lookup errors", () => {
    expect(getProfileUserId(true, true, null, "manager-1")).toBe("");
  });

  it("still falls back to auth user id while the owner lookup is pending (no error yet)", () => {
    expect(getProfileUserId(true, false, null, "manager-1")).toBe("manager-1");
  });
});

describe("useWorkspaceFilterWithFallback logic", () => {
  it("returns workspace_id with user_id fallback when workspace active", () => {
    const filter = getWorkspaceFilterWithFallback("ws-123", "user-456");
    expect(filter.column).toBe("workspace_id");
    expect(filter.value).toBe("ws-123");
    expect(filter.fallbackColumn).toBe("user_id");
    expect(filter.fallbackValue).toBe("user-456");
  });

  it("returns user_id for both when no workspace", () => {
    const filter = getWorkspaceFilterWithFallback(null, "user-456");
    expect(filter.column).toBe("user_id");
    expect(filter.value).toBe("user-456");
    expect(filter.fallbackColumn).toBe("user_id");
    expect(filter.fallbackValue).toBe("user-456");
  });
});
