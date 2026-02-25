import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Token manquant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch and validate the link
    const { data: link, error: linkErr } = await supabase
      .from("shared_branding_links")
      .select("*")
      .eq("token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (linkErr || !link) {
      return new Response(
        JSON.stringify({ error: "Lien invalide ou introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Ce lien a expiré" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = link.user_id;

    // Increment views_count
    await supabase
      .from("shared_branding_links")
      .update({ views_count: (link.views_count || 0) + 1 })
      .eq("id", link.id);

    // Fetch all branding data in parallel
    const [
      profileRes, storyRes, personaRes, brandRes, propRes, stratRes, offersRes,
    ] = await Promise.all([
      supabase.from("profiles").select("prenom, activite, mission").eq("user_id", userId).maybeSingle(),
      supabase.from("storytelling").select("step_7_polished, pitch_short, pitch_medium, pitch_long").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
      supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches, step_4_beautiful, step_4_inspiring, step_4_repulsive, step_4_feeling, portrait").eq("user_id", userId).maybeSingle(),
      supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, mission").eq("user_id", userId).maybeSingle(),
      supabase.from("brand_proposition").select("version_final, version_one_liner, version_bio, version_pitch_naturel, version_site_web, version_engagee").eq("user_id", userId).maybeSingle(),
      supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept, facet_1, facet_2, facet_3").eq("user_id", userId).maybeSingle(),
      supabase.from("offers").select("name, offer_type, price_text, promise, sales_line, target_ideal").eq("user_id", userId).order("created_at"),
    ]);

    const result = {
      title: link.title,
      profile: {
        prenom: profileRes.data?.prenom || null,
        activite: profileRes.data?.activite || null,
        mission: profileRes.data?.mission || brandRes.data?.mission || null,
      },
      storytelling: storyRes.data || null,
      persona: personaRes.data || null,
      voice: brandRes.data || null,
      proposition: propRes.data || null,
      strategy: stratRes.data || null,
      offers: offersRes.data || [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("shared-branding-access error:", e);
    return new Response(
      JSON.stringify({ error: "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
