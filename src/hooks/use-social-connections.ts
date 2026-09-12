import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId, useWorkspaceReady } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";

export type SocialPlatform = "instagram" | "linkedin" | "pinterest" | "canva" | "google" | "linkedin_analytics";

type ConnectionData = {
  connected: Record<string, boolean>;
  expiresAt: Record<string, string | null>;
  needsProperty: Record<string, boolean>;
};
const EMPTY: ConnectionData = { connected: {}, expiresAt: {}, needsProperty: {} };

/** OAuth connections belong to one account/workspace visit and its latest request.
 * An unavailable status is not proof that a connection is missing. Token expiry
 * is metadata, not disconnection: Canva can refresh an expired token server-side.
 */
export function useSocialConnections() {
  const { user } = useAuth();
  const userId = user?.id;
  const workspaceId = useWorkspaceId();
  const ready = useWorkspaceReady();
  // Object identity also distinguishes the two visits in A → B → A.
  const scope = useMemo(() => ({ userId, workspaceId, ready }), [userId, workspaceId, ready]);
  const activeScope = useRef<typeof scope | null>(null);
  const request = useRef(0);
  const [state, setState] = useState<{
    scope: typeof scope;
    loading: boolean;
    data: ConnectionData | null;
  } | null>(null);

  const load = useCallback(async (): Promise<ConnectionData | null> => {
    // A retained refresh callback must not cancel a newer workspace's request.
    if (activeScope.current !== scope || !userId || !ready) return null;
    const id = ++request.current;
    const isCurrent = () => activeScope.current === scope && request.current === id;
    setState({ scope, loading: true, data: null });
    try {
      const { data, error } = await supabase.functions.invoke("social-status", {
        body: { workspace_id: workspaceId && workspaceId !== userId ? workspaceId : undefined },
      });
      if (!isCurrent()) return null;
      if (error || data?.error || !Array.isArray(data?.connections)) throw new Error("Unknown social status");
      const connected: ConnectionData["connected"] = {};
      const needsProperty: ConnectionData["needsProperty"] = {};
      const expiresAt: ConnectionData["expiresAt"] = {};
      for (const c of data.connections) {
        if (!c || typeof c.platform !== "string" || typeof c.connected !== "boolean") {
          throw new Error("Invalid social status");
        }
        connected[c.platform] = c.connected;
        needsProperty[c.platform] = c.needsProperty === true;
        expiresAt[c.platform] = typeof c.expiresAt === "string" && Number.isFinite(Date.parse(c.expiresAt))
          ? c.expiresAt : null;
      }
      const result = { connected, expiresAt, needsProperty };
      setState({ scope, loading: false, data: result });
      return result;
    } catch {
      if (isCurrent()) setState({ scope, loading: false, data: null });
      return null;
    }
  }, [scope, userId, workspaceId, ready]);

  useLayoutEffect(() => {
    activeScope.current = scope;
    void load();
    return () => {
      activeScope.current = null;
    };
  }, [scope, load]);

  // Mask a previous scope on the transition render, before effects execute.
  const current = state?.scope === scope && userId && ready ? state : null;
  const known = !!current?.data;
  const loading = !!userId && (!ready || (current?.loading ?? true));
  const { connected, expiresAt, needsProperty } = current?.data ?? EMPTY;
  const isConnected = useCallback((platform: SocialPlatform) => connected[platform] === true, [connected]);
  const getTokenExpiry = useCallback((platform: SocialPlatform) => expiresAt[platform] || null, [expiresAt]);

  return { connected, needsProperty, loading, known, isConnected, getTokenExpiry, refresh: load };
}
