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
      const { text, facets, profile, niche, persona } = body;
      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

CE QUE L'UTILISATRICE A PARTAGÉ :
"${text || ""}"

SES 3 FACETTES IDENTIFIÉES :
1. "${facets?.[0] || ""}"
2. "${facets?.[1] || ""}"
3. "${facets?.[2] || ""}"

PROFIL :
- Activité : ${profile?.activite || "?"}
- Niche : ${niche?.niche_specific || "non renseignée"}
- Combats : ${niche?.step_1a_cause || "non renseignés"}
- Persona : ${persona?.step_1_frustrations ? `Frustrations : ${persona.step_1_frustrations}` : "non renseigné"}

Propose 5 facettes supplémentaires qu'elle pourrait explorer dans sa communication. Des sujets qu'elle n'ose peut-être pas aborder mais qui créeraient de la connexion avec son audience.

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

    } else if (type === "words") {
      const { cloud_offer, cloud_clients, cloud_universe, profile, niche, persona } = body;
      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

NUAGE DE MOTS DE L'UTILISATRICE :

Ce qu'elle propose : "${cloud_offer || ""}"
Ce que disent ses client·es : "${cloud_clients || ""}"
Son univers : "${cloud_universe || ""}"

PROFIL :
- Activité : ${profile?.activite || "?"}
- Niche : ${niche?.niche_specific || "non renseignée"}
- Persona frustrations : ${persona?.step_1_frustrations || "non renseigné"}
- Combats : ${niche?.step_1a_cause || "non renseignés"}

Propose 10 mots ou expressions supplémentaires répartis dans les 3 catégories. Des mots qu'elle n'a peut-être pas pensé à inclure mais qui enrichiraient son univers.

Réponds en JSON :
{
  "propose": ["mot1", "mot2", ...],
  "clients": ["mot1", "mot2", ...],
  "univers": ["mot1", "mot2", ...]
}`;
      userPrompt = "Enrichis mon nuage de mots.";

    } else if (type === "pillars") {
      const { cloud_offer, cloud_clients, cloud_universe, profile, persona, niche, proposition, tone, facets } = body;
      systemPrompt = `Tu es expert·e en stratégie de contenu pour des solopreneuses créatives et éthiques.

TOUT LE BRANDING :
- Nuage de mots (ce qu'elle propose) : ${cloud_offer || "?"}
- Nuage de mots (ses client·es) : ${cloud_clients || "?"}
- Nuage de mots (son univers) : ${cloud_universe || "?"}
- Persona frustrations : ${persona?.step_1_frustrations || "?"}
- Persona transformation : ${persona?.step_2_transformation || "?"}
- Niche : ${niche?.niche_specific || "?"}
- Combats / cause : ${niche?.step_1a_cause || "?"}
- Proposition de valeur : ${proposition?.version_final || "?"}
- Facettes : ${facets?.join(", ") || "?"}
- Ton / registre : ${tone?.tone_register || "?"}
- Expressions : ${tone?.key_expressions || "?"}
- Activité : ${profile?.activite || "?"}

Propose une stratégie de piliers de contenu :

1 THÉMATIQUE MAJEURE :
- Le pilier central qui guide tout
- Explique en 1-2 phrases pourquoi c'est le bon choix pour cette marque
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
      const { creative_text, profile, niche, persona, proposition, tone, pillars } = body;
      systemPrompt = `Tu es expert·e en création de contenu et branding pour des solopreneuses créatives et éthiques.

BRANDING COMPLET :
- Activité : ${profile?.activite || "?"}
- Niche : ${niche?.niche_specific || "?"}
- Piliers de contenu : Majeure = ${pillars?.major || "?"}, Mineures = ${pillars?.minors?.join(", ") || "?"}
- Ton / registre : ${tone?.tone_register || "?"}
- Expressions : ${tone?.key_expressions || "?"}
- Humour : ${tone?.tone_humor || "?"}
- Combats : ${niche?.step_1a_cause || "?"}
- Persona frustrations : ${persona?.step_1_frustrations || "?"}
- Proposition de valeur : ${proposition?.version_final || "?"}
- Ce que l'utilisatrice a écrit sur son concept : "${creative_text || ""}"

Génère 5 concepts créatifs originaux pour rendre ses contenus mémorables. Chaque concept doit être adapté à son univers et à son ton.

Pour chaque concept :
1. Le concept en une phrase claire
2. Un exemple concret de post utilisant ce concept (sujet + angle + première phrase)
3. Le format recommandé (reel, carrousel, story, newsletter)
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

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
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
