import { supabase } from "@/integrations/supabase/client";
import { memoriseRetour } from "@/lib/retour-apres-detour";

/**
 * Démarre la connexion OAuth d'un réseau EN PLACE, depuis n'importe quel écran
 * (pas seulement Paramètres → Connexions). Mémorise le chemin courant AVANT de
 * partir : au retour, `SocialConnectionsCard` lit ce mémo et ramène directement
 * ici (le travail en cours est préservé par `use-flow-persistence`, 2h).
 *
 * Extrait de `SocialConnectionsCard.handleConnect` pour être réutilisable
 * depuis la fenêtre de publication (`PublishOrScheduleDialog`) — même chemin
 * de connexion, un seul endroit qui l'implémente.
 */
export async function startSocialConnect(
  platform: "instagram" | "linkedin" | "linkedin_analytics" | "canva" | "pinterest" | "google",
  workspaceId: string | undefined,
  opts?: { quoi?: string; depuis?: string },
): Promise<{ error?: string }> {
  memoriseRetour(opts?.depuis, opts?.quoi);
  try {
    const { data, error } = await supabase.functions.invoke("social-oauth-start", {
      body: {
        platform,
        workspace_id: workspaceId,
        return_to: window.location.origin,
      },
    });
    if (error) throw error;
    const url = (data as any)?.url;
    if (!url) throw new Error("URL d'autorisation manquante.");
    window.location.assign(url);
    return {};
  } catch (e: any) {
    return { error: e?.message || "Impossible de démarrer la connexion." };
  }
}
