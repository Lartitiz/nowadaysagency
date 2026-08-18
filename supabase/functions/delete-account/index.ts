import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { cancelActiveStripeSubscription } from "./cancel-subscription.ts";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Exportée (plutôt qu'inline dans serve()) pour être testable : `serve()` de
// std/http ouvre un vrai socket TCP à l'import et n'expose pas le handler
// qu'on lui passe, contrairement à `Deno.serve` (voir _shared/test-edge-harness.ts).
// Le guard `import.meta.main` plus bas préserve le comportement de prod à l'identique.
export async function handleDeleteAccountRequest(req: Request): Promise<Response> {
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

    // Determine target user (self-delete vs admin-delete)
    const body = await req.json().catch(() => ({}));
    let userId = userData.user.id;

    if (body.targetUserId) {
      if (userData.user.email !== ADMIN_EMAIL) {
        // Fallback: check user_roles table for admin role
        const adminServiceClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const { data: roleRow } = await adminServiceClient
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!roleRow) {
          return new Response(
            JSON.stringify({ error: "Forbidden" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
          );
        }
      }
      userId = body.targetUserId;
      console.log(`[delete-account] ADMIN deletion of user ${body.targetUserId} by ${userData.user.email}`);
    }

    // Admin client for deletion
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Résilier l'abonnement Stripe AVANT toute suppression : sans ça, un
    // abonnement actif continue de facturer une cliente dont le compte
    // n'existe plus, sans aucune trace ni moyen de s'en apercevoir. On bloque
    // la suppression si l'annulation échoue pour un abonnement réellement
    // actif (fail-safe) plutôt que de supprimer un compte que Stripe continue
    // de facturer dans le vide.
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });
    const cancelResult = await cancelActiveStripeSubscription(userId, admin, stripe);
    if (cancelResult.error) {
      console.error(`[delete-account] Stripe cancellation failed for ${userId}:`, cancelResult.error);
      return new Response(
        JSON.stringify({ error: "Impossible d'annuler l'abonnement Stripe. Réessaie dans un instant." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    if (cancelResult.canceled) {
      console.log(`[delete-account] Stripe subscription canceled for ${userId}`);
    }

    // Phase 1 — Child tables (dependencies first)
    const phase1: string[] = [
      "assistant_undo_log",
      "audit_recommendations",
      "audit_validations",
      "beta_feedback",
      "bio_versions",
      "branding_autofill",
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
      "chat_guide_messages",
      "chat_guide_conversations",
      "coach_exercises",
      "coaching_actions",
      "coaching_deliverables",
      "coaching_sessions",
      "coaching_programs",
      "communication_plans",
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

    // Phase 2 — Parent tables. brand_profile.workspace_id references workspaces,
    // so it must be deleted before workspaces or the workspace row survives the
    // FK violation — which then also blocks the auth user deletion in Phase 3
    // (workspaces.created_by references auth.users).
    const phase2: string[] = [
      "workspace_invitations",
      "workspace_members",
      "brand_profile",
      "workspaces",
      "ai_usage",
      "calendar_posts",
      "profiles",
    ];

    let tablesCleaned = 0;
    const errors: string[] = [];

    const deleteFromTables = async (tables: string[]) => {
      for (const table of tables) {
        try {
          const col = table === "workspaces" ? "created_by" : "user_id";
          const { error } = await admin.from(table).delete().eq(col, userId);
          if (error) {
            if (error.message?.includes("does not exist") || error.code === "42P01") {
              console.log(`[delete-account] Table ${table} does not exist, skipping`);
              tablesCleaned++;
            } else {
              console.error(`[delete-account] Error deleting ${table}:`, error.message);
              errors.push(`${table}: ${error.message}`);
            }
          } else {
            tablesCleaned++;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("does not exist")) {
            console.log(`[delete-account] Table ${table} does not exist, skipping`);
            tablesCleaned++;
          } else {
            console.error(`[delete-account] Exception on ${table}:`, msg);
            errors.push(`${table}: ${msg}`);
          }
        }
      }
    };

    console.log(`[delete-account] Starting deletion for user ${userId}`);
    await deleteFromTables(phase1);
    await deleteFromTables(phase2);

    // Phase 2.5 — Delete storage files
    const buckets = [
      "audit-screenshots", "linkedin-audit-screenshots", "inspiration-screenshots",
      "deliverables", "onboarding-uploads", "audit-posts", "brand-assets",
      "crosspost-uploads", "moodboards", "beta-feedback", "calendar-media",
    ];
    for (const bucket of buckets) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(userId);
        if (files && files.length > 0) {
          const paths = files.map((f: any) => `${userId}/${f.name}`);
          await admin.storage.from(bucket).remove(paths);
          console.log(`[delete-account] Removed ${paths.length} files from ${bucket}`);
        }
      } catch (e) {
        console.log(`[delete-account] Storage ${bucket} cleanup skipped:`, e instanceof Error ? e.message : String(e));
      }
    }

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

    // Un compte "supprimé" qui échoue à supprimer l'auth user (ou toute autre
    // table) survit à sa propre suppression si on renvoie success:true ici —
    // c'est exactement l'incident prod qu'on corrige. success reflète l'échec
    // réel et le status HTTP porte l'erreur pour ne pas être ignoré côté front.
    const hasErrors = errors.length > 0;
    return new Response(
      JSON.stringify({ success: !hasErrors, tables_cleaned: tablesCleaned, errors: hasErrors ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: hasErrors ? 500 : 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[delete-account] Fatal error:`, msg);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
}

// Guard nécessaire pour les tests : sans lui, `deno test` important ce module
// (pour handleDeleteAccountRequest) ouvrirait aussi un vrai listener HTTP. En
// prod, l'edge function exécute index.ts directement comme entrypoint →
// import.meta.main est true, comportement inchangé.
if (import.meta.main) {
  serve(handleDeleteAccountRequest);
}
