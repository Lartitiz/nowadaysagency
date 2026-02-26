import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anthropic API key checked in shared helper

    const body = await req.json();
    const { texts } = validateInput(body, z.object({
      texts: z.array(z.string().max(5000)).min(1, "Fournis au moins 1 texte.").max(10),
    }));

    const textsBlock = texts.map((t: string, i: number) => `TEXTE ${i + 1} :\n"""${t.slice(0, 3000)}"""`).join("\n\n");

    const systemPrompt = `Tu es experte en analyse de style d'écriture. Tu identifies ce qui rend une voix UNIQUE.

Analyse ces textes et identifie le style d'écriture unique de cette personne.

${textsBlock}

RETOURNE un JSON strict :
{
  "structure_patterns": [
    "pattern 1 (max 5 patterns, spécifiques à cette personne)"
  ],
  "tone_patterns": [
    "pattern 1 (max 5 patterns)"
  ],
  "signature_expressions": ["mot1", "mot2", "expression1"],
  "voice_summary": "Tu parles comme... (phrase en 'tu', sincère, 2-3 phrases max)",
  "formatting_habits": [
    "habitude 1 (max 3)"
  ]
}

RÈGLES :
- Identifie ce qui est SPÉCIFIQUE à cette personne, pas des généralités
- Les expressions signature doivent être des mots/tournures réellement présents dans les textes
- La phrase résumé doit être en "tu" et sonner comme un compliment sincère
- Max 5 points par catégorie
- Réponds UNIQUEMENT avec le JSON`;

    const quotaCheck = await checkQuota(user.id, "bio_profile");
    if (!quotaCheck.allowed) {
      return new Response(JSON.stringify({ error: quotaCheck.message }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawContent = await callAnthropicSimple(
      getModelForAction("voice"),
      systemPrompt + "\n\n" + ANTI_SLOP,
      "Analyse ces textes et retourne le profil de voix."
    );

    let parsed;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Impossible de parser la réponse IA");
    }

    await logUsage(user.id, "bio_profile", "voice_analysis");

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("voice-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
