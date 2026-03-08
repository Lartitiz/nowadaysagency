import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { scrapeWebsite, extractVisualInfo } from "../_shared/scraping.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await authenticateRequest(req);
    const { websiteUrl } = await req.json();
    if (!websiteUrl) {
      return new Response(JSON.stringify({ error: "websiteUrl requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check si déjà en cache (moins de 30 min)
    const { data: cached } = await supabaseAdmin
      .from("scrape_cache")
      .select("id, content")
      .eq("user_id", userId)
      .eq("url", websiteUrl)
      .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.content) {
      return new Response(JSON.stringify({ success: true, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Scrape content + extract visual hints from raw HTML
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const content = await scrapeWebsite(websiteUrl, controller.signal);

    // Also fetch raw HTML for visual style extraction (colors, fonts, CSS vars)
    let styleHints = "";
    try {
      let formattedUrl = websiteUrl.trim();
      if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;
      const resp = await fetch(formattedUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
      });
      if (resp.ok) {
        const html = await resp.text();
        styleHints = extractVisualInfo(html);
      }
    } catch {
      // Visual hints are nice-to-have, don't fail on this
    }

    clearTimeout(timeout);

    if (content) {
      // Upsert dans le cache — include style_hints for enrichment
      const { error: upsertError } = await supabaseAdmin.from("scrape_cache").upsert({
        user_id: userId,
        url: websiteUrl,
        source_type: "website",
        content: content.slice(0, 10000),
        style_hints: styleHints ? styleHints.slice(0, 3000) : null,
      }, { onConflict: "user_id,url" });

      if (upsertError) {
        console.error("scrape_cache upsert failed:", upsertError);
        // Fallback: try insert instead of upsert
        const { error: insertError } = await supabaseAdmin.from("scrape_cache").insert({
          user_id: userId,
          url: websiteUrl,
          source_type: "website",
          content: content.slice(0, 10000),
          style_hints: styleHints ? styleHints.slice(0, 3000) : null,
        });
        if (insertError) console.error("scrape_cache insert fallback also failed:", insertError);
      }
    }

    return new Response(JSON.stringify({ success: true, cached: false, hasContent: !!content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("pre-scrape error:", e);
    return new Response(JSON.stringify({ error: "scrape failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
