import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple } from "../_shared/anthropic.ts";
import { logUsage } from "../_shared/plan-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { idea } = await req.json();
    if (!idea) throw new Error("Missing idea");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get user context
    let userContext = "";
    if (authHeader) {
      const anonSb = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonSb.auth.getUser(authHeader.replace("Bearer ", ""));
      if (user) {
        const [profileRes, brandRes, configRes] = await Promise.all([
          sb.from("profiles").select("activite, cible").eq("user_id", user.id).maybeSingle(),
          sb.from("brand_profile").select("mission, offer, target_description, channels").eq("user_id", user.id).maybeSingle(),
          sb.from("user_plan_config").select("channels").eq("user_id", user.id).maybeSingle(),
        ]);
        const p = profileRes.data;
        const b = brandRes.data;
        const c = configRes.data;
        if (p?.activite) userContext += `\nActivité : ${p.activite}`;
        if (b?.target_description || p?.cible) userContext += `\nCible : ${b?.target_description || p?.cible}`;
        if (b?.mission) userContext += `\nMission : ${b.mission}`;
        const channels = (c?.channels as string[]) || (b?.channels as string[]) || [];
        if (channels.length > 0) userContext += `\nCanaux actifs : ${channels.join(", ")}`;
      }
    }

    const prompt = `L'utilisatrice a une idée de contenu mais ne sait pas quel format choisir. Analyse son idée et recommande le meilleur format.

Formats disponibles :
- post : Post Instagram (texte, image, carrousel). Idéal pour storytelling, partage d'expertise, contenus longs.
- reel : Reel Instagram (vidéo courte). Idéal pour tutos rapides, tendances, avant/après, contenus dynamiques.
- story : Story Instagram (séquence éphémère). Idéal pour coulisses, sondages, questions, contenus spontanés.
- linkedin : Post LinkedIn. Idéal pour expertise, réflexions pro, retours d'expérience.

Idée de l'utilisatrice : ${idea}
${userContext ? `\nContexte utilisatrice :${userContext}` : ""}

Réponds UNIQUEMENT en JSON valide (pas de markdown), avec ces champs :
{
  "format": "post" | "reel" | "story" | "linkedin",
  "format_label": "Post Instagram",
  "suggested_angle": "Storytelling personnel + leçon",
  "objective": "visibilite" | "confiance" | "vente" | "credibilite",
  "objective_label": "Confiance (créer du lien)",
  "reason": "Une phrase expliquant pourquoi ce format est adapté."
}`;

    const text = await callAnthropicSimple("claude-sonnet-4-5-20250929", "", prompt, 0.7, 400);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Invalid AI response");
    const suggestion = JSON.parse(jsonMatch[0]);

    // Log usage if user is authenticated
    if (authHeader) {
      const anonSb2 = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user: logUser } } = await anonSb2.auth.getUser(authHeader.replace("Bearer ", ""));
      if (logUser) {
        await logUsage(logUser.id, "suggestion", "suggest_format");
      }
    }

    return new Response(JSON.stringify(suggestion), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("suggest-format error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
