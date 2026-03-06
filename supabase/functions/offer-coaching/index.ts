import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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
    // Check plan limits
    const usageCheck = await checkQuota(user.id, "content");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reqBody = await req.json();
    validateInput(reqBody, z.object({
      step: z.number().min(1).max(20),
      answer: z.string().max(5000).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
    }).passthrough());
    const { step, answer, offerData, workspace_id } = reqBody;

    // Fetch full user context server-side for richer coaching
    const ctx = await getUserContext(supabase, user.id, workspace_id);
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.offerCoaching);

    const stepPrompts: Record<number, string> = {
      2: `L'utilisatrice décrit le problème que son offre résout.
Sa réponse : "${answer}"
Son offre : ${offerData?.name || "non nommée"} - ${offerData?.description_short || ""}

Analyse sa réponse. Si elle reste en surface (symptômes, problèmes techniques), pose 2-3 questions pour creuser vers :
- Le problème ÉMOTIONNEL (ce qu'elle ressent)
- Le problème IDENTITAIRE (ce qu'elle croit sur elle-même)
- Le problème CONCRET (ce que ça lui coûte en €, en temps, en énergie)

Formule ensuite le problème profond en 1-2 phrases.
Ton : direct, bienveillant, comme une coach.

Retourne un JSON :
{
  "reaction": "Ton analyse et tes questions de relance (texte formaté, 3-5 lignes max)",
  "deep_problem": "Le problème profond reformulé en 1-2 phrases (ou null si pas encore assez d'infos)",
  "follow_up_questions": ["Question 1", "Question 2"]
}`,

      3: `L'utilisatrice formule la promesse de son offre.
Sa réponse : "${answer}"
Son offre : ${offerData?.name || ""} (${offerData?.offer_type || "paid"})
Problème profond identifié : ${offerData?.problem_deep || offerData?.problem_surface || "non renseigné"}

Challenge sa promesse :
- Est-ce qu'elle décrit ce qu'ELLE fait ou ce que la CLIENTE obtient ?
- Propose la formule "Je t'aide à [résultat] sans [frustration]"
- Génère 3 reformulations de sa promesse (A, B, C)

Retourne un JSON :
{
  "reaction": "Ton analyse de sa promesse (2-3 lignes)",
  "suggestions": [
    {"label": "A", "text": "Reformulation A"},
    {"label": "B", "text": "Reformulation B"},
    {"label": "C", "text": "Reformulation C"}
  ]
}`,

      4: `L'utilisatrice liste les features de son offre.
Ses features : "${answer}"
Son offre : ${offerData?.name || ""}
Sa promesse : ${offerData?.promise || ""}

Transforme CHAQUE feature en bénéfice client. Le bénéfice = ce que la cliente RESSENT ou OBTIENT concrètement.

Retourne un JSON :
{
  "reaction": "Un court paragraphe encourageant (1-2 lignes)",
  "features_to_benefits": [
    {"feature": "La feature exacte", "benefit": "Ce que la cliente entend/obtient"},
    ...
  ],
  "tip": "Un conseil pour utiliser les bénéfices (1 ligne)"
}`,

      5: `L'utilisatrice décrit sa cible idéale et non-idéale.
Cible idéale : "${answer}"
Pas pour qui : "${offerData?.target_not_for || ""}"
Son offre : ${offerData?.name || ""}

Pose 1-2 questions personnalisées pour affiner :
- La situation DÉCLENCHEUSE qui fait que quelqu'un se dit "il me faut ça"
- Les limites de sa cible (trop débutante ? trop avancée ?)

Retourne un JSON :
{
  "reaction": "Analyse de sa cible (2-3 lignes)",
  "follow_up_questions": ["Question personnalisée 1", "Question personnalisée 2"]
}`,

      6: `L'utilisatrice liste les objections de ses prospects.
Ses objections : "${answer}"
Son offre : ${offerData?.name || ""} - ${offerData?.price_text || ""}
Sa promesse : ${offerData?.promise || ""}

Génère une réponse persuasive mais éthique pour chaque objection. Pas de manipulation, pas de fausse urgence.

Retourne un JSON :
{
  "objections": [
    {"objection": "L'objection exacte", "emoji": "💰", "response": "La réponse (3-4 lignes max)"},
    ...
  ]
}`,

      7: `Synthétise toute la fiche offre de l'utilisatrice.
Offre : ${offerData?.name || ""}
Type : ${offerData?.offer_type || "paid"}
Prix : ${offerData?.price_text || ""}
Problème de surface : ${offerData?.problem_surface || ""}
Problème profond : ${offerData?.problem_deep || ""}
Promesse : ${offerData?.promise || ""}
Features : ${JSON.stringify(offerData?.features || [])}
Bénéfices : ${JSON.stringify(offerData?.benefits || [])}
Cible idéale : ${offerData?.target_ideal || ""}
Pas pour qui : ${offerData?.target_not_for || ""}
Objections : ${JSON.stringify(offerData?.objections || [])}
Témoignages : ${JSON.stringify(offerData?.testimonials || [])}

Crée une synthèse émotionnelle complète :

Retourne un JSON :
{
  "problem_summary": "Le problème profond en 1-2 phrases",
  "promise_summary": "La promesse en 1 phrase",
  "before": "Description de l'état AVANT (3-4 points)",
  "after": "Description de l'état APRÈS (3-4 points)",
  "feelings": ["Émotion 1", "Émotion 2", "Émotion 3", "Émotion 4"],
  "sales_line": "LA phrase de vente en 1 ligne",
  "sales_line_long": "La version longue (2-3 phrases)"
}`,
    };

    const systemPrompt = `Tu es un coach en positionnement d'offre. Tu aides des solopreneuses à formuler leurs offres de manière désirable et éthique.

${contextStr}

Ton : direct, chaleureux, comme une coach bienveillante. Pas de jargon marketing. Tu parles comme à une amie qui est experte.

IMPORTANT : chaque question doit être SPÉCIFIQUE à la réponse de l'utilisatrice, pas générique. Utilise le contexte de sa marque, son positionnement et sa cible pour personnaliser tes questions et reformulations.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.`;

    // Anthropic API key checked in shared helper

    const userPrompt = stepPrompts[step] || `L'utilisatrice a répondu "${answer}" à l'étape ${step}. Analyse sa réponse et donne un feedback personnalisé. Retourne un JSON avec "reaction" (string).`;

    const content = await callAnthropicSimple(getModelForAction("offer"), BASE_SYSTEM_RULES + "\n\n" + systemPrompt + "\n\n" + ANTI_SLOP, userPrompt, 0.7, 2000) || "{}";
    
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { reaction: content };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
