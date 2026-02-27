import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";

const VALID_STATUSES = ["idea", "to_write", "writing", "ready", "published"];
const STATUS_LABELS: Record<string, string> = {
  idea: "Pas commencé",
  to_write: "À rédiger",
  writing: "En cours",
  ready: "Validé",
  published: "Posté",
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, post_id, field, value } = await req.json();

    if (!token || !post_id || !field || value === undefined) {
      return new Response(
        JSON.stringify({ error: "missing_fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["status", "wording"].includes(field)) {
      return new Response(
        JSON.stringify({ error: "invalid_field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate share
    const { data: share } = await supabase
      .from("calendar_shares")
      .select("id, user_id, is_active, expires_at, guest_can_edit_status, guest_can_edit_wording, guest_name, workspace_id")
      .eq("share_token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (!share) {
      return new Response(
        JSON.stringify({ error: "invalid_token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "expired" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check permission
    if (field === "status" && !share.guest_can_edit_status) {
      return new Response(
        JSON.stringify({ error: "permission_denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (field === "wording" && !share.guest_can_edit_wording) {
      return new Response(
        JSON.stringify({ error: "permission_denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: 50 edits/day/share
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("calendar_comments")
      .select("id", { count: "exact", head: true })
      .eq("share_id", share.id)
      .gte("created_at", todayStart.toISOString())
      .like("content", "[EDIT]%");

    if ((count || 0) >= 50) {
      return new Response(
        JSON.stringify({ error: "rate_limit" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify post belongs to share owner
    const { data: post } = await supabase
      .from("calendar_posts")
      .select("id, status, content_draft")
      .eq("id", post_id)
      .eq("user_id", share.user_id)
      .maybeSingle();

    if (!post) {
      return new Response(
        JSON.stringify({ error: "post_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Perform the edit
    let commentContent = "";

    if (field === "status") {
      const newStatus = String(value).trim();
      if (!VALID_STATUSES.includes(newStatus)) {
        return new Response(
          JSON.stringify({ error: "invalid_status", valid: VALID_STATUSES }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const oldLabel = STATUS_LABELS[post.status] || post.status;
      const newLabel = STATUS_LABELS[newStatus] || newStatus;

      await supabase
        .from("calendar_posts")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", post_id);

      commentContent = `[EDIT] Statut changé de "${oldLabel}" à "${newLabel}"`;
    }

    if (field === "wording") {
      const newWording = String(value).slice(0, 10000);

      await supabase
        .from("calendar_posts")
        .update({ content_draft: newWording, updated_at: new Date().toISOString() })
        .eq("id", post_id);

      commentContent = `[EDIT] Wording modifié`;
    }

    // Log edit as auto-comment
    await supabase
      .from("calendar_comments")
      .insert({
        calendar_post_id: post_id,
        share_id: share.id,
        author_name: share.guest_name || "Client·e",
        author_role: "guest",
        content: commentContent,
      });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("public-calendar-edit error:", e);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
