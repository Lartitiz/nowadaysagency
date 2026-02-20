import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentification requise" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentification invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { type, format, sujet, profile, canal } = await req.json();

    const canalLabel = canal === "linkedin" ? "LinkedIn" : canal === "blog" ? "un article de blog" : canal === "pinterest" ? "Pinterest" : "Instagram";

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "suggest") {
      systemPrompt = `Tu es un·e expert·e en stratégie de contenu ${canalLabel} pour des solopreneuses éthiques.

Profil de l'utilisatrice :
- Activité : ${profile.activite}
- Cible : ${profile.cible}
- Thématiques : ${(profile.piliers || []).join(", ")}

Propose exactement 5 idées de sujets de posts ${canalLabel}, adaptées à son activité et sa cible. Chaque idée doit être formulée comme un sujet concret et spécifique (pas vague), en une phrase.

Varie les angles : un sujet éducatif, un storytelling, un sujet engagé, un sujet pratique, un sujet inspirant.

Réponds uniquement avec les 5 sujets, un par ligne, sans numérotation, sans tiret, sans explication.`;
      userPrompt = `Propose-moi 5 sujets de posts ${canalLabel}.`;
    } else if (type === "ideas") {
      const formatInstruction = format
        ? `FORMAT SÉLECTIONNÉ : ${format}`
        : "FORMAT SÉLECTIONNÉ : aucun, propose le format le plus adapté pour chaque idée";
      const sujetInstruction = sujet
        ? sujet
        : "aucun, propose des idées variées";

      systemPrompt = `Tu es un·e expert·e en stratégie de contenu ${canalLabel} pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
- Prénom : ${profile.prenom}
- Activité : ${profile.activite}
- Type : ${profile.type_activite}
- Cible : ${profile.cible}
- Problème qu'elle résout : ${profile.probleme_principal}
- Thématiques : ${(profile.piliers || []).join(", ")}
- Ton souhaité : ${(profile.tons || []).join(", ")}

CANAL SÉLECTIONNÉ : ${canalLabel}

THÈME OU MOT-CLÉ DONNÉ PAR L'UTILISATRICE : ${sujetInstruction}

${formatInstruction}

CONSIGNE :
Propose exactement 5 idées de posts ${canalLabel} adaptées à son activité, sa cible, et ses thématiques.

Pour chaque idée, donne :
1. Un TITRE accrocheur (la "grande idée" du post, en une phrase percutante)
2. Le FORMAT recommandé parmi : Storytelling, Mythe à déconstruire, Coup de gueule, Enquête/décryptage, Conseil contre-intuitif, Test grandeur nature, Before/After, Histoire cliente, Regard philosophique, Surf sur l'actu
3. Un ANGLE ou ACCROCHE possible (1-2 phrases qui donnent le ton et la direction du post, comme un pitch)

RÈGLES :
- Varie les formats (pas 2 fois le même sauf si c'est vraiment pertinent)
- Varie les angles : un sujet éducatif, un engagé, un personnel/storytelling, un pratique, un inspirant
- Les idées doivent être SPÉCIFIQUES à son activité, pas des sujets génériques
- Le ton des accroches doit être direct, oral, chaleureux (comme une discussion entre ami·es)
- Adapte les suggestions au canal ${canalLabel} (longueur, style, conventions de la plateforme)
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
      userPrompt = `Propose-moi 5 idées de posts ${canalLabel}.`;
    } else if (type === "bio") {
      systemPrompt = `Tu es un·e expert·e en personal branding Instagram pour des solopreneuses éthiques et créatives.

PROFIL DE L'UTILISATRICE :
- Prénom : ${profile.prenom}
- Activité : ${profile.activite}
- Type : ${profile.type_activite}
- Cible : ${profile.cible}
- Problème qu'elle résout : ${profile.probleme_principal}
- Thématiques : ${(profile.piliers || []).join(", ")}
- Ton souhaité : ${(profile.tons || []).join(", ")}

CONSIGNE :
Génère exactement 2 versions de bio Instagram pour cette utilisatrice.

VERSION 1 : Bio structurée & claire
Format strict ligne par ligne :
- Ligne "nom_profil" : Prénom + mot-clé de l'activité (ex : "Lucie | Céramique slow & solaire")
- Ligne 1 : Ce qu'elle propose (commence par un emoji pertinent)
- Ligne 2 : Ce qui la rend unique (commence par un emoji pertinent)
- Ligne 3 : Appel à l'action (commence par un emoji pertinent, termine par ⤵️)

VERSION 2 : Bio créative & incarnée
Même structure mais avec un ton plus libre, poétique, avec de l'humour ou de la personnalité. Moins formaté, plus authentique.

RÈGLES :
- Maximum 150 caractères par ligne
- Écriture inclusive avec point médian
- Pas de hashtags dans la bio
- Pas de tiret cadratin
- Le ton doit correspondre aux tons souhaités de l'utilisatrice
- Chaque version doit être SPÉCIFIQUE à son activité

IMPORTANT : Réponds UNIQUEMENT en JSON, sans aucun texte avant ou après, sans backticks markdown. Format exact :
{
  "structured": {
    "nom_profil": "...",
    "ligne1": "...",
    "ligne2": "...",
    "ligne3": "..."
  },
  "creative": {
    "nom_profil": "...",
    "ligne1": "...",
    "ligne2": "...",
    "ligne3": "..."
  }
}`;
      userPrompt = "Génère 2 versions de bio Instagram pour moi.";
    } else if (type === "launch-ideas") {
      systemPrompt = `Tu es expert·e en stratégie de lancement Instagram pour des solopreneuses éthiques.

PROFIL :
- Activité : ${profile.activite}
- Cible : ${profile.cible}
- Ton : ${(profile.tons || []).join(", ")}

LANCEMENT :
- Nom : ${profile.launch_name || ""}
- Promesse : ${profile.launch_promise || ""}
- Objections anticipées : ${profile.launch_objections || ""}
- Durée teasing : ${profile.launch_teasing_start || "?"} au ${profile.launch_teasing_end || "?"}
- Durée vente : ${profile.launch_sale_start || "?"} au ${profile.launch_sale_end || "?"}

CONTENUS SÉLECTIONNÉS PAR L'UTILISATRICE : ${(profile.launch_selected_contents || []).join(", ")}

Pour chaque contenu sélectionné, propose :
- 1 accroche (hook) percutante
- 1 suggestion de CTA (appel à l'action doux mais efficace)
- Le format recommandé (reel, carrousel, story, post)

Ton direct, chaleureux, oral assumé. Pas de jargon marketing. Écriture inclusive avec point médian.

IMPORTANT : Réponds UNIQUEMENT en JSON, sans aucun texte avant ou après, sans backticks markdown. Format exact :
[
  {
    "content_type": "...",
    "hook": "...",
    "cta": "...",
    "format": "..."
  }
]`;
      userPrompt = `Génère des idées de contenu pour mon lancement.`;
    } else {
      // Legacy generate type
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
