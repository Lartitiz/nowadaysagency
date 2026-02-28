import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !userData.user) throw new Error("User not authenticated");
    const userId = userData.user.id;
    console.log("[reset] Starting reset for user:", userId);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const errors: string[] = [];
    let cleaned = 0;

    // 1. Delete branding data (dependencies first)
    const brandingTables = [
      "audit_recommendations",
      "branding_coaching_sessions",
      "branding_mirror_results",
      "branding_autofill",
      "branding_suggestions",
      "branding_summary",
      "branding_audits",
      "brand_charter",
      "brand_strategy",
      "brand_proposition",
      "brand_profile",
      "bio_versions",
      "audit_validations",
      "storytelling",
      "persona",
      "offers",
      "voice_profile",
      "voice_guides",
      "shared_branding_links",
    ];

    for (const table of brandingTables) {
      try {
        const { error } = await admin.from(table).delete().eq("user_id", userId);
        if (error && !error.message?.includes("does not exist")) {
          errors.push(`${table}: ${error.message}`);
        } else {
          cleaned++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("does not exist")) errors.push(`${table}: ${msg}`);
      }
    }

    // 2. Reset onboarding flags in profiles
    const { error: profileError, count: profileCount } = await admin.from("profiles").update({
      onboarding_completed: false,
      onboarding_step: 0,
      canaux: null,
      main_blocker: null,
      main_goal: null,
      weekly_time: null,
      diagnostic_data: null,
    }).eq("user_id", userId);
    console.log("[reset] profiles update:", JSON.stringify({ error: profileError?.message, count: profileCount }));

    // 3. Reset or delete user_plan_config
    const { error: configUpdateError } = await admin
      .from("user_plan_config")
      .update({ onboarding_completed: false, onboarding_completed_at: null, welcome_seen: false })
      .eq("user_id", userId);

    console.log("[reset] config update:", JSON.stringify({ error: configUpdateError?.message }));

    if (configUpdateError) {
      const { error: delErr } = await admin.from("user_plan_config").delete().eq("user_id", userId);
      console.log("[reset] config delete fallback:", JSON.stringify({ error: delErr?.message }));
    }

    // 4. Delete diagnostic data
    try {
      await admin.from("diagnostic_results").delete().eq("user_id", userId);
    } catch { /* ignore */ }

    // 5. Verify
    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: config } = await admin
      .from("user_plan_config")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle();

    console.log("[reset] verify:", JSON.stringify({ profile, config, resetSuccess }));
    console.log("[reset] tables cleaned:", cleaned, "errors:", errors);

    return new Response(
      JSON.stringify({
        success: resetSuccess,
        tables_cleaned: cleaned,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
