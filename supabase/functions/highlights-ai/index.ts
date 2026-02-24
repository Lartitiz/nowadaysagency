import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FORMAT_STRUCTURES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Anthropic API key checked in shared helper

    // Check plan limits
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { type } = body;

    // Fetch full user context server-side
    const ctx = await getUserContext(supabase, user.id);
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.highlights);

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "generate") {
      systemPrompt = `${CORE_PRINCIPLES}

${FORMAT_STRUCTURES}

${contextStr}

Génère 6 à 8 catégories de stories à la une Instagram personnalisées.

Pour chaque catégorie :

1. TITRE : court (max 15 caractères, c'est la limite Instagram pour l'affichage)
2. EMOJI : un emoji signature pour la couverture
3. RÔLE : en une phrase, le rôle de ce highlight dans le parcours client (ex : "C'est ta page À propos")
4. SÉRIE DE STORIES : 5-8 stories à créer, dans l'ordre. Pour chaque story :
   - Le contenu/message (ce qu'elle dit ou montre)
   - Le format recommandé (texte sur fond coloré / photo + texte / face cam / carrousel story / sticker sondage / sticker question)
   - Un tip de création si pertinent

RÈGLES :
- Les catégories doivent couvrir le parcours client complet : découverte → confiance → achat → fidélisation
- Au minimum inclure : une catégorie "qui suis-je/mon histoire", une catégorie "offre/produit", une catégorie "preuve sociale/avis"
- Les autres catégories sont personnalisées selon l'activité
- Les titres doivent être courts et mémorables
- Le ton des stories doit correspondre au ton & style de l'utilisatrice
- PRIORITÉ VOIX : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature. Respecte les expressions interdites. Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.

Réponds UNIQUEMENT en JSON valide, sans texte avant ni après :
[
  {
    "title": "Mon histoire",
    "emoji": "👑",
    "role": "C'est ta page À propos. Elle crée le lien émotionnel.",
    "stories": [
      {
        "content": "Accroche : 'Tu veux savoir comment tout a commencé ?'",
        "format": "Texte sur fond coloré (couleur de ta marque)",
        "tip": "Utilise une typo manuscrite pour le côté perso"
      }
    ]
  }
]`;
      userPrompt = "Génère mes catégories de stories à la une personnalisées.";

    } else if (type === "refine") {
      const { categories, questions } = body;
      systemPrompt = `${CORE_PRINCIPLES}

${contextStr}

CATÉGORIES DÉJÀ GÉNÉRÉES :
${JSON.stringify(categories, null, 2)}

RÉPONSES DE L'UTILISATRICE :
- Questions fréquentes en DM : "${questions?.frequent_questions || "non renseigné"}"
- Parcours type de sa cliente : "${questions?.client_journey || "non renseigné"}"
- Contenu récurrent en stories : "${questions?.recurring_content || "non renseigné"}"

En te basant sur ses réponses, affine les catégories :
- Ajuste le contenu des séries de stories pour coller à sa réalité
- Ajoute une catégorie si ses réponses révèlent un besoin non couvert
- Supprime ou fusionne des catégories si c'est plus pertinent
- Personnalise les exemples avec des détails concrets tirés de ses réponses

Même format JSON que précédemment. Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.`;
      userPrompt = "Affine mes catégories avec mes réponses.";

    } else {
      return new Response(JSON.stringify({ error: "Type inconnu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const content = await callAnthropicSimple(getModelForAction("highlights"), systemPrompt, userPrompt, 0.8);

    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("highlights-ai error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
