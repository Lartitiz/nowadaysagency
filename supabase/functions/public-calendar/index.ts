import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const weekStart = url.searchParams.get("week_start");
    const monthStart = url.searchParams.get("month_start");
    const period = url.searchParams.get("period"); // "week" | "month" | "all"
    const updateGuestName = url.searchParams.get("guest_name");

    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate share token
    const { data: share, error: shareErr } = await supabase
      .from("calendar_shares")
      .select("*")
      .eq("share_token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (shareErr || !share) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update guest name if provided
    if (updateGuestName && updateGuestName.trim()) {
      await supabase
        .from("calendar_shares")
        .update({ guest_name: updateGuestName.trim() })
        .eq("id", share.id);
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("prenom, activite")
      .eq("user_id", share.user_id)
      .maybeSingle();

    let postsQuery = supabase
      .from("calendar_posts")
      .select(
        "id, date, theme, canal, format, objectif, status, notes, content_draft, category, audience_phase, accroche, angle, updated_at, media_urls"
      )
      .eq("user_id", share.user_id)
      .order("date");

    if (share.workspace_id) {
      postsQuery = postsQuery.eq("workspace_id", share.workspace_id);
    }

    if (share.canal_filter && share.canal_filter !== "all") {
      postsQuery = postsQuery.eq("canal", share.canal_filter);
    }

    // Date filtering
    if (period !== "all") {
      if (weekStart) {
        const start = new Date(weekStart);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        postsQuery = postsQuery.gte("date", weekStart).lte("date", end.toISOString().slice(0, 10));
      } else if (monthStart) {
        const start = new Date(monthStart);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        postsQuery = postsQuery.gte("date", monthStart).lte("date", end.toISOString().slice(0, 10));
      }
    }

    const { data: posts } = await postsQuery;
    const postIds = (posts || []).map((p: any) => p.id);

    // Fetch comments
    let comments: any[] = [];
    if (postIds.length > 0) {
      const { data: cmts } = await supabase
        .from("calendar_comments")
        .select("*")
        .eq("share_id", share.id)
        .in("calendar_post_id", postIds)
        .order("created_at", { ascending: true });
      comments = cmts || [];
    }

    // Find last updated_at
    const lastUpdated = (posts || []).reduce((max: string, p: any) => {
      return p.updated_at > max ? p.updated_at : max;
    }, "");

    return new Response(
      JSON.stringify({
        share: {
          id: share.id,
          label: share.label,
          canal_filter: share.canal_filter,
          show_content_draft: share.show_content_draft,
          guest_name: updateGuestName?.trim() || share.guest_name,
          guest_can_edit_status: share.guest_can_edit_status ?? true,
          guest_can_edit_wording: share.guest_can_edit_wording ?? false,
          view_mode: share.view_mode ?? "table",
          show_columns: share.show_columns ?? ["theme", "status", "date", "wording", "canal", "format", "phase"],
        },
        profile: profile || {},
        posts: (posts || []).map((p: any) => ({
          ...p,
          phase: p.category || p.audience_phase || null,
          wording: p.content_draft || null,
        })),
        comments,
        last_updated: lastUpdated || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
