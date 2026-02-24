import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getDefaultModel } from "../_shared/anthropic.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { corsHeaders } from "../_shared/cors.ts";

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Non authentifié");

    const { force } = await req.json().catch(() => ({ force: false }));

    // Check quota
    const quota = await checkQuota(user.id, "content");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all branding data
    const ctx = await getUserContext(
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
      user.id
    );
    const brandingText = formatContextForAI(ctx, {
      includeStory: true,
      includePersona: true,
      includeOffers: true,
      includeProfile: true,
      includeEditorial: true,
      includeAudit: true,
    });

    const currentHash = hashString(brandingText);

    // Check cache unless forced
    if (!force) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: cached } = await sb
        .from("branding_summary")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cached && cached.branding_hash === currentHash && cached.summaries) {
        return new Response(JSON.stringify({
          summaries: cached.summaries,
          generated_at: cached.generated_at,
          from_cache: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate with AI
    const systemPrompt = `Tu es une experte en communication et branding pour solopreneuses créatives.

L'utilisatrice a rempli son branding complet. Génère des résumés COURTS et PERCUTANTS pour sa fiche synthèse.

RÈGLES ABSOLUES :

- Chaque résumé fait 2-3 phrases MAXIMUM. C'est une carte de visite stratégique, pas un dossier.

- Pas de tirets longs. Utilise : ou ; à la place.

- Écriture inclusive avec point médian (créatrice·s, engagé·e).

- Ton direct, chaleureux, pro. Comme une conversation entre ami·es.

- Chaque mot compte. Zéro remplissage.

- Pour les "key_points" : des phrases courtes et percutantes, pas des paragraphes.

STRUCTURE DES RÉSUMÉS :

Pour "combats" : une phrase d'accroche forte qui résume LA cause + 3-4 points clés courts (1 phrase chacun) qui résument les combats concrets.

Pour "unique" : une phrase d'accroche forte + 3-4 points clés courts.

Pour "voice_layers" : chaque couche = son nom + 1 phrase max qui capture l'essentiel.

Pour les expressions clés : garde-les telles quelles mais limite à 8-10 max.

Retourne UNIQUEMENT un JSON valide, sans markdown, sans backticks :

{

  "positioning_summary": "2-3 phrases max sur son positionnement",

  "unique_hook": "1 phrase d'accroche forte sur ce qui la rend unique",

  "unique_points": ["point clé 1 (1 phrase)", "point clé 2", "point clé 3"],

  "target_summary": "2-3 phrases max sur sa cible",

  "target_quote": "LA phrase signature de la cible (1 seule, entre guillemets)",

  "tone_summary": "2-3 phrases max sur son ton",

  "tone_keywords": ["mot1", "mot2", "mot3", "mot4", "mot5"],

  "tone_avoid": ["mot1", "mot2", "mot3"],

  "voice_layers": [

    {"name": "Directe et chaleureuse", "summary": "1 phrase max"},

    {"name": "Orale et incarnée", "summary": "1 phrase max"},

    {"name": "Rythmée par contrastes", "summary": "1 phrase max"}

  ],

  "expressions_key": ["expression1", "expression2", "expression3"],

  "combats_hook": "1 phrase d'accroche forte sur LA cause",

  "combats_points": ["combat concret 1 (1 phrase)", "combat 2", "combat 3"],

  "combats_alternative": "1-2 phrases sur ce qu'elle propose à la place",

  "story_summary": "2-3 phrases max sur son histoire",

  "story_before": "1 phrase : le avant",

  "story_trigger": "1 phrase : le déclic",

  "story_after": "1 phrase : le après",

  "twist_summary": "2-3 phrases max sur son twist créatif",

  "twist_formula": "1 phrase signature créative",

  "offers_summaries": [

    {"name": "Nom offre", "one_liner": "1 phrase percutante qui résume l'offre"}

  ]

}

Si une section n'a pas de données, mets null pour cette clé. Pour les arrays vides, mets [].`;

    const raw = await callAnthropicSimple(
      getDefaultModel(),
      systemPrompt,
      `Voici les données complètes du branding :\n\n${brandingText}`,
      0.7,
      2048
    );

    // Parse JSON from response
    let summaries: any;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      summaries = JSON.parse(jsonMatch?.[0] || raw);
    } catch {
      console.error("Failed to parse AI response:", raw);
      throw new Error("Erreur lors de la génération des résumés");
    }

    // Save to cache (upsert)
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await sb.from("branding_summary").upsert({
      user_id: user.id,
      summaries,
      branding_hash: currentHash,
      generated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    // Log usage
    await logUsage(user.id, "content", "branding_summary", undefined, "claude-sonnet-4-5");

    return new Response(JSON.stringify({
      summaries,
      generated_at: new Date().toISOString(),
      from_cache: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-branding-summary error:", e);
    const status = e instanceof Error && "status" in e ? (e as any).status : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur interne" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
