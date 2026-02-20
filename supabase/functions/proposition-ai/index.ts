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

    const { type, step_2a, step_2b, step_2c, step_2d, step_1_what, step_3_text, persona, profile, storytelling, tone, proposition_data } = await req.json();

    const p = profile || {};
    const profileBlock = [
      p.activite ? `- Activité : ${p.activite}` : "",
      p.mission ? `- Mission : ${p.mission}` : "",
    ].filter(Boolean).join("\n");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "differentiation") {
      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

L'UTILISATRICE A RÉPONDU À 4 QUESTIONS :

A. Comment elle travaille concrètement :
"${step_2a || ""}"

B. Ce qui est important pour elle :
"${step_2b || ""}"

C. Ce que ses client·es lui disent :
"${step_2c || ""}"

D. Ce qu'elle refuse de faire :
"${step_2d || ""}"

PROFIL :
${profileBlock}

Synthétise en 3 à 5 points clés ce qui rend son approche unique. Chaque point doit être :
- Formulé de manière percutante (une phrase)
- Concret (pas abstrait)
- Différenciant (ce qu'elle fait que les autres ne font pas)

Ton direct et chaleureux. Écriture inclusive avec point médian. JAMAIS de tiret cadratin.

Réponds en JSON :
["point 1", "point 2", "point 3", ...]`;
      userPrompt = "Synthétise ce qui me rend unique.";

    } else if (type === "benefit") {
      const per = persona || {};
      const personaBlock = [
        per.step_1_frustrations ? `- Frustrations : "${per.step_1_frustrations}"` : "",
        per.step_2_transformation ? `- Transformation rêvée : "${per.step_2_transformation}"` : "",
      ].filter(Boolean).join("\n");

      systemPrompt = `L'UTILISATRICE DÉCRIT POUR QUI ELLE EST LA BONNE PERSONNE :
"${step_3_text || ""}"

${personaBlock ? `PERSONA (si rempli) :\n${personaBlock}` : ""}

PROFIL :
- Activité : ${p.activite || "?"}

Génère une phrase claire, simple et engageante du type :
"[Pronom] aide/accompagne [type de personne] à [transformation concrète], grâce à [approche unique]."

Règles :
- Pas de jargon
- Courte et mémorisable
- On doit comprendre immédiatement à qui ça s'adresse et ce que ça change
- Écriture inclusive avec point médian

Réponds avec juste la phrase, sans commentaire.`;
      userPrompt = "Formule ce que j'apporte.";

    } else if (type === "generate-versions") {
      const d = proposition_data || {};
      const per = persona || {};
      const st = storytelling || {};
      const t = tone || {};

      const personaBlock = [
        per.step_1_frustrations ? `- Frustrations cible : "${per.step_1_frustrations}"` : "",
        per.step_2_transformation ? `- Transformation rêvée : "${per.step_2_transformation}"` : "",
      ].filter(Boolean).join("\n");

      const toneBlock = [
        t.tone_register ? `- Registre : ${t.tone_register}` : "",
        t.key_expressions ? `- Expressions : ${t.key_expressions}` : "",
        t.things_to_avoid ? `- Ce qu'on évite : ${t.things_to_avoid}` : "",
      ].filter(Boolean).join("\n");

      systemPrompt = `Tu es expert·e en branding et copywriting pour des solopreneuses créatives et éthiques.

ÉLÉMENTS DE L'UTILISATRICE :
- Ce qu'elle fait : "${d.step_1_what || ""}"
- Comment elle le fait / son unicité : "${d.step_2a_process || ""} ${d.step_2b_values || ""} ${d.step_2c_feedback || ""} ${d.step_2d_refuse || ""}"
- Pour qui et ce qu'elle apporte : "${d.step_3_for_whom || ""}"

${personaBlock ? `PERSONA :\n${personaBlock}` : ""}

${st.pitch_short ? `STORYTELLING :\n- Mission/vision : "${st.pitch_short}"` : ""}

${toneBlock ? `TON & STYLE :\n${toneBlock}` : ""}

Génère 4 versions de sa proposition de valeur :

VERSION 1 — COMPLÈTE (1-2 phrases)
Format : "J'aide [qui] à [quoi], grâce à [comment/unicité]."
Claire, simple, compréhensible immédiatement. Pas de jargon. Parle des bénéfices client.

VERSION 2 — COURTE À L'INDICATIF (1 phrase qui s'adresse à la cible)
Commence par un verbe à l'indicatif. S'adresse directement au persona.

VERSION 3 — ÉMOTIONNELLE (1-2 phrases)
Plus storytelling, plus ressentie. Touche le cœur plus que la tête.

VERSION 4 — PITCH EXPRESS (1 phrase très courte, max 10 mots)
Pour un salon, un micro, un ascenseur. Ultra-mémorisable.

RÈGLES POUR TOUTES LES VERSIONS :
- Ton humain, sincère, concret
- Montre : ce qu'elle fait, pour qui, ce que ça change, ce qui rend son approche unique
- Pas de superlatifs creux
- Pas de jargon marketing
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

Réponds en JSON :
{
  "complete": "...",
  "short_indicative": "...",
  "emotional": "...",
  "pitch_express": "..."
}`;
      userPrompt = "Génère les 4 versions de ma proposition de valeur.";

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
    console.error("proposition-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
