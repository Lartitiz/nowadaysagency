import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { type, format, sujet, profile } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "suggest") {
      systemPrompt = `Tu es un·e expert·e en stratégie de contenu Instagram pour des solopreneuses éthiques.

Profil de l'utilisatrice :
- Activité : ${profile.activite}
- Cible : ${profile.cible}
- Thématiques : ${(profile.piliers || []).join(", ")}

Propose exactement 5 idées de sujets de posts Instagram, adaptées à son activité et sa cible. Chaque idée doit être formulée comme un sujet concret et spécifique (pas vague), en une phrase.

Varie les angles : un sujet éducatif, un storytelling, un sujet engagé, un sujet pratique, un sujet inspirant.

Réponds uniquement avec les 5 sujets, un par ligne, sans numérotation, sans tiret, sans explication.`;
      userPrompt = "Propose-moi 5 sujets de posts.";
    } else if (type === "ideas") {
      const formatInstruction = format
        ? `FORMAT SÉLECTIONNÉ : ${format}`
        : "FORMAT SÉLECTIONNÉ : aucun, propose le format le plus adapté pour chaque idée";
      const sujetInstruction = sujet
        ? sujet
        : "aucun, propose des idées variées";

      systemPrompt = `Tu es un·e expert·e en stratégie de contenu Instagram pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
- Prénom : ${profile.prenom}
- Activité : ${profile.activite}
- Type : ${profile.type_activite}
- Cible : ${profile.cible}
- Problème qu'elle résout : ${profile.probleme_principal}
- Thématiques : ${(profile.piliers || []).join(", ")}
- Ton souhaité : ${(profile.tons || []).join(", ")}

THÈME OU MOT-CLÉ DONNÉ PAR L'UTILISATRICE : ${sujetInstruction}

${formatInstruction}

CONSIGNE :
Propose exactement 5 idées de posts Instagram adaptées à son activité, sa cible, et ses thématiques.

Pour chaque idée, donne :
1. Un TITRE accrocheur (la "grande idée" du post, en une phrase percutante)
2. Le FORMAT recommandé parmi : Storytelling, Mythe à déconstruire, Coup de gueule, Enquête/décryptage, Conseil contre-intuitif, Test grandeur nature, Before/After, Histoire cliente, Regard philosophique, Surf sur l'actu
3. Un ANGLE ou ACCROCHE possible (1-2 phrases qui donnent le ton et la direction du post, comme un pitch)

RÈGLES :
- Varie les formats (pas 2 fois le même sauf si c'est vraiment pertinent)
- Varie les angles : un sujet éducatif, un engagé, un personnel/storytelling, un pratique, un inspirant
- Les idées doivent être SPÉCIFIQUES à son activité, pas des sujets génériques
- Le ton des accroches doit être direct, oral, chaleureux (comme une discussion entre ami·es)
- Écriture inclusive avec point médian
- Pas de tiret cadratin, utiliser : ou ;
- Pas d'emojis

IMPORTANT : Réponds UNIQUEMENT en JSON, sans aucun texte avant ou après, sans backticks markdown. Format exact :
[
  {
    "titre": "...",
    "format": "...",
    "angle": "..."
  }
]`;
      userPrompt = "Propose-moi 5 idées de posts.";
    } else {
      // Legacy generate type - kept for compatibility
      systemPrompt = `Tu es un·e expert·e en création de contenu Instagram.`;
      userPrompt = `Rédige un post Instagram au format "${format}" sur le sujet : "${sujet}"`;
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-content error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
