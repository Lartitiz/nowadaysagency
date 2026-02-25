import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI } from "../_shared/user-context.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Unauthorized");

    const { changed_field, old_value, new_value, workspace_id } = await req.json();
    if (!changed_field || !old_value || !new_value) {
      return new Response(JSON.stringify({ suggestions: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get full user context
    const ctx = await getUserContext(supabase, user.id, workspace_id);
    const contextText = formatContextForAI(ctx, {
      includeStory: true, includePersona: true, includeOffers: true,
      includeProfile: true, includeEditorial: true, includeAudit: false,
    });

    // Field label mapping for the prompt
    const fieldLabels: Record<string, string> = {
      positioning: "Positionnement",
      mission: "Mission",
      values: "Valeurs",
      tone_keywords: "Mots-clés de ton",
      value_prop_sentence: "Proposition de valeur",
      content_pillars: "Piliers de contenu",
      voice_description: "Description de la voix",
      combat_cause: "Cause / combat",
      combat_fights: "Combats",
      pillar_major: "Pilier majeur",
      creative_concept: "Concept créatif",
      version_final: "Proposition de valeur favorite",
      version_one_liner: "One-liner",
      step_1_frustrations: "Frustrations de la cible",
      step_2_transformation: "Transformation rêvée",
    };

    const fieldLabel = fieldLabels[changed_field] || changed_field;

    const prompt = `La cliente a modifié son champ "${fieldLabel}" dans son branding.

Avant : "${old_value}"
Après : "${new_value}"

${contextText}

Analyse ce changement et identifie les sections existantes qui devraient être mises à jour pour rester cohérentes avec ce changement.

Pour chaque incohérence détectée, retourne un objet avec :
- section : identifiant technique (ex: "instagram_bio", "value_proposition", "content_pillars", "offers", "persona", "tone_style", "storytelling")
- icon : un emoji pertinent
- title : titre lisible en français
- reason : explication courte de l'incohérence
- current_value : la valeur actuelle qui pose problème (extraite du contexte)
- suggested_value : ta proposition concrète de nouvelle valeur
- link : le lien vers la section (utilise ces routes : /branding?section=story, /branding?section=persona, /branding?section=value_proposition, /branding?section=tone_style, /branding?section=content_strategy, /espaces/instagram/bio, /offres)
- impact : "fort" ou "moyen"

RÈGLES :
- Ne retourne QUE les vrais impacts (pas de faux positifs)
- Maximum 5 suggestions
- Priorise par impact (fort > moyen)
- Si le changement est mineur (correction typo, reformulation sans changement de sens), retourne suggestions: []
- Pour chaque suggestion, propose une valeur concrète`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un expert en stratégie de marque. Tu analyses les changements de branding et identifies les incohérences. Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_suggestions",
            description: "Return branding impact suggestions",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      section: { type: "string" },
                      icon: { type: "string" },
                      title: { type: "string" },
                      reason: { type: "string" },
                      current_value: { type: "string" },
                      suggested_value: { type: "string" },
                      link: { type: "string" },
                      impact: { type: "string", enum: ["fort", "moyen"] },
                    },
                    required: ["section", "icon", "title", "reason", "suggested_value", "link", "impact"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_suggestions" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let suggestions: any[] = [];

    // Extract from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    // Save to database if we have suggestions
    if (suggestions.length > 0) {
      await supabase.from("branding_suggestions").insert({
        user_id: user.id,
        trigger_field: changed_field,
        trigger_old_value: old_value,
        trigger_new_value: new_value,
        suggestions,
        status: "pending",
      });
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-branding-impact error:", e);
    return new Response(JSON.stringify({ error: e.message, suggestions: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
