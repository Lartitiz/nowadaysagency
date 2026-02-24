import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
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

    } else if (type === "generate-recap") {
      const { strategy_data, profile, persona, proposition, tone, editorial_line } = body;

      systemPrompt = `Tu es expert·e en stratégie de contenu pour solopreneuses créatives et éthiques.

À partir de cette stratégie de contenu, génère une synthèse structurée pour une fiche récap visuelle.

STRATÉGIE :
- Facettes choisies : facette 1 = "${strategy_data?.facet_1 || ""}" (format: ${strategy_data?.facet_1_format || "?"}), facette 2 = "${strategy_data?.facet_2 || ""}" (format: ${strategy_data?.facet_2_format || "?"}), facette 3 = "${strategy_data?.facet_3 || ""}" (format: ${strategy_data?.facet_3_format || "?"})
- Pilier majeur : "${strategy_data?.pillar_major || ""}"
- Piliers mineurs : "${strategy_data?.pillar_minor_1 || ""}", "${strategy_data?.pillar_minor_2 || ""}", "${strategy_data?.pillar_minor_3 || ""}"
- Concept créatif : "${strategy_data?.creative_concept || ""}"
- Facettes IA suggérées : ${JSON.stringify(strategy_data?.ai_facets || [])}

LIGNE ÉDITORIALE (si remplie) :
${editorial_line ? `- Piliers avec distribution : ${JSON.stringify(editorial_line.pillars || [])}
- Distribution : ${JSON.stringify(editorial_line.pillar_distribution || {})}` : "Non renseignée"}

BRANDING GLOBAL :
- Proposition de valeur : "${proposition?.version_bio || proposition?.version_final || ""}"
- Combats / cause : "${tone?.combat_cause || ""}"
- Combats secondaires : "${tone?.combat_fights || ""}"
- Ton / voix : "${tone?.voice_description || ""}"
- Activité : "${profile?.activite || ""}"
- Persona frustrations : "${persona?.step_1_frustrations || ""}"

Génère en JSON STRICT (pas de markdown, pas de commentaires) :
{
  "concept_short": "La formule courte du concept créatif (la phrase X rencontre Y). Max 15 mots. Si elle existe dans le concept, extrais-la.",
  "concept_full": "Le concept créatif complet tel quel. Ne pas modifier.",
  "pillars": [
    {
      "name": "Nom du pilier",
      "type": "major ou minor",
      "percentage": 40,
      "content_ideas": ["Sujet de post concret 1", "Sujet de post concret 2", "Sujet 3"]
    }
  ],
  "facets": ["Mot court 1", "Mot court 2", "..."],
  "content_mix": {"visibility": 4, "trust": 4, "sales": 2},
  "creative_gestures": ["geste 1 décrivant un pattern stylistique", "geste 2", "geste 3", "geste 4", "geste 5"]
}

RÈGLES :
- "pillars" : le majeur en premier avec type "major" et percentage 40, puis les mineurs (25, 20, 15). Si la ligne éditoriale a des pourcentages, utilise-les.
- "content_ideas" : des SUJETS de posts concrets, pas des catégories abstraites
- "facets" : 4-8 mots-étiquettes courts (1-2 mots chaque) = les casquettes qu'elle porte
- "creative_gestures" : 5 phrases courtes décrivant des patterns stylistiques récurrents. Si le concept créatif en contient, extrais-les. Sinon génère-les.
- "content_mix" : toujours 4/4/2 par défaut
- Écriture inclusive avec point médian
- ULTRA CONCIS partout`;

      userPrompt = "Génère la synthèse structurée de ma stratégie de contenu.";

    } else {
      return new Response(JSON.stringify({ error: "Type inconnu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const quotaCheck = await checkQuota(user.id, "content");
    if (!quotaCheck.allowed) {
      return new Response(JSON.stringify({ error: quotaCheck.message }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const content = await callAnthropicSimple(getModelForAction("strategy"), systemPrompt, userPrompt, 0.8);

    await logUsage(user.id, "content", "strategy");

    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
