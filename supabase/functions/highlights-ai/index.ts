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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { type } = body;

    // Fetch branding context
    const [profileRes, toneRes, propositionRes, personaRes, strategyRes, storytellingRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_proposition").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("persona").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_strategy").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("storytelling").select("*").eq("user_id", user.id).eq("is_primary", true).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const tone = toneRes.data;
    const proposition = propositionRes.data;
    const persona = personaRes.data;
    const strategy = strategyRes.data;
    const storytelling = storytellingRes.data;

    const brandingBlock = `
BRANDING DE L'UTILISATRICE :
- Activité : ${profile?.activite || "non renseignée"}
- Offre : ${profile?.offre || tone?.offer || "non renseignée"}
- Mission : ${profile?.mission || tone?.mission || "non renseignée"}
- Proposition de valeur : ${proposition?.version_final || proposition?.version_short || "non renseignée"}
- Proposition courte (bio) : ${proposition?.version_bio || "non renseignée"}
- Storytelling résumé : ${storytelling?.pitch_short || storytelling?.pitch_medium || "non renseigné"}
- Persona frustrations : ${persona?.step_1_frustrations || "non renseignées"}
- Persona transformation : ${persona?.step_2_transformation || "non renseignée"}
- Persona objections : ${persona?.step_3a_objections || "non renseignées"}
- Combats / cause : ${tone?.combat_cause || "non renseignés"}
- Pilier majeur : ${strategy?.pillar_major || "non renseigné"}
- Piliers mineurs : ${[strategy?.pillar_minor_1, strategy?.pillar_minor_2, strategy?.pillar_minor_3].filter(Boolean).join(", ") || "non renseignés"}
- Ton & style : ${tone?.voice_description || "non renseigné"}
- Registre : ${tone?.tone_register || "non renseigné"}
- Canaux : ${(profile?.canaux || tone?.channels || []).join(", ") || "instagram"}
`;

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "generate") {
      systemPrompt = `Tu es expert·e en stratégie Instagram pour des solopreneuses créatives et éthiques.

${brandingBlock}

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
- Les autres catégories sont personnalisées selon l'activité (coulisses, FAQ, valeurs, processus, before/after, etc.)
- Les titres doivent être courts et mémorables (pas de phrases, des mots-clés)
- Le ton des stories doit correspondre au ton & style de l'utilisatrice
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

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
      systemPrompt = `Tu es expert·e en stratégie Instagram pour des solopreneuses créatives et éthiques.

${brandingBlock}

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
- Si elle fait déjà du contenu récurrent en stories, intègre-le dans la bonne catégorie

Même format JSON que précédemment. Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.`;
      userPrompt = "Affine mes catégories avec mes réponses.";

    } else {
      return new Response(JSON.stringify({ error: "Type inconnu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans quelques instants." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("highlights-ai error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
