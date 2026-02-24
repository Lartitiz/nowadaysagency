import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic, getDefaultModel } from "../_shared/anthropic.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, selected_text, action_prompt } = await req.json();
    if (!selected_text || !action_prompt) {
      return new Response(JSON.stringify({ error: "Missing selected_text or action_prompt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lightweight branding context
    let brandContext = "";
    if (user_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: bp } = await supabase
        .from("brand_profile")
        .select("positioning, tone_keywords, tone_description, tone_do, tone_dont")
        .eq("user_id", user_id)
        .maybeSingle();

      if (bp) {
        const parts: string[] = [];
        if (bp.positioning) parts.push(`Positionnement : ${bp.positioning}`);
        if (bp.tone_description) parts.push(`Ton : ${bp.tone_description}`);
        if (bp.tone_keywords) parts.push(`Mots-clés de ton : ${JSON.stringify(bp.tone_keywords)}`);
        if (bp.tone_do) parts.push(`À faire : ${bp.tone_do}`);
        if (bp.tone_dont) parts.push(`À éviter : ${bp.tone_dont}`);
        if (parts.length > 0) brandContext = `\n\nCONTEXTE MARQUE :\n${parts.join("\n")}`;
      }
    }

    const systemPrompt = `Tu es l'assistante communication de Nowadays. Tu aides une créatrice à améliorer son contenu.${brandContext}

RÈGLES :
- Retourne UNIQUEMENT le texte modifié, rien d'autre
- Pas de guillemets autour
- Pas d'explication, pas de commentaire
- Garde le ton de la cliente
- Même langue que le texte original`;

    const result = await callAnthropic({
      model: getDefaultModel(),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `TEXTE SÉLECTIONNÉ :\n"${selected_text}"\n\nINSTRUCTION : ${action_prompt}`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    });

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-text-action error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
