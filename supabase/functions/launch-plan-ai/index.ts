import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const { launch, phases, template_type, extra_weekly_hours, editorial_time, preferred_formats, rhythm } = body;

    // Fetch full user context server-side
    const ctx = await getUserContext(supabase, user.id);
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.launch);

    const phasesStr = (phases || []).map((p: any) => `- ${p.emoji} ${p.label}: du ${p.start_date} au ${p.end_date}`).join("\n");
    const totalWeeklyHours = (editorial_time || 3) + (extra_weekly_hours || 0);

    const systemPrompt = `Tu es experte en stratégie de lancement Instagram pour des solopreneuses créatives et éthiques.

${contextStr}

DONNÉES DU LANCEMENT :
- Offre : "${launch?.name || ""}"
- Promesse : "${launch?.promise || ""}"
- Objections anticipées : "${launch?.objections || ""}"
- Lead magnet : "${launch?.free_resource || "aucun"}"
- Contenus prévus par l'utilisatrice : ${(launch?.selected_contents || []).join(", ") || "aucun"}

TEMPLATE CHOISI : ${template_type || "moyen"}
PHASES :
${phasesStr}

TEMPS DISPONIBLE : ${totalWeeklyHours}h/semaine
FORMATS PRÉFÉRÉS : ${(preferred_formats || []).join(", ") || "carrousel, reel, story"}
RYTHME HABITUEL : ${rhythm || "3 posts/semaine"}

---

Génère un PLAN DE SLOTS pour ce lancement. Chaque slot est un emplacement SANS TEXTE.

RÈGLES :
1. Adapte le NOMBRE de contenus au temps disponible :
   - 1-2h/sem → max 2-3 contenus/semaine
   - 3-4h/sem → max 4-5 contenus/semaine
   - 5-6h/sem → max 6-7 contenus/semaine
   - 7h+/sem → max 8-10 contenus/semaine

2. Chaque phase a un MIX valeur/vente adapté au moment du lancement :
   - Phases de préparation/pré-lancement : 80-100% valeur, 0-20% vente
   - Phases de chauffage/teasing : 50-70% valeur, 30-50% vente
   - Phases de vente/révélation : 20-30% valeur, 70-80% vente
   - Phases de closing : 10-20% valeur, 80-90% vente

3. INTÈGRE les contenus prévus par l'utilisatrice dans le plan aux bons moments.
4. Traite CHAQUE objection dans au moins 1 slot.
5. Alterne les formats (pas 5 carrousels d'affilée).
6. Utilise les formats préférés de l'utilisatrice en priorité.
7. L'angle_suggestion est une phrase courte qui donne une direction créative, pas un texte à publier.
8. Pour chaque slot, indique ratio_category "valeur" ou "vente".
9. Pour le plan long (6-8 sem), intègre une MINI-FICTION en 5 chapitres.

GARDE-FOUS ÉTHIQUES — OBLIGATOIRES :
- PAS de fausse urgence
- PAS de shaming
- PAS de promesses de résultats garantis
- PAS de CTA agressifs
- PAS de FOMO artificiel
- L'urgence vient de la logistique, pas de la manipulation
- Chaque contenu a de la valeur même pour celles qui n'achètent pas

PRIORITÉ VOIX : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature. Respecte les expressions interdites. Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.

TYPES DE CONTENU DISPONIBLES :
Visibilité : coup_de_gueule_doux (🔥), conseil_contre_intuitif (💡), enigme_teaser (🧩), tendance (📈), diagnostic (🔍)
Confiance : storytelling_personnel (📖), coulisses (👀), educatif_autorite (🎓), question_engagement (💬), valeurs_combat (🌱), live_qa (🎤), comparatif (⚖️), mini_fiction (📖)
Vente : annonce_revelation (🚀), presentation_offre (🎁), objections_faq (🛡️), preuve_sociale (🏆), pour_qui (🎯), derniere_chance (⏰), bonus_early_bird (📦), story_sequence_vente (📱), story_sequence_faq (❓), story_sequence_temoignage (💬), story_sequence_objection (🛡️), story_sequence_last_call (⏰), dm_strategiques (💌)
Post-lancement : remerciement (🙏), bilan (📊), story_sequence_bienvenue (🎉)

FORMATS : post_carrousel, post_photo, reel, story_serie, story, live

Réponds UNIQUEMENT en JSON :
{
  "total_slots": <number>,
  "estimated_weekly_hours": <number>,
  "phases": [
    {
      "name": "<phase_name>",
      "label": "<emoji> <label>",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "slots": [
        {
          "date": "YYYY-MM-DD",
          "format": "<format>",
          "content_type": "<content_type_id>",
          "content_type_emoji": "<emoji>",
          "category": "<visibilite|confiance|vente|post_lancement>",
          "objective": "<1 phrase>",
          "angle_suggestion": "<1 phrase courte>",
          "ratio_category": "<valeur|vente>",
          "chapter": <number|null>,
          "chapter_label": "<string|null>"
        }
      ]
    }
  ]
}`;

    const content = await callAnthropicSimple(getModelForAction("launch"), systemPrompt, "Génère mon plan de slots de lancement.", 0.7);

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Format de réponse inattendu");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
