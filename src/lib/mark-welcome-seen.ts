import { supabase } from "@/integrations/supabase/client";

/* Marque la page de bienvenue comme vue (sinon AuthContext y renvoie à la
   prochaine connexion). Crée la ligne user_plan_config si elle manque : une
   mise à jour de 0 ligne ne lève aucune erreur. Jamais bloquant. */
export async function markWelcomeSeen(userId: string): Promise<void> {
  try { localStorage.setItem("lac_welcome_seen", "true"); } catch { /* ignore */ }
  const { data, error } = await (supabase.from("user_plan_config") as any)
    .update({ welcome_seen: true })
    .eq("user_id", userId)
    .select("user_id");
  if (error) { console.error("welcome_seen update failed:", error); return; }
  if (!data?.length) {
    const { error: insError } = await (supabase.from("user_plan_config") as any)
      .insert({ user_id: userId, welcome_seen: true });
    if (insError) console.error("welcome_seen insert failed:", insError);
  }
}
