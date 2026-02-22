import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FORMAT_STRUCTURES, WRITING_RESOURCES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check plan limits
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { source_text, source_type, images, context } = body;

    const isScreenshot = source_type === "screenshot";

    if (!isScreenshot && (!source_text || source_text.trim().length < 20)) {
      return new Response(
        JSON.stringify({ error: "Contenu trop court (min 20 caractères)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isScreenshot && (!images || images.length === 0)) {
      return new Response(
        JSON.stringify({ error: "Aucun screenshot fourni" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch full user context server-side
    const ctx = await getUserContext(supabase, user.id);
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.inspire);

    let sourceBlock: string;
    if (isScreenshot) {
      sourceBlock = `CONTENU SOURCE : Screenshots uploadés par l'utilisatrice.
${context ? `Contexte ajouté par l'utilisatrice : "${context}"` : "Pas de contexte supplémentaire."}

IMPORTANT : Analyse le contenu VISIBLE sur les images :
- Lis le texte visible (caption, slides de carrousel, texte sur les visuels)
- Analyse la mise en page et le format (carrousel, reel, post photo, story)
- Identifie le sujet, l'accroche, la structure
- Si c'est un carrousel : analyse chaque slide visible
- Si c'est un reel : analyse la miniature et le texte visible`;
    } else {
      sourceBlock = `CONTENU SOURCE (celui que l'utilisatrice a aimé) :
"""
${source_text}
"""`;
    }

    const systemPrompt = `${CORE_PRINCIPLES}

${WRITING_RESOURCES}

${contextStr}

${sourceBlock}

ÉTAPE 1 : ANALYSE (courte et percutante)

Analyse le contenu source en 4 points max :
1. L'ACCROCHE : pourquoi elle fonctionne (1 phrase)
2. LA STRUCTURE : comment le contenu est construit (1 phrase)
3. LE TON : ce qui crée la connexion avec le lecteur (1 phrase)
4. LE DÉCLENCHEUR D'ENGAGEMENT : ce qui pousse à interagir (1 phrase)

Sois concrète et technique. Pas de blabla. Comme un décryptage entre pros.

ÉTAPE 2 : ADAPTATION

Génère 1 contenu complet adapté à l'utilisatrice :
- Reprends la STRUCTURE qui fonctionne dans le contenu source
- Remplace le SUJET par quelque chose en lien avec son activité, ses piliers, son combat
- Écris dans SON TON (ses expressions, son registre, son niveau de familiarité)
- Utilise les frustrations ou la transformation de SON persona
- Si elle a un concept créatif, intègre-le
- L'accroche doit être aussi forte que l'originale mais avec ses mots à elle
- Intègre naturellement 2-3 BUCKET BRIGADES pour relancer la lecture
- Termine par un CTA ÉTHIQUE adapté

Le contenu doit être PRÊT À POSTER. Pas un brouillon. Un vrai post.

Ajoute à la fin :
- Le format recommandé (carrousel, reel, post photo, post texte)
- L'objectif du contenu (visibilité, confiance, vente, crédibilité)
- Le pilier de contenu correspondant (si les piliers sont remplis)

RÈGLES :
- Le contenu adapté doit faire la même longueur que l'original
- L'inspiration doit être évidente mais le contenu ne doit PAS être un copié-collé reformulé
- Si le contenu source est en anglais, la version adaptée est en français

Réponds UNIQUEMENT en JSON valide :
{
  "analysis": {
    "accroche": "...",
    "structure": "...",
    "ton": "...",
    "engagement": "..."
  },
  "adapted_content": "...",
  "format": "...",
  "objective": "...",
  "pillar": "..."
}`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Clé API manquante" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let messages: any[];
    if (isScreenshot) {
      const contentParts: any[] = [{ type: "text", text: systemPrompt }];
      for (const img of images) {
        const imgUrl = typeof img === "string" ? img : img.data;
        const mediaType = typeof img === "string" ? undefined : img.type;

        if (mediaType === "application/pdf") {
          const base64Data = imgUrl.includes(",") ? imgUrl.split(",")[1] : imgUrl;
          contentParts.push({
            type: "file",
            file: {
              filename: "document.pdf",
              file_data: `data:application/pdf;base64,${base64Data}`,
            },
          });
        } else {
          contentParts.push({
            type: "image_url",
            image_url: { url: imgUrl },
          });
        }
      }
      messages = [{ role: "user", content: contentParts }];
    } else {
      messages = [{ role: "user", content: systemPrompt }];
    }

    const model = "google/gemini-2.5-flash";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, temperature: 0.8 }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const err = await aiRes.text();
      console.error("AI API error:", err);
      return new Response(JSON.stringify({ error: "Erreur IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    let raw = aiData.choices?.[0]?.message?.content || "";
    raw = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      console.error("JSON parse error:", raw);
      return new Response(JSON.stringify({ error: "Erreur de format IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
