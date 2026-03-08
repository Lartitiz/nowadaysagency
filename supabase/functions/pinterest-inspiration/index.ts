import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Non autorisé");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Non autorisé");

    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: wsMember } = await sbAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    const workspaceId = wsMember?.workspace_id;

    const quota = await checkQuota(user.id, "content", workspaceId);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reqBody = await req.json();
    validateInput(reqBody, z.object({
      image_base64: z.string().min(1).max(10000000),
      workspace_id: z.string().uuid().optional().nullable(),
    }).passthrough());

    const filterWs = reqBody.workspace_id || workspaceId;

    const ctx = await getUserContext(sbAdmin, user.id, filterWs);
    const contextText = formatContextForAI(ctx, CONTEXT_PRESETS.pinterest);

    const systemPrompt = `Tu es une experte Pinterest et directrice de stratégie de contenu. On te montre une capture d'écran d'une épingle Pinterest qui performe bien. Tu dois l'analyser et proposer des adaptations au projet de l'utilisatrice.

ÉTAPE 1 — ANALYSE
Identifie :
- detected_type : "infographie" | "checklist" | "photo_product" | "photo_lifestyle" | "tuto" | "citation" | "liste" | "comparaison"
- structure : description de la structure visuelle (combien de blocs, hiérarchie, disposition)
- keywords : les mots-clés SEO probables (ceux que les gens taperaient pour trouver cette épingle)
- why_it_works : pourquoi cette épingle marche (en 2-3 phrases)
- source_description : résumé en 1 phrase de ce que montre l'épingle

ÉTAPE 2 — PROPOSITIONS
En t'appuyant sur le profil de l'utilisatrice (son métier, ses offres, sa cible, son ton), propose exactement 3 adaptations :
- Chaque proposition a un sujet concret, ancré dans le métier de l'utilisatrice
- Chaque proposition a un angle (pourquoi cet angle est pertinent)
- Chaque proposition a un recommended_output :
  → "visual" si le contenu se prête à une infographie/checklist/schéma (l'outil peut le générer)
  → "photo" si le contenu nécessite une vraie photo (produit, lifestyle, behind the scenes)
- Chaque proposition a un pin_type qui correspond au type de visuel à générer :
  → Pour "visual" : "infographie" | "checklist" | "mini_tuto" | "avant_apres" | "schema_visuel"
  → Pour "photo" : "photo_product" | "photo_lifestyle" | "photo_flat_lay"
- Chaque proposition a un brief (2-3 phrases décrivant le contenu à créer)

RÈGLES :
- Au moins 1 proposition de type "visual" ET au moins 1 de type "photo" (sauf si l'épingle source est clairement 100% texte/infographie, auquel cas les 3 peuvent être "visual")
- Les sujets doivent être SPÉCIFIQUES au métier de l'utilisatrice, pas génériques
- Les mots-clés doivent être adaptés à la cible de l'utilisatrice
- Le ton des propositions respecte le ton de l'utilisatrice (tutoiement, écriture inclusive si applicable)

FORMAT DE RÉPONSE (JSON strict, rien d'autre) :
{
  "analysis": {
    "detected_type": "...",
    "structure": "...",
    "keywords": ["...", "..."],
    "why_it_works": "...",
    "source_description": "..."
  },
  "proposals": [
    {
      "id": "a",
      "subject": "...",
      "angle": "...",
      "recommended_output": "visual",
      "pin_type": "infographie",
      "brief": "..."
    },
    {
      "id": "b",
      "subject": "...",
      "angle": "...",
      "recommended_output": "photo",
      "pin_type": "photo_lifestyle",
      "brief": "..."
    },
    {
      "id": "c",
      "subject": "...",
      "angle": "...",
      "recommended_output": "visual",
      "pin_type": "checklist",
      "brief": "..."
    }
  ]
}`;

    const rawBase64 = reqBody.image_base64.replace(/^data:image\/[a-z]+;base64,/, "");

    const messages = [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: rawBase64 },
        },
        {
          type: "text",
          text: `Analyse cette épingle Pinterest et propose 3 adaptations pour cette utilisatrice.\n\nCONTEXTE BRANDING :\n${contextText}`,
        },
      ],
    }];

    const model = "claude-opus-4-6" as any;

    const rawResponse = await callAnthropic({
      model,
      system: systemPrompt,
      messages,
      temperature: 0.6,
      max_tokens: 4096,
    });

    let result: any;
    try {
      let cleaned = rawResponse.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (parseErr) {
      console.error("Failed to parse pinterest-inspiration response:", rawResponse.slice(0, 500));
      try {
        let start = rawResponse.indexOf("{");
        if (start === -1) throw parseErr;
        let depth = 0;
        let end = start;
        for (let i = start; i < rawResponse.length; i++) {
          if (rawResponse[i] === "{") depth++;
          else if (rawResponse[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        result = JSON.parse(rawResponse.slice(start, end + 1));
      } catch {
        throw new Error("L'IA n'a pas retourné un format valide. Réessaie.");
      }
    }

    await logUsage(user.id, "content", "pinterest_inspiration", undefined, model, workspaceId);

    return new Response(JSON.stringify({ result, remaining: quota.remaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("pinterest-inspiration error:", err);
    if (err.message === "Non autorisé") {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
