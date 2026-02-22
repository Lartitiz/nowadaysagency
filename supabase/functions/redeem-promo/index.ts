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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Non authentifié");

    const userId = userData.user.id;
    const { code } = await req.json();
    if (!code || typeof code !== "string") throw new Error("Code manquant");

    const upperCode = code.trim().toUpperCase();

    // Find the promo code
    const { data: promo, error: promoErr } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", upperCode)
      .eq("is_active", true)
      .single();

    if (promoErr || !promo) {
      return new Response(JSON.stringify({ error: "Code invalide ou expiré." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check expiration
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Ce code a expiré." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check max uses
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return new Response(JSON.stringify({ error: "Ce code a atteint son nombre maximum d'utilisations." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check if user already redeemed this code
    const { data: existing } = await supabase
      .from("promo_redemptions")
      .select("id")
      .eq("user_id", userId)
      .eq("promo_code_id", promo.id)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ error: "Tu as déjà utilisé ce code." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Calculate expiry
    let expiresAt: string | null = null;
    if (promo.duration_days) {
      const d = new Date();
      d.setDate(d.getDate() + promo.duration_days);
      expiresAt = d.toISOString();
    }

    // Create redemption
    await supabase.from("promo_redemptions").insert({
      user_id: userId,
      promo_code_id: promo.id,
      expires_at: expiresAt,
    });

    // Increment uses
    await supabase
      .from("promo_codes")
      .update({ current_uses: promo.current_uses + 1 })
      .eq("id", promo.id);

    // Update profile plan
    await supabase
      .from("profiles")
      .update({ current_plan: promo.plan_granted })
      .eq("user_id", userId);

    // Upsert subscription
    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        plan: promo.plan_granted,
        status: "active",
        source: "promo",
        current_period_end: expiresAt,
      },
      { onConflict: "user_id" }
    );

    return new Response(JSON.stringify({
      success: true,
      plan: promo.plan_granted,
      expires_at: expiresAt,
      code: upperCode,
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
