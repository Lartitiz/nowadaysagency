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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { type } = body;

    const p = body.profile || {};
    const profileBlock = [
      p.activite ? `- Activité : ${p.activite}` : "",
      p.mission ? `- Mission : ${p.mission}` : "",
      body.proposition?.version_final ? `- Proposition de valeur : ${body.proposition.version_final}` : "",
    ].filter(Boolean).join("\n");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "combats") {
      systemPrompt = `Tu es expert·e en branding engagé pour des solopreneuses créatives et éthiques.

L'UTILISATRICE A DÉCRIT :

Sa cause :
"${body.step_1a || ""}"

Ses combats :
"${body.step_1b || ""}"

Ce qu'elle propose à la place :
"${body.step_1c || ""}"

PROFIL :
${profileBlock}

Génère 3 à 5 combats structurés :

Pour chaque combat :
1. "Ce que je refuse" (formulé en une phrase tranchée mais pas agressive)
2. "Ce que je propose à la place" (formulé positivement)
3. "Phrase manifeste" (une phrase percutante, réutilisable en post ou en story, qui incarne ce combat. Ton engagé, direct, humain.)
4. "Idée de contenu" (un sujet de post concret inspiré de ce combat)

RÈGLES :
- Ton engagé mais jamais donneur·se de leçons
- Phrases complètes et fluides
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

Réponds en JSON :
[
  {
    "refuse": "...",
    "propose": "...",
    "manifeste": "...",
    "idee_contenu": "..."
  }
]`;
      userPrompt = "Formule mes combats et mon manifeste.";

    } else if (type === "limits") {
      systemPrompt = `L'UTILISATRICE DÉCRIT CE QU'ELLE NE VEUT PLUS :
"${body.step_2 || ""}"

PROFIL :
- Activité : ${p.activite || "?"}

Structure ses refus en 2 colonnes :

Pour chaque refus :
1. "Ce que je refuse" (formulé clairement)
2. "Ce que ça dit de ma niche" (en quoi ce refus éclaire son positionnement)

Génère 5 à 7 refus structurés. Ton empathique et direct.

Réponds en JSON :
[
  {"refuse": "...", "eclaire": "..."}
]`;
      userPrompt = "Clarifie mes limites.";

    } else if (type === "generate-niche") {
      const per = body.persona || {};
      const personaBlock = [
        per.step_1_frustrations ? `Frustrations de sa cible : "${per.step_1_frustrations}"` : "",
        per.step_2_transformation ? `Transformation rêvée : "${per.step_2_transformation}"` : "",
      ].filter(Boolean).join("\n");

      const prop = body.proposition || {};
      const propBlock = [
        prop.step_1_what ? `Ce qu'elle fait : "${prop.step_1_what}"` : "",
        prop.step_2a_process ? `Comment elle le fait : "${prop.step_2a_process}"` : "",
        prop.step_3_for_whom ? `Pour qui : "${prop.step_3_for_whom}"` : "",
        prop.version_final ? `Proposition de valeur : "${prop.version_final}"` : "",
      ].filter(Boolean).join("\n");

      const t = body.tone || {};
      const toneBlock = [
        t.tone_register ? `- Registre : ${t.tone_register}` : "",
        t.key_expressions ? `- Expressions : ${t.key_expressions}` : "",
        t.things_to_avoid ? `- Ce qu'on évite : ${t.things_to_avoid}` : "",
      ].filter(Boolean).join("\n");

      systemPrompt = `Tu es expert·e en positionnement de marque pour des solopreneuses créatives et éthiques.

TOUT LE BRANDING DE L'UTILISATRICE :

${propBlock}

${personaBlock}

SES COMBATS : "${body.niche_step1_summary || ""}"
CE QU'ELLE REFUSE : "${body.niche_step2_summary || ""}"

LES 4 CHAMPS DE SA NICHE :
- Marché : "${body.market || ""}"
- Niche : "${body.niche_specific || ""}"
- Besoin : "${body.need || ""}"
- Public : "${body.ideal_public || ""}"

${toneBlock ? `TON & STYLE :\n${toneBlock}` : ""}

Génère 3 formulations de sa niche :

VERSION DESCRIPTIVE (2-3 phrases) :
Claire, factuelle, complète. Explique ce qu'elle fait, pour qui, comment, et ce qui la différencie.

VERSION PITCH (1 phrase percutante, max 20 mots) :
Ultra-courte, mémorisable, utilisable en networking ou en bio.

VERSION MANIFESTE (3-4 phrases engagées) :
Inclut le combat, la vision, le drapeau. Plus militante, plus émotionnelle. Le genre de texte qu'on met en page À propos ou en intro de newsletter.

RÈGLES :
- Ton humain, sincère, engagé
- Chaque version doit être immédiatement compréhensible
- Pas de jargon, pas de superlatifs creux
- Utiliser les mots et expressions de l'utilisatrice quand possible
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

Réponds en JSON :
{
  "descriptive": "...",
  "pitch": "...",
  "manifeste": "..."
}`;
      userPrompt = "Génère les 3 formulations de ma niche.";

    } else {
      return new Response(JSON.stringify({ error: "Type non reconnu" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits épuisés, ajoute des crédits pour continuer." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Erreur du service IA");
    }

    const data2 = await response.json();
    const content = data2.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("niche-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
