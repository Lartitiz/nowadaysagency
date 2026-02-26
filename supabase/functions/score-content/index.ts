import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Anthropic API key checked in shared helper

    const { content, format, objective, persona, action } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "score") {
      systemPrompt = `Tu es experte en copywriting éthique pour solopreneuses créatives.

Évalue ce contenu sur 10 critères. Note de 1 à 10 pour chacun.

CONTENU À ÉVALUER :
"""
${content}
"""

CONTEXTE :
- Format : ${format || "post"}
- Objectif : ${objective || "non précisé"}
${persona ? `- Audience : ${persona}` : ""}

CRITÈRES :
1. Authenticité : ça sonne humain ? Pas de patterns "robot" ?
2. Accroche : ça arrête le scroll ? Ça donne envie de lire/regarder ?
3. Valeur : ça apporte quelque chose de concret et utile ?
4. CTA : c'est naturel ? Pas agressif ? Mode invitation ?
5. Ton Nowadays : direct, chaleureux, oral assumé, complice ?
6. Écriture inclusive : point médian respecté partout ?
7. Rythme : bucket brigades ? Alternance longues/courtes ? Apartés ?
8. Profondeur : les idées sont développées à fond ? Pas survolées ?
9. Originalité : ça se démarque ? C'est pas du "déjà vu" ?
10. Anti-slop : aucune expression IA ? Aucun pattern robot ?

RETOURNE un JSON :
{
  "scores": [
    { "criterion": "Authenticité", "score": 8, "comment": "..." },
    ...
  ],
  "global_score": 77,
  "improvements": [
    { "priority": 1, "criterion": "...", "suggestion": "..." }
  ]
}

MAX 3 axes d'amélioration, classés par impact.
Le commentaire de chaque critère : 1 phrase max, direct.`;
      userPrompt = "Évalue ce contenu.";

    } else if (action === "improve") {
      const { improvements } = await req.json().catch(() => ({ improvements: [] }));
      const improvementsList = Array.isArray(improvements) ? improvements : [];
      const axes = improvementsList.map((i: any) => `- ${i.criterion} : ${i.suggestion}`).join("\n");

      systemPrompt = `Tu es experte en copywriting éthique.

Reprends ce contenu et améliore-le en te concentrant sur :
${axes || "les points faibles identifiés"}

CONTENU ACTUEL :
"""
${content}
"""

NE réécris PAS tout. Modifie uniquement les passages concernés.
Garde le reste intact.

Réponds UNIQUEMENT en JSON :
{ "content": "..." }`;
      userPrompt = "Améliore ce contenu.";
    } else {
      return new Response(JSON.stringify({ error: "Action non reconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt + "\n\n" + ANTI_SLOP },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) throw new Error("Trop de requêtes, réessaie dans un moment.");
      if (status === 402) throw new Error("Crédits IA insuffisants.");
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = { raw: rawContent }; }
      } else {
        parsed = { raw: rawContent };
      }
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("score-content error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
