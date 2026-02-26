import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth user via anon client
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

    // Admin client for deletion
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Phase 1 — Child tables (dependencies first)
    const phase1: string[] = [
      "assistant_undo_log",
      "audit_recommendations",
      "audit_validations",
      "beta_feedback",
      "bio_versions",
      "branding_coaching_sessions",
      "branding_mirror_results",
      "branding_suggestions",
      "branding_summary",
      "branding_audits",
      "brand_charter",
      "brand_proposition",
      "brand_strategy",
      "calendar_comments",
      "calendar_shares",
      "coach_exercises",
      "coaching_actions",
      "coaching_deliverables",
      "coaching_sessions",
      "coaching_programs",
      "community_reactions",
      "community_comments",
      "community_posts",
      "contact_interactions",
      "contacts",
      "content_recycling",
      "content_scores",
      "content_drafts",
      "dismissed_suggestions",
      "engagement_checklist_logs",
      "engagement_comments",
      "engagement_contacts",
      "engagement_exercise",
      "engagement_metrics",
      "engagement_streaks",
      "engagement_weekly",
      "engagement_weekly_linkedin",
      "generated_carousels",
      "generated_posts",
      "highlight_categories",
      "instagram_audit_posts",
      "instagram_audit",
      "instagram_editorial_line",
      "instagram_highlights_questions",
      "instagram_highlights",
      "instagram_inspirations",
      "instagram_pinned_posts",
      "instagram_weekly_stats",
      "intake_questionnaires",
      "inspiration_accounts",
      "inspiration_notes",
      "launch_plan_contents",
      "launches",
      "linkedin_audit",
      "linkedin_comment_strategy",
      "linkedin_experiences",
      "linkedin_profile",
      "linkedin_recommendations",
      "live_questions",
      "live_reminders",
      "lives",
      "monthly_stats",
      "notifications",
      "offers",
      "persona",
      "pinterest_boards",
      "pinterest_keywords",
      "pinterest_pins",
      "pinterest_profile",
      "pinterest_routine",
      "plan_step_overrides",
      "plan_step_visibility",
      "plan_tasks",
      "promo_redemptions",
      "prospects",
      "prospect_interactions",
      "purchases",
      "reel_inspirations",
      "reels_metrics",
      "reels_scripts",
      "routine_completions",
      "routine_tasks",
      "sales_page_optimizations",
      "saved_ideas",
      "shared_branding_links",
      "stats_config",
      "stories_metrics",
      "stories_sequences",
      "storytelling",
      "studio_binomes",
      "studio_coachings",
      "studio_deliverables",
      "subscriptions",
      "tasks",
      "user_badges",
      "user_documents",
      "user_offers",
      "user_plan_config",
      "user_plan_overrides",
      "user_rhythm",
      "user_roles",
      "voice_guides",
      "voice_profile",
      "website_about",
      "website_audit",
      "website_homepage",
      "website_inspirations",
      "website_profile",
      "weekly_batches",
      "weekly_missions",
    ];

    // Phase 2 — Parent tables
    const phase2: string[] = [
      "workspace_invitations",
      "workspace_members",
      "workspaces",
      "brand_profile",
      "ai_usage",
      "calendar_posts",
      "profiles",
    ];

    let tablesCleaned = 0;
    const errors: string[] = [];

    const deleteFromTables = async (tables: string[]) => {
      for (const table of tables) {
        try {
          // workspaces uses created_by, not user_id
          const col = table === "workspaces" ? "created_by" : "user_id";
          const { error } = await admin.from(table).delete().eq(col, userId);
          if (error) {
            console.error(`[delete-account] Error deleting ${table}:`, error.message);
            errors.push(`${table}: ${error.message}`);
          } else {
            tablesCleaned++;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[delete-account] Exception on ${table}:`, msg);
          errors.push(`${table}: ${msg}`);
        }
      }
    };

    console.log(`[delete-account] Starting deletion for user ${userId}`);
    await deleteFromTables(phase1);
    await deleteFromTables(phase2);

    // Phase 3 — Delete auth user
    console.log(`[delete-account] Deleting auth user ${userId}`);
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error(`[delete-account] Error deleting auth user:`, deleteUserError.message);
      errors.push(`auth.user: ${deleteUserError.message}`);
    } else {
      tablesCleaned++;
    }

    console.log(`[delete-account] Done. Cleaned: ${tablesCleaned}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ success: true, tables_cleaned: tablesCleaned, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[delete-account] Fatal error:`, msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
