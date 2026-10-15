// Images du Studio bloquées « en cours » (15/10/2026).
// L'automate pg_cron studio-reconcile-images termine en ~20 min une image
// interrompue (onglet fermé, coupure). Du 02 au 15/10/2026 il échouait en
// silence (garde « service_role » sous pg_cron, WARNING avalé, job « succeeded ») :
// cron_jobs_health ne pouvait pas le voir. On compte donc le RÉSULTAT : des
// versions encore « processing » plus d'1 h après leur création. Seuil > 0 = ⚠️.

// deno-lint-ignore no-explicit-any
type Client = any;

export async function studioImagesBloquees(supabase: Client, now: number): Promise<{ count: number } | { erreur: string }> {
  const { count, error } = await supabase
    .from("visual_studio_versions")
    .select("id", { count: "exact", head: true })
    .eq("status", "processing")
    .lt("created_at", new Date(now - 3_600_000).toISOString());
  return error ? { erreur: error.message } : { count: count ?? 0 };
}
