import { supabase } from "@/integrations/supabase/client";

/**
 * Compteur de clics sur les trois portes du dashboard (creer / programmer /
 * photos) : de quoi vérifier avec de vrais chiffres pourquoi les utilisatrices
 * viennent, dans le récap du lundi.
 *
 * La table `dashboard_clicks` est créée côté Supabase (prompt Lovable). Tant
 * qu'elle n'existe pas, l'insert échoue : on coupe alors le comptage pour la
 * session (un seul essai raté, pas une erreur réseau par clic) et la
 * navigation n'est jamais bloquée — le clic part avant, pas après.
 */
export type DashboardPorte = "creer" | "programmer" | "photos";

const OFF_KEY = "lac_portes_tracking_off";

export function trackPorte(porte: DashboardPorte, userId: string | undefined, workspaceId: string | null) {
  if (!userId) return;
  try {
    if (sessionStorage.getItem(OFF_KEY)) return;
  } catch { /* stockage indisponible : on tente quand même */ }

  void (supabase.from("dashboard_clicks" as never) as any)
    .insert({ porte, user_id: userId, workspace_id: workspaceId ?? userId })
    .then(({ error }: { error: unknown }) => {
      if (error) {
        try { sessionStorage.setItem(OFF_KEY, "1"); } catch { /* tant pis */ }
      }
    });
}
