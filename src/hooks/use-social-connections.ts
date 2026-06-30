import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";

export type SocialPlatform = "instagram" | "linkedin" | "pinterest" | "canva";

/**
 * Statut de connexion OAuth des réseaux (et Canva) du workspace courant.
 * Source unique : l'edge function `social-status` (mêmes données que la page
 * Paramètres › Connexions). À réutiliser partout où l'on veut inciter à
 * connecter un compte — au lieu de redemander `social-status` à la main.
 */
export function useSocialConnections() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    supabase.functions
      .invoke("social-status", {
        body: { workspace_id: workspaceId !== user.id ? workspaceId : undefined },
      })
      .then(({ data }) => {
        const conns = (data as any)?.connections || [];
        const map: Record<string, boolean> = {};
        for (const c of conns) if (c?.platform) map[c.platform] = !!c.connected;
        setConnected(map);
      })
      .catch(() => { /* non bloquant : on n'empêche jamais l'usage de l'app */ })
      .finally(() => setLoading(false));
  }, [user?.id, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const isConnected = useCallback(
    (platform: SocialPlatform) => !!connected[platform],
    [connected],
  );

  return { connected, loading, isConnected, refresh: load };
}
