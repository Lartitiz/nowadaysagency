import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple } from "../_shared/anthropic.ts";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const systemPrompt = `Tu es une experte en communication et branding pour solopreneuses.
L'utilisatrice a rempli son branding complet. Génère un résumé COURT et PERCUTANT de chaque section.
Chaque résumé fait 2-3 phrases maximum. C'est une carte de visite stratégique, pas un dossier.

Les résumés doivent être :
- Courts (2-3 phrases, jamais plus)
- Percutants (chaque mot compte)
- Concrets (pas de généralités)
- Dans le ton de l'utilisatrice

Retourne UNIQUEMENT un JSON valide, sans markdown, sans backticks :
{
  "positioning_summary": "2-3 phrases max sur son positionnement",
  "unique_summary": "2-3 phrases max sur ce qui la rend unique",
  "target_summary": "2-3 phrases max sur sa cible",
  "target_quote": "LA phrase signature de la cible (1 seule, entre guillemets)",
  "tone_summary": "2-3 phrases max sur son ton",
  "tone_keywords": ["mot1", "mot2", "mot3", "mot4", "mot5"],
  "tone_avoid": ["mot1", "mot2", "mot3"],
  "story_summary": "2-3 phrases max sur son histoire",
  "twist_summary": "2-3 phrases max sur son twist créatif",
  "twist_formula": "1 phrase signature créative"
}

Si une section n'a pas de données, mets null pour cette clé.`;

    const raw = await callAnthropicSimple(
      "claude-sonnet-4-5-20250929",
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
