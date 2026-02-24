import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORE_PRINCIPLES, ANTI_SLOP, ETHICAL_GUARDRAILS } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
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
    const { prospect, approach_type, interactions_summary, conversation_history, selected_offer } = body;

    // Fetch full user context server-side
    const ctx = await getUserContext(supabaseClient, user.id);
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.dm);

    // Build offer block from the explicitly selected offer (or fallback to ctx.offers)
    let offerBlock = "";
    if (selected_offer) {
      offerBlock = `\nOFFRE SÉLECTIONNÉE PAR L'EXPÉDITRICE :
- Nom : ${selected_offer.name}
- Type : ${selected_offer.offer_type} (${selected_offer.offer_type === "free" ? "gratuite" : "payante"})
- Promesse : ${selected_offer.promise || "?"}
- Prix : ${selected_offer.price_text || "gratuit"}
- Phrase de vente : ${selected_offer.sales_line || "?"}
- Lien : ${selected_offer.url_sales_page || selected_offer.url_booking || "?"}
- Problème que l'offre résout : ${selected_offer.problem_deep || "?"}
- Description courte : ${selected_offer.description_short || "?"}

${selected_offer.offer_type === "free"
  ? "⚠️ C'est une offre GRATUITE. Ne pas « vendre » mais offrir de la valeur naturellement. Ton : 'J'ai fait un truc qui pourrait t'aider'."
  : "⚠️ C'est une offre PAYANTE. Ne pas pitcher directement sauf si approche = 'offer'. Amener progressivement."}`;
    }

    const approachDescriptions: Record<string, string> = {
      reconnect: `MESSAGE DE REPRISE DE CONTACT NATURELLE
Tu veux juste créer du lien. Pas de vente, pas de pitch. Compliment sincère + question naturelle.`,
      resource: `PROPOSITION DE RESSOURCE GRATUITE
Tu veux offrir quelque chose d'utile sans rien demander en retour. Nomme la ressource précisément. Ton généreux et décontracté.`,
      personalized: `DM PERSONNALISÉ SUR SON ACTIVITÉ
Tu montres que tu connais son projet. Tu identifies un besoin et tu te positionnes comme quelqu'un qui peut aider, sans pitcher directement.`,
      offer: `PROPOSITION D'APPEL OU D'OFFRE
La relation est chaude, tu proposes directement un appel découverte ou ton offre. Message direct, pas de détour.`,
    };

    const phaseGuidance: Record<string, string> = {
      unaware: "Elle ne sait pas encore qu'elle a un problème. Reste dans le lien humain, zéro mention de solution.",
      aware: "Elle commence à voir son problème. Tu peux subtilement mettre des mots dessus sans proposer de solution.",
      exploring: "Elle cherche des solutions. Tu peux te positionner comme experte et proposer de la valeur.",
      hesitating: "Elle hésite entre plusieurs options. Rassure-la avec un témoignage ou une preuve sociale.",
      ready: "Elle est prête à agir. Propose directement ton offre ou un appel.",
    };

    const hasConversation = conversation_history && conversation_history.trim().length > 0;

    const prompt = `${CORE_PRINCIPLES}

${ANTI_SLOP}

${ETHICAL_GUARDRAILS}

${contextStr}
${offerBlock}

CONTEXTE DU PROSPECT :
- Username : @${prospect.instagram_username}
${prospect.display_name ? `- Prénom : ${prospect.display_name}` : ""}
${prospect.activity ? `- Activité : ${prospect.activity}` : ""}
${prospect.strengths ? `- Ce qu'elle fait bien : ${prospect.strengths}` : ""}
${prospect.probable_problem ? `- Son problème d'après l'expéditrice : ${prospect.probable_problem}` : ""}
- Phase du parcours : ${prospect.decision_phase || "inconnue"} — ${phaseGuidance[prospect.decision_phase] || ""}
${prospect.noted_interest ? `- Intérêt montré : ${prospect.noted_interest}` : ""}
${prospect.last_dm_context ? `\nINTENTION DU MESSAGE :\n${prospect.last_dm_context}\n(Ce que l'expéditrice veut aborder dans le DM. Le message généré doit intégrer cette intention naturellement, pas la plaquer mot pour mot.)` : ""}
${prospect.to_avoid ? `- ⚠️ À ÉVITER dans le message : ${prospect.to_avoid}` : ""}

HISTORIQUE DE CONVERSATION RÉCENTE (DMs Instagram) :
${hasConversation ? conversation_history : "Pas de conversation récente fournie."}
${hasConversation ? "\n⚠️ Le message DOIT faire suite naturellement à cette conversation. Rebondir sur ce qui a été dit. Ne pas ignorer l'historique." : ""}

HISTORIQUE DES INTERACTIONS PRÉCÉDENTES (commentaires, DMs, etc.) :
${interactions_summary || "Aucune interaction précédente."}

TYPE DE MESSAGE : ${approach_type}
${approachDescriptions[approach_type] || ""}

RÈGLES SPÉCIFIQUES DM INSTAGRAM :
- Maximum 4-5 phrases (un DM Instagram, pas un email)
- Le message doit FAIRE SUITE NATURELLEMENT à la conversation si fournie
  Si elle a dit quelque chose de spécifique, REBONDIR dessus
  Ne pas commencer comme si on ne s'était jamais parlé
- Ton naturel, comme si tu reprenais la conversation
- PAS de formule corporate ("J'espère que tu vas bien")
- PAS de pitch commercial déguisé en question si elle est méfiante
- Si offre gratuite : proposer comme un cadeau naturel — "Tiens, j'ai fait un truc qui pourrait t'aider pour ça"
- Si offre payante : ne pas pitcher directement sauf si approche = 'offer'. Sinon, amener progressivement.
- RESPECTER ABSOLUMENT ce qui est à éviter (to_avoid)
- Le message doit pouvoir être copié-collé tel quel dans Instagram
- 1-2 emoji max
- JAMAIS de hashtag dans un DM

Retourne EXACTEMENT ce JSON (pas de texte autour) :
{
  "variant_a": "le premier message",
  "variant_b": "le second message, ton légèrement différent"
}`;

    const content = await callAnthropicSimple(getModelForAction("dm_comment"), "", prompt, 0.8);

    // Clean AI response
    let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response");

    let variants: { variant_a: string; variant_b: string };
    try {
      variants = JSON.parse(jsonMatch[0]);
    } catch {
      const fixed = jsonMatch[0]
        .replace(/(?<=:\s*")([\s\S]*?)(?="[\s,}])/g, (match) =>
          match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
        );
      try {
        variants = JSON.parse(fixed);
      } catch {
        const matchA = jsonMatch[0].match(/"variant_a"\s*:\s*"([\s\S]*?)"\s*,\s*"variant_b"/);
        const matchB = jsonMatch[0].match(/"variant_b"\s*:\s*"([\s\S]*?)"\s*\}?$/);
        if (matchA && matchB) {
          variants = { variant_a: matchA[1].replace(/\\n/g, "\n"), variant_b: matchB[1].replace(/\\n/g, "\n") };
        } else {
          console.error("Unparseable AI JSON:", jsonMatch[0]);
          throw new Error("Format de réponse IA invalide, réessaie.");
        }
      }
    }

    await logUsage(user.id, "dm_comment", "dm");

    return new Response(JSON.stringify(variants), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
