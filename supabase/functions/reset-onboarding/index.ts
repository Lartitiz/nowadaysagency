import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAILS = ["laetitia@nowadaysagency.com", "laetitiamattioli@gmail.com"];

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[reset-onboarding] No auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("[reset-onboarding] getUser failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = user.id;
    const callerEmail = user.email as string;
    console.log(`[reset-onboarding] Caller: ${callerEmail} (${callerUserId})`);

    // Determine target user
    const body = await req.json().catch(() => ({}));
    let targetUserId = callerUserId; // Default: self-reset

    if (body.targetUserId) {
      // Admin mode: reset another user
      if (!ADMIN_EMAILS.includes(callerEmail)) {
        console.error(`[reset-onboarding] Forbidden: ${callerEmail} not in admin list`);
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserId = body.targetUserId;
      console.log(
        `[reset-onboarding] ADMIN reset of user ${targetUserId} by ${callerEmail}`
      );
    } else {
      console.log(`[reset-onboarding] Self-reset by ${callerEmail}`);
    }

    // Service role client (bypasses RLS)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Phase 1: Delete branding & diagnostic data
    const tablesToDelete = [
      "audit_recommendations",
      "audit_validations",
      "branding_suggestions",
      "branding_summary",
      "branding_coaching_sessions",
      "branding_mirror_results",
      "branding_autofill",
      "branding_audits",
      "brand_charter",
      "brand_strategy",
      "brand_proposition",
      "brand_profile",
      "bio_versions",
      "storytelling",
      "persona",
      "offers",
      "voice_profile",
      "voice_guides",
      "shared_branding_links",
      "dismissed_suggestions",
      "instagram_audit",
      "instagram_audit_posts",
      "instagram_editorial_line",
      "linkedin_audit",
      "website_audit",
      "content_scores",
      "diagnostic_results",
    ];

    let tablesCleaned = 0;
    const errors: string[] = [];

    for (const table of tablesToDelete) {
      try {
        const { error } = await admin
          .from(table)
          .delete()
          .eq("user_id", targetUserId);
        if (error) {
          errors.push(`${table}: ${error.message}`);
        } else {
          tablesCleaned++;
        }
      } catch (e: any) {
        errors.push(`${table}: ${e.message}`);
      }
    }

    // Phase 2: Reset profile fields
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        onboarding_completed: false,
        onboarding_completed_at: null,
        onboarding_step: 0,
        canaux: [],
        main_blocker: null,
        main_goal: null,
        weekly_time: null,
        diagnostic_data: null,
        level: null,
      })
      .eq("user_id", targetUserId);

    if (profileErr) {
      console.error("[reset-onboarding] CRITICAL - profiles update failed:", profileErr.message);
      errors.push(`profiles update: ${profileErr.message}`);
    } else {
      console.log("[reset-onboarding] profiles reset OK");
      tablesCleaned++;
    }

    // Phase 3: Clear audit usage so onboarding diagnostic isn't blocked
    const { error: usageErr } = await admin
      .from("ai_usage")
      .delete()
      .eq("user_id", targetUserId)
      .eq("category", "audit");

    if (usageErr) errors.push(`ai_usage cleanup: ${usageErr.message}`);
    else tablesCleaned++;

    // Phase 4: Reset user_plan_config
    const { error: configErr } = await admin
      .from("user_plan_config")
      .update({
        onboarding_completed: false,
        onboarding_completed_at: null,
        welcome_seen: false,
        main_goal: '',
        weekly_time: '',
      })
      .eq("user_id", targetUserId);

    if (configErr) {
      console.error("[reset-onboarding] CRITICAL - user_plan_config update failed:", configErr.message);
      errors.push(`user_plan_config: ${configErr.message}`);
    } else {
      console.log("[reset-onboarding] user_plan_config reset OK");
      tablesCleaned++;
    }

    console.log(
      `[reset-onboarding] Done. Cleaned: ${tablesCleaned}, Errors: ${errors.length}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        tables_cleaned: tablesCleaned,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[reset-onboarding] Fatal:", error);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: {
        ...getCorsHeaders(req),
        "Content-Type": "application/json",
      },
    });
  }
});
