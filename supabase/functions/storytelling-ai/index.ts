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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { type, text, step_context, steps, storytelling, profile } = await req.json();

    // Build profile block
    const p = profile || {};
    const profileBlock = [
      p.activite ? `- Activité : ${p.activite}` : "",
      p.mission ? `- Mission : ${p.mission}` : "",
      p.offer ? `- Offre : ${p.offer}` : "",
      p.target_description ? `- Cible : ${p.target_description}` : "",
      p.tone_register ? `- Registre : ${p.tone_register}` : "",
      p.key_expressions ? `- Expressions clés : ${p.key_expressions}` : "",
      p.things_to_avoid ? `- À éviter : ${p.things_to_avoid}` : "",
    ].filter(Boolean).join("\n");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "improve") {
      // Improve a single step's text
      systemPrompt = `Tu es coach en storytelling pour des solopreneuses créatives et éthiques.

CONTEXTE DE L'ÉTAPE : ${step_context || ""}

TEXTE ORIGINAL DE L'UTILISATRICE :
"${text || ""}"

PROFIL (si disponible) :
${profileBlock}

CONSIGNE :
Améliore ce texte pour le rendre plus vivant, plus concret et plus immersif. 

RÈGLES STRICTES :
- Garde le sens et les idées de l'utilisatrice. Ne change PAS le fond.
- Garde ses mots clés, ses expressions, sa voix. C'est SON histoire.
- Rends les scènes plus visuelles (lieu, action, détails sensoriels)
- Ajoute des sensations physiques si pertinent
- Garde un ton oral et naturel, pas littéraire
- Ne rallonge pas inutilement : mieux vaut concis et percutant
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)
- Maximum 150% de la longueur du texte original

Réponds UNIQUEMENT avec le texte amélioré, sans commentaire ni explication.`;
      userPrompt = "Améliore ce texte.";

    } else if (type === "generate-story") {
      // Generate full storytelling from steps 1-5
      const s = steps || {};
      systemPrompt = `Tu es expert·e en storytelling pour des solopreneuses créatives et éthiques.

Tu vas écrire un storytelling captivant à partir des éléments fournis par l'utilisatrice.

ÉLÉMENTS DE L'UTILISATRICE :
- Histoire brute (étape 1) : "${s.step_1_raw || ""}"
- Lieu et action (étape 2) : "${s.step_2_location || ""}"
- Scène d'action (étape 3) : "${s.step_3_action || ""}"
- Pensées intérieures (étape 4) : "${s.step_4_thoughts || ""}"
- Émotions physiques (étape 5) : "${s.step_5_emotions || ""}"

PROFIL :
${profileBlock}

STRUCTURE À SUIVRE :
1. Situation classique : sa vie avant le déclic
2. Élément perturbateur : ce qui vient tout bousculer
3. Mission : le chemin décidé
4. Nouveaux défis : ce qui n'était pas anticipé
5. Moment de doute : quand tout semble perdu
6. Déclic : la solution apparaît
7. Transformation : plus rien n'est comme avant

STYLE :
- Ton immersif, naturel, comme si elle racontait à une amie autour d'un café
- Rythme dans les phrases : longues, courtes, moyennes
- Fluide, avec des émotions sincères
- Pas de résumé : de vraies scènes qui plongent dedans
- On entend ses pensées, on sent ses émotions
- L'histoire s'ouvre directement sur le lieu et l'action
- Accroche au début qui crée du suspense
- Conclusion qui ouvre vers l'audience ou transmet une vision
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)
- Garde ses mots, ses expressions, sa voix
- Longueur : 300-600 mots

Réponds UNIQUEMENT avec le storytelling, sans commentaire.`;
      userPrompt = "Génère mon storytelling complet.";

    } else if (type === "generate-pitch") {
      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

STORYTELLING DE L'UTILISATRICE :
"${storytelling || ""}"

PROFIL :
${profileBlock}

Génère 3 versions d'un pitch basé sur son storytelling :

VERSION COURTE (2-3 phrases, pour une bio Instagram) :
- Accroche émotionnelle (1 phrase de l'histoire)
- Ce qu'elle propose et pour qui (1 phrase)

VERSION MOYENNE (4-5 phrases, pour un dossier de presse ou une page LinkedIn) :
- Accroche émotionnelle
- Ce qu'elle propose, pour qui, pourquoi ça compte
- Sa mission en une phrase

VERSION LONGUE (1 paragraphe, pour une page À propos) :
- L'accroche storytelling
- Le parcours résumé
- Ce qu'elle propose aujourd'hui
- Sa vision / sa mission

RÈGLES :
- Garde sa voix, ses mots, son ton
- Fluide et connecté (pas de liste, des phrases liées)
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)
- Pas de superlatifs creux ni de promesses vides

Réponds en JSON :
{"short": "...", "medium": "...", "long": "..."}`;
      userPrompt = "Génère mes 3 pitchs.";

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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("storytelling-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
