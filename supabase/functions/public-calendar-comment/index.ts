import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, calendar_post_id, author_name, content } = await req.json();

    if (!token || !calendar_post_id || !author_name || !content) {
      return new Response(
        JSON.stringify({ error: "missing_fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (content.length > 2000) {
      return new Response(
        JSON.stringify({ error: "content_too_long" }),
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
      .select("id, user_id, is_active, expires_at")
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

    // Verify post belongs to share owner
    const { data: post } = await supabase
      .from("calendar_posts")
      .select("id")
      .eq("id", calendar_post_id)
      .eq("user_id", share.user_id)
      .maybeSingle();

    if (!post) {
      return new Response(
        JSON.stringify({ error: "post_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: max 20 comments per share per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("calendar_comments")
      .select("id", { count: "exact", head: true })
      .eq("share_id", share.id)
      .gte("created_at", todayStart.toISOString());

    if ((count || 0) >= 20) {
      return new Response(
        JSON.stringify({ error: "rate_limit" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert comment
    const { data: comment, error: insertErr } = await supabase
      .from("calendar_comments")
      .insert({
        calendar_post_id,
        share_id: share.id,
        author_name: author_name.slice(0, 100),
        author_role: "guest",
        content: content.slice(0, 2000),
      })
      .select()
      .single();

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: "insert_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(comment), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
