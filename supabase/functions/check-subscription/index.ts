import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { data: purchases } = await supabaseClient
      .from("purchases")
      .select("product_type, status, created_at")
      .eq("user_id", userId)
      .eq("status", "paid");

    const { data: usage } = await supabaseClient
      .from("ai_usage")
      .select("*")
      .eq("user_id", userId)
      .eq("month", new Date().toISOString().slice(0, 7))
      .single();

    return new Response(JSON.stringify({
      plan: sub?.plan || "free",
      status: sub?.status || "active",
      current_period_end: sub?.current_period_end,
      studio_months_paid: sub?.studio_months_paid || 0,
      studio_end_date: sub?.studio_end_date,
      cancel_at: sub?.cancel_at,
      purchases: purchases || [],
      ai_usage: {
        generation_count: usage?.generation_count || 0,
        audit_count: usage?.audit_count || 0,
      },
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
