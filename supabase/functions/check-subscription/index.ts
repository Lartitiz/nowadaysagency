import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { PLAN_LIMITS } from "../_shared/plan-limiter.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Non authentifié");

    const userId = userData.user.id;

    const { data: sub } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Also check coaching_programs for active Now Pilot programs
    const { data: activeProgram } = await supabaseClient
      .from("coaching_programs")
      .select("id, status")
      .eq("client_user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    const { data: purchases } = await supabaseClient
      .from("purchases")
      .select("product_type, status, created_at")
      .eq("user_id", userId)
      .eq("status", "paid");

    // Get usage this month by category
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: usageRows } = await supabaseClient
      .from("ai_usage")
      .select("category")
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString());

    const rows = usageRows || [];
    // If subscription says free but there's an active coaching program, override to now_pilot
    let plan = sub?.plan || "free";
    if (plan === "free" && activeProgram) {
      plan = "now_pilot";
    }
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Build usage map
    const usage: Record<string, { used: number; limit: number }> = {};
    for (const cat of Object.keys(limits)) {
      if (cat === "total") continue;
      const used = rows.filter((r: any) => r.category === cat).length;
      usage[cat] = { used, limit: limits[cat] };
    }
    usage.total = { used: rows.length, limit: limits.total };

    return new Response(JSON.stringify({
      plan,
      status: sub?.status || "active",
      current_period_end: sub?.current_period_end,
      studio_months_paid: sub?.studio_months_paid || 0,
      studio_end_date: sub?.studio_end_date,
      cancel_at: sub?.cancel_at,
      source: sub?.source || "stripe",
      purchases: purchases || [],
      ai_usage: usage,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
