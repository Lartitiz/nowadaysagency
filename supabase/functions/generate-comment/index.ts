import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORE_PRINCIPLES, ANTI_SLOP, ETHICAL_GUARDRAILS } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropic, AnthropicError, getModelForAction } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Non authentifié");

    // Check plan limits
    const quotaCheck = await checkQuota(user.id, "dm_comment");
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: quotaCheck.message, remaining: 0, category: quotaCheck.reason }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { target_username, post_caption, user_intent, angle, screenshot_base64, screenshot_media_type } = body;

    if (!post_caption?.trim()) throw new Error("La légende du post est requise.");

    // Fetch full user context server-side
    const ctx = await getUserContext(supabaseClient, user.id, undefined, "instagram");
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.comments);

    const angleInstruction = angle && angle !== "all"
      ? `ANGLE DEMANDÉ : ${angle} — Génère uniquement ce type de commentaire, mais propose quand même 4 variantes avec des tons différents.`
      : `Génère les 4 types : value (apport de valeur), question (question pertinente), remarkable (court et remarquable), expertise (expertise subtile).`;

    const textPrompt = `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :
- Reproduis fidèlement le style décrit
- Réutilise les expressions signature naturellement dans le texte
- RESPECTE les expressions interdites : ne les utilise JAMAIS
- Imite les patterns de ton et de structure
- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA

${CORE_PRINCIPLES}

${ANTI_SLOP}

${ETHICAL_GUARDRAILS}

Tu dois générer des commentaires Instagram stratégiques pour le post d'un contact.

${contextStr}

LE POST :
- Compte : @${target_username}
- Légende : "${post_caption}"
${screenshot_base64 ? "- Un screenshot du post est joint ci-dessus. Analyse le visuel (couleurs, mise en page, contenu visible) pour rendre tes commentaires encore plus spécifiques." : ""}

${user_intent ? `CE QUE L'UTILISATRICE VOUDRAIT DIRE : "${user_intent}"` : ""}

${angleInstruction}

GÉNÈRE 4 COMMENTAIRES :

1. 💡 APPORT DE VALEUR (type: "value") : ajouter une info, un retour d'expérience, un angle complémentaire. Le commentaire enrichit la conversation.

2. ❓ QUESTION PERTINENTE (type: "question") : poser une question qui montre qu'on a lu le post en profondeur. Pas "super post !" mais une vraie question qui génère de la conversation.

3. ⚡ COURT ET REMARQUABLE (type: "remarkable") : 1-2 phrases max. Percutant. Le genre de commentaire qu'on relit. Pas un emoji, pas "trop bien". Un truc qui marque.

4. 🎓 EXPERTISE SUBTILE (type: "expertise") : montrer son expertise sans faire la meuf qui ramène tout à elle. Apporter un éclairage pro, un terme technique vulgarisé, une observation de terrain.

RÈGLES :
- Ton naturel, oral, comme dans une vraie conversation
- PAS de "Super post !" ni de compliments vides
- PAS de "En tant que [métier], je..." (trop promo)
- Les commentaires doivent donner envie de cliquer sur le profil de l'utilisatrice
- Longueur : entre 20 et 80 mots selon le type (remarkable = 20 mots max)
- Maximum 1 emoji par commentaire
- Le commentaire doit être SPÉCIFIQUE au post (pas générique)
- Si l'utilisatrice a indiqué ce qu'elle veut dire, intégrer ça naturellement
- PRIORITÉ VOIX : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature. Respecte les expressions interdites.

Retourne EXACTEMENT ce JSON (pas de texte autour) :
{
  "comments": [
    { "type": "value", "label": "Apport de valeur", "emoji": "💡", "text": "...", "word_count": 42 },
    { "type": "question", "label": "Question pertinente", "emoji": "❓", "text": "...", "word_count": 35 },
    { "type": "remarkable", "label": "Court et remarquable", "emoji": "⚡", "text": "...", "word_count": 15 },
    { "type": "expertise", "label": "Expertise subtile", "emoji": "🎓", "text": "...", "word_count": 50 }
  ]
}`;

    // Build message content: multimodal if screenshot provided
    let messageContent: any;
    if (screenshot_base64) {
      messageContent = [
        {
          type: "image_url",
          image_url: {
            url: `data:${screenshot_media_type || "image/png"};base64,${screenshot_base64}`,
          },
        },
        { type: "text", text: textPrompt },
      ];
    } else {
      messageContent = textPrompt;
    }

    const content = await callAnthropic({
      model: getModelForAction("dm_comment"),
      messages: [{ role: "user", content: messageContent }],
      temperature: 0.8,
    });

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response");

    const result = JSON.parse(jsonMatch[0]);

    await logUsage(user.id, "dm_comment", "comment");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
