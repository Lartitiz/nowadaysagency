/**
 * Server-side plan checking and AI usage tracking.
 * Used by all AI edge functions to enforce freemium limits.
 */

interface UsageCheckResult {
  allowed: boolean;
  remaining?: number;
  plan: string;
  error?: string;
}

export async function getUserPlan(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("current_plan")
    .eq("user_id", userId)
    .single();
  return data?.current_plan || "free";
}

export async function checkAndIncrementUsage(
  supabase: any,
  userId: string,
  type: "generation" | "audit" = "generation"
): Promise<UsageCheckResult> {
  const plan = await getUserPlan(supabase, userId);

  // Paid plans have unlimited usage
  if (plan !== "free") {
    return { allowed: true, plan };
  }

  const month = new Date().toISOString().slice(0, 7); // "2026-02"
  const field = type === "generation" ? "generation_count" : "audit_count";
  const limit = type === "generation" ? 3 : 1;

  // Use service role to read/write ai_usage
  const serviceSupabase = (await import("jsr:@supabase/supabase-js@2")).createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data } = await serviceSupabase
    .from("ai_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("month", month)
    .single();

  const current = data?.[field] || 0;

  if (current >= limit) {
    return {
      allowed: false,
      remaining: 0,
      plan,
      error: type === "generation"
        ? "Tu as atteint ta limite de 3 générations IA gratuites ce mois-ci. Passe au plan Outil pour des générations illimitées !"
        : "Tu as déjà utilisé ton audit gratuit ce mois-ci. Passe au plan Outil pour des audits illimités !",
    };
  }

  // Upsert usage
  await serviceSupabase.from("ai_usage").upsert(
    {
      user_id: userId,
      month,
      [field]: current + 1,
    },
    { onConflict: "user_id,month" }
  );

  return { allowed: true, remaining: limit - current - 1, plan };
}
