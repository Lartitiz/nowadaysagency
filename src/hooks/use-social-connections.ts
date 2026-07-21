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
  const [expiresAt, setExpiresAt] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  // true uniquement après une réponse RÉUSSIE de social-status : permet de
  // distinguer « vraiment pas connecté » d'un simple échec réseau (où l'on ne
  // doit jamais bloquer l'utilisatrice sur un faux négatif).
  const [known, setKnown] = useState(false);

  const load = useCallback(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    supabase.functions
      .invoke("social-status", {
        body: { workspace_id: workspaceId !== user.id ? workspaceId : undefined },
      })
      .then(({ data, error }) => {
        // Réponse en erreur (edge KO, cold start…) → statut inconnu, pas « déconnecté ».
        if (error || !Array.isArray((data as any)?.connections)) return;
        const conns = (data as any).connections;
        const map: Record<string, boolean> = {};
        const expMap: Record<string, string | null> = {};
        for (const c of conns) {
          if (!c?.platform) continue;
          map[c.platform] = !!c.connected;
          expMap[c.platform] = c.expiresAt || null;
        }
        setConnected(map);
        setExpiresAt(expMap);
        setKnown(true);
      })
      .catch(() => { /* non bloquant : on n'empêche jamais l'usage de l'app */ })
      .finally(() => setLoading(false));
  }, [user?.id, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const isConnected = useCallback(
    (platform: SocialPlatform) => !!connected[platform],
    [connected],
  );

  /** Date d'expiration du jeton OAuth (ISO) si connue — pour avertir avant qu'une publication programmée échoue. */
  const getTokenExpiry = useCallback(
    (platform: SocialPlatform) => expiresAt[platform] || null,
    [expiresAt],
  );

  return { connected, loading, known, isConnected, getTokenExpiry, refresh: load };
}
