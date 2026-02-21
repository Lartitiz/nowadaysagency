import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FORMAT_STRUCTURES, WRITING_RESOURCES } from "../_shared/copywriting-prompts.ts";

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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      data: { user },
    } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Fetch branding context
    const [profileRes, brandRes, propRes, personaRes, stratRes, storyRes] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("brand_proposition").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("persona").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("brand_strategy").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("storytelling").select("*").eq("user_id", user.id).eq("is_primary", true).maybeSingle(),
      ]);

    const profile = profileRes.data;
    const brand = brandRes.data;
    const prop = propRes.data;
    const persona = personaRes.data;
    const strat = stratRes.data;
    const story = storyRes.data;

    const brandingContext = `
BRANDING DE L'UTILISATRICE :
- Activité : ${profile?.activite || "Non renseigné"}
- Proposition de valeur : ${prop?.version_pitch_naturel || prop?.version_bio || prop?.version_final || "Non renseignée"}
- Proposition courte : ${prop?.version_bio || "Non renseignée"}
- Storytelling : ${story?.pitch_short || "Non renseigné"}
- Persona frustrations : ${persona?.step_1_frustrations || "Non renseigné"}
- Persona transformation : ${persona?.step_2_transformation || "Non renseigné"}
- Persona objections : ${persona?.step_3a_objections || "Non renseigné"}
- Combats : ${brand?.combat_cause || "Non renseigné"} / ${brand?.combat_fights || ""}
- Ton & style : ${brand?.voice_description || "Non renseigné"}, registre : ${brand?.tone_register || ""}, expressions : ${brand?.key_expressions || ""}, à éviter : ${brand?.things_to_avoid || ""}
- Piliers de contenu : ${strat?.pillar_major || "Non renseigné"}, ${strat?.pillar_minor_1 || ""}, ${strat?.pillar_minor_2 || ""}, ${strat?.pillar_minor_3 || ""}
- Concept créatif : ${strat?.creative_concept || "Non renseigné"}
`.trim();

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

    // SECTION 1 (principes) + SECTION 4 (banques pour la rédaction de l'adaptation)
    const systemPrompt = `${CORE_PRINCIPLES}

${WRITING_RESOURCES}

${brandingContext}

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
        // Support both old format (string) and new format ({data, type})
        const imgUrl = typeof img === "string" ? img : img.data;
        const mediaType = typeof img === "string" ? undefined : img.type;

        if (mediaType === "application/pdf") {
          // Extract base64 data from data URL
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
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const err = await aiRes.text();
      console.error("AI API error:", err);
      return new Response(JSON.stringify({ error: "Erreur IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let raw = aiData.choices?.[0]?.message?.content || "";
    raw = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      console.error("JSON parse error:", raw);
      return new Response(JSON.stringify({ error: "Erreur de format IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
