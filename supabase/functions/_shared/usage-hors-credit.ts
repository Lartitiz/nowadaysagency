// Appels IA comptés SANS débiter de crédit (audit de coût API du 20/10/2026,
// paquet a). Table `ai_usage_hors_credit` (migration 20261020150000) : même
// forme qu'ai_usage, lue par cron-health pour le coût estimé total.
//
// ⚠️ Ne jamais écrire ces appels dans ai_usage : une ligne ai_usage = un crédit
// pour tous les compteurs (checkQuota, record_ai_usage, Studio, compteur affiché).
//
// N'importe rien de plan-limiter.ts : plan-limiter importe ce module (compte de
// recette), l'inverse créerait un cycle.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

export type SourceHorsCredit = "compte_test" | "inscription" | "etape_gratuite" | "passerelle_lovable" | "passe_interne";

export interface LigneHorsCredit {
  source: SourceHorsCredit;
  action: string;
  userId?: string | null;
  workspaceId?: string | null;
  model?: string | null;
  tokens?: number | null;
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/**
 * Écrit une ligne hors crédit. Ne lève jamais : la mesure ne doit pas casser une
 * génération réussie (l'erreur est journalisée).
 */
export async function logUsageHorsCredit(ligne: LigneHorsCredit, sbOverride?: any): Promise<void> {
  try {
    const sb = sbOverride ?? serviceClient();
    const { error } = await sb.from("ai_usage_hors_credit").insert({
      source: ligne.source,
      action_type: ligne.action,
      user_id: ligne.userId || null,
      workspace_id: ligne.workspaceId || null,
      model_used: ligne.model || null,
      tokens_used: ligne.tokens || null,
    });
    if (error) throw error;
  } catch (e) {
    console.error(JSON.stringify({ type: "usage_hors_credit_failed", source: ligne.source, action: ligne.action, error: String((e as any)?.message || e) }));
  }
}

/** Nombre de lignes d'une source pour une utilisatrice sur les dernières 24 h. */
export async function compterHorsCredit24h(
  sb: any, userId: string, source: SourceHorsCredit,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error } = await sb
    .from("ai_usage_hors_credit")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", source)
    .gt("created_at", since);
  if (error) throw error;
  return count ?? 0;
}
