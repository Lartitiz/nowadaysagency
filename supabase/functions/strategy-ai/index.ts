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

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "facets") {
      const { text, facets, profile, persona, tone } = body;
      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

CE QUE L'UTILISATRICE A PARTAGÉ :
"${text || ""}"

SES 3 FACETTES IDENTIFIÉES :
1. "${facets?.[0] || ""}"
2. "${facets?.[1] || ""}"
3. "${facets?.[2] || ""}"

PROFIL :
- Activité : ${profile?.activite || "?"}
- Combats : ${tone?.combat_cause || "non renseignés"}
- Persona : ${persona?.step_1_frustrations ? `Frustrations : ${persona.step_1_frustrations}` : "non renseigné"}

Propose 5 facettes supplémentaires qu'elle pourrait explorer dans sa communication.

Pour chaque facette :
- Le sujet (en une phrase)
- Pourquoi ça connecte avec son audience
- Un format recommandé (story, reel, carrousel, newsletter)
- Une accroche de post possible

Ton chaleureux et encourageant. Écriture inclusive avec point médian.

Réponds en JSON :
[
  {"facette": "...", "pourquoi": "...", "format": "...", "accroche": "..."},
  ...
]`;
      userPrompt = "Propose-moi des facettes à explorer.";

    } else if (type === "pillars") {
      const { profile, persona, proposition, tone, facets } = body;
      systemPrompt = `Tu es expert·e en stratégie de contenu pour des solopreneuses créatives et éthiques.

TOUT LE BRANDING :
- Persona frustrations : ${persona?.step_1_frustrations || "?"}
- Persona transformation : ${persona?.step_2_transformation || "?"}
- Combats / cause : ${tone?.combat_cause || "?"}
- Proposition de valeur : ${proposition?.version_final || "?"}
- Facettes : ${facets?.join(", ") || "?"}
- Ton / registre : ${tone?.tone_register || "?"}
- Comment elle parle : ${tone?.voice_description || "?"}
- Expressions : ${tone?.key_expressions || "?"}
- Activité : ${profile?.activite || "?"}

Propose une stratégie de piliers de contenu :

1 THÉMATIQUE MAJEURE :
- Le pilier central qui guide tout
- Explique en 1-2 phrases pourquoi
- 3 exemples de sujets concrets

3 THÉMATIQUES MINEURES :
Pour chacune :
- Le pilier
- Explication en 1 phrase
- 3 exemples de sujets concrets

Les piliers ne doivent PAS être le produit/service lui-même mais l'univers autour.

Ton direct. Écriture inclusive avec point médian.

Réponds en JSON :
{
  "majeure": {"pilier": "...", "explication": "...", "sujets": ["...", "...", "..."]},
  "mineures": [
    {"pilier": "...", "explication": "...", "sujets": ["...", "...", "..."]},
    {"pilier": "...", "explication": "...", "sujets": ["...", "...", "..."]},
    {"pilier": "...", "explication": "...", "sujets": ["...", "...", "..."]}
  ]
}`;
      userPrompt = "Suggère-moi des piliers de contenu.";

    } else if (type === "concepts") {
      const { creative_text, profile, persona, proposition, tone, pillars } = body;
      systemPrompt = `Tu es expert·e en création de contenu et branding pour des solopreneuses créatives et éthiques.

BRANDING COMPLET :
- Activité : ${profile?.activite || "?"}
- Piliers de contenu : Majeure = ${pillars?.major || "?"}, Mineures = ${pillars?.minors?.join(", ") || "?"}
- Ton / registre : ${tone?.tone_register || "?"}
- Comment elle parle : ${tone?.voice_description || "?"}
- Expressions : ${tone?.key_expressions || "?"}
- Humour : ${tone?.tone_humor || "?"}
- Combats : ${tone?.combat_cause || "?"}
- Persona frustrations : ${persona?.step_1_frustrations || "?"}
- Proposition de valeur : ${proposition?.version_final || "?"}
- Ce que l'utilisatrice a écrit sur son concept : "${creative_text || ""}"

Génère 5 concepts créatifs originaux pour rendre ses contenus mémorables.

Pour chaque concept :
1. Le concept en une phrase claire
2. Un exemple concret de post
3. Le format recommandé
4. Pourquoi ça marche pour sa marque

Les concepts doivent être variés : au moins un narratif, un visuel, un ludique, un émotionnel, un décalé.

Ton direct et créatif. Écriture inclusive avec point médian.

Réponds en JSON :
[
  {"concept": "...", "exemple": "...", "format": "...", "pourquoi": "..."},
  ...
]`;
      userPrompt = "Génère des concepts créatifs pour moi.";

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
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
