import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const { launch, phases, template_type, extra_weekly_hours, editorial_time, preferred_formats, rhythm } = body;

    // Fetch branding context
    const [profileRes, personaRes, toneRes, stratRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("persona").select("step_1_frustrations, step_3a_objections").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("combat_cause, combat_fights, combat_alternative").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3").eq("user_id", user.id).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const persona = personaRes.data;
    const tone = toneRes.data;
    const strat = stratRes.data;

    const piliers = [strat?.pillar_major, strat?.pillar_minor_1, strat?.pillar_minor_2, strat?.pillar_minor_3].filter(Boolean);

    const phasesStr = (phases || []).map((p: any) => `- ${p.emoji} ${p.label}: du ${p.start_date} au ${p.end_date}`).join("\n");

    const totalWeeklyHours = (editorial_time || 3) + (extra_weekly_hours || 0);

    const systemPrompt = `Tu es experte en stratégie de lancement Instagram pour des solopreneuses créatives et éthiques.

DONNÉES DU LANCEMENT :
- Offre : "${launch?.name || ""}"
- Promesse : "${launch?.promise || ""}"
- Objections anticipées : "${launch?.objections || ""}"
- Lead magnet : "${launch?.free_resource || "aucun"}"
- Contenus prévus par l'utilisatrice : ${(launch?.selected_contents || []).join(", ") || "aucun"}

TEMPLATE CHOISI : ${template_type || "classique"}
PHASES :
${phasesStr}

TEMPS DISPONIBLE : ${totalWeeklyHours}h/semaine
FORMATS PRÉFÉRÉS : ${(preferred_formats || []).join(", ") || "carrousel, reel, story"}
RYTHME HABITUEL : ${rhythm || "3 posts/semaine"}

BRANDING :
- Activité : ${profile?.activite || "?"}
- Cible : ${profile?.cible || "?"}
- Persona frustrations : ${persona?.step_1_frustrations || "?"}
- Persona objections : ${persona?.step_3a_objections || "?"}
- Combats : ${tone?.combat_cause || "?"} / ${tone?.combat_fights || "?"}
- Piliers de contenu : ${piliers.join(", ") || "?"}

---

Génère un PLAN DE SLOTS pour ce lancement. Chaque slot est un emplacement SANS TEXTE.

RÈGLES :
1. Adapte le NOMBRE de contenus au temps disponible :
   - 1-2h/sem → max 2-3 contenus/semaine
   - 3-4h/sem → max 4-5 contenus/semaine
   - 5-6h/sem → max 6-7 contenus/semaine
   - 7h+/sem → max 8-10 contenus/semaine

2. Chaque phase a un MIX de catégories adapté :
   - Pré-teasing / planification / distribution : 60% visibilité, 30% confiance, 10% vente
   - Teasing / captation : 30% visibilité, 50% confiance, 20% vente
   - Vente / événement : 10% visibilité, 30% confiance, 60% vente
   - Post-lancement : 0% visibilité, 70% confiance, 30% vente

3. INTÈGRE les contenus prévus par l'utilisatrice dans le plan aux bons moments.

4. Traite CHAQUE objection dans au moins 1 slot.

5. Alterne les formats (pas 5 carrousels d'affilée).

6. Utilise les formats préférés de l'utilisatrice en priorité.

7. L'angle_suggestion est une phrase courte qui donne une direction créative,
   pas un texte à publier.

TYPES DE CONTENU DISPONIBLES :
Visibilité : coup_de_gueule_doux (🔥), conseil_contre_intuitif (💡), enigme_teaser (🧩), tendance (📈)
Confiance : storytelling_personnel (📖), coulisses (👀), educatif_autorite (🎓), question_engagement (💬), valeurs_combat (🌱)
Vente : annonce_revelation (🚀), presentation_offre (🎁), objections_faq (🛡️), preuve_sociale (🏆), pour_qui (🎯), derniere_chance (⏰), bonus_early_bird (📦)
Post-lancement : remerciement (🙏), bilan (📊)

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
          "angle_suggestion": "<1 phrase courte>"
        }
      ]
    }
  ]
}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Génère mon plan de slots de lancement." },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI API error: ${res.status} ${errText}`);
    }

    const aiData = await res.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response
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
