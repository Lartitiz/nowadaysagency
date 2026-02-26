import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const TABLES_TO_BACKFILL = [
  "profiles",
  "brand_profile",
  "persona",
  "storytelling",
  "brand_proposition",
  "brand_strategy",
  "offers",
  "calendar_posts",
  "saved_ideas",
  "generated_posts",
  "generated_carousels",
  "content_drafts",
  "branding_audits",
  "instagram_audit",
  "instagram_editorial_line",
];

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    // Auth: verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: roleRow } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Accès réservé aux admins" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stats = { workspaces_created: 0, rows_updated: 0, users_processed: 0, errors: [] as string[] };

    // Step 1: Get all users from profiles who don't have a workspace yet
    const { data: allProfiles } = await sb
      .from("profiles")
      .select("user_id, prenom");

    if (!allProfiles || allProfiles.length === 0) {
      return new Response(JSON.stringify({ ...stats, message: "Aucun profil trouvé" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing workspace owners
    const { data: existingMembers } = await sb
      .from("workspace_members")
      .select("user_id, workspace_id")
      .eq("role", "owner");

    const ownerMap = new Map<string, string>();
    for (const m of existingMembers || []) {
      ownerMap.set(m.user_id, m.workspace_id);
    }

    // Step 1: Create workspaces for users without one
    for (const profile of allProfiles) {
      if (ownerMap.has(profile.user_id)) continue;

      const wsName = profile.prenom || "Mon espace";
      const { data: ws, error: wsErr } = await sb
        .from("workspaces")
        .insert({ name: wsName, created_by: profile.user_id })
        .select("id")
        .single();

      if (wsErr || !ws) {
        stats.errors.push(`Workspace creation failed for ${profile.user_id}: ${wsErr?.message}`);
        continue;
      }

      const { error: memErr } = await sb
        .from("workspace_members")
        .insert({ workspace_id: ws.id, user_id: profile.user_id, role: "owner" });

      if (memErr) {
        stats.errors.push(`Member insert failed for ${profile.user_id}: ${memErr.message}`);
        continue;
      }

      ownerMap.set(profile.user_id, ws.id);
      stats.workspaces_created++;
    }

    // Step 2: Backfill workspace_id on all tables
    for (const table of TABLES_TO_BACKFILL) {
      for (const [userId, wsId] of ownerMap) {
        const { count, error: upErr } = await sb
          .from(table)
          .update({ workspace_id: wsId } as any)
          .eq("user_id", userId)
          .is("workspace_id", null)
          .select("id", { count: "exact", head: true });

        if (upErr) {
          stats.errors.push(`Update ${table} for ${userId}: ${upErr.message}`);
        } else if (count && count > 0) {
          stats.rows_updated += count;
        }
      }
    }

    stats.users_processed = ownerMap.size;

    console.log("Migration completed:", JSON.stringify(stats));

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("migrate-workspaces error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
