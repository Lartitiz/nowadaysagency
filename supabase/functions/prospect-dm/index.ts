import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORE_PRINCIPLES, ANTI_SLOP, ETHICAL_GUARDRAILS } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";

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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Non authentifié");

    const body = await req.json();
    const { prospect, approach_type, interactions_summary } = body;

    // Fetch full user context server-side (includes offers for DM)
    const ctx = await getUserContext(supabaseClient, user.id);
    const contextStr = formatContextForAI(ctx, CONTEXT_PRESETS.dm);

    // Find relevant offer for this prospect
    let relevantOfferBlock = "";
    if (ctx.offers?.length > 0) {
      // If prospect has a relevant_offer field, find it; otherwise use the main paid offer
      const relevantOffer = prospect.relevant_offer
        ? ctx.offers.find((o: any) => o.name === prospect.relevant_offer)
        : ctx.offers.find((o: any) => o.offer_type === "paid");
      const freebie = ctx.offers.find((o: any) => o.offer_type === "free");

      if (relevantOffer) {
        relevantOfferBlock += `\nOFFRE PERTINENTE POUR CE PROSPECT :
- Nom : ${relevantOffer.name}
- Promesse : ${relevantOffer.promise || "?"}
- Prix : ${relevantOffer.price_text || "?"}
- Lien : ${relevantOffer.url_sales_page || relevantOffer.url_booking || "?"}`;
      }
      if (freebie && approach_type === "resource") {
        relevantOfferBlock += `\nRESSOURCE GRATUITE DISPONIBLE :
- Nom : ${freebie.name}
- Description : ${freebie.description_short || "?"}`;
      }
    }

    const approachDescriptions: Record<string, string> = {
      reconnect: `MESSAGE DE REPRISE DE CONTACT NATURELLE
Tu veux juste créer du lien. Pas de vente, pas de pitch. Commente quelque chose de spécifique sur son activité récente. Compliment sincère + question naturelle.`,
      resource: `PROPOSITION DE RESSOURCE GRATUITE
Tu veux offrir quelque chose d'utile sans rien demander en retour. Nomme la ressource précisément. Ton généreux et décontracté.`,
      personalized: `DM PERSONNALISÉ SUR SON ACTIVITÉ
Tu montres que tu connais son projet et que tu as observé son travail. Tu identifies un problème ou un besoin et tu te positionnes comme quelqu'un qui peut aider, sans pitcher directement.`,
      offer: `PROPOSITION D'APPEL OU D'OFFRE
La relation est chaude, tu proposes directement un appel découverte ou ton offre. Message direct, pas de détour. Inclus un lien Calendly si mentionné.`,
    };

    const phaseGuidance: Record<string, string> = {
      unaware: "Elle ne sait pas encore qu'elle a un problème. Reste dans le lien humain, zéro mention de solution.",
      aware: "Elle commence à voir son problème. Tu peux subtilement mettre des mots dessus sans proposer de solution.",
      exploring: "Elle cherche des solutions. Tu peux te positionner comme experte et proposer de la valeur.",
      hesitating: "Elle hésite entre plusieurs options. Rassure-la avec un témoignage ou une preuve sociale.",
      ready: "Elle est prête à agir. Propose directement ton offre ou un appel.",
    };

    const prompt = `${CORE_PRINCIPLES}

${ANTI_SLOP}

${ETHICAL_GUARDRAILS}

${contextStr}
${relevantOfferBlock}

CONTEXTE DU PROSPECT :
- Username : @${prospect.instagram_username}
${prospect.display_name ? `- Prénom : ${prospect.display_name}` : ""}
${prospect.activity ? `- Activité : ${prospect.activity}` : ""}
${prospect.strengths ? `- Ce qu'elle fait bien : ${prospect.strengths}` : ""}
${prospect.probable_problem ? `- Son problème probable : ${prospect.probable_problem}` : ""}
- Phase du parcours : ${prospect.decision_phase || "inconnue"} — ${phaseGuidance[prospect.decision_phase] || ""}
${prospect.relevant_offer ? `- Offre pertinente : ${prospect.relevant_offer}` : ""}

HISTORIQUE DES INTERACTIONS :
${interactions_summary || "Aucune interaction précédente."}

TYPE DE MESSAGE : ${approach_type}
${approachDescriptions[approach_type] || ""}

RÈGLES SPÉCIFIQUES DM INSTAGRAM :
- Maximum 3-4 phrases (un DM Instagram, pas un email)
- Ton naturel, comme si tu parlais à une connaissance
- PAS de formule corporate ("J'espère que tu vas bien")
- PAS de pitch commercial déguisé en question
- Commence par quelque chose de SPÉCIFIQUE à elle (pas générique)
- Si ressource gratuite : nomme la ressource précisément
- Si appel : mentionne la durée et que c'est sans engagement
- Le message doit pouvoir être copié-collé tel quel dans Instagram
- JAMAIS d'emoji excessif (1-2 max)
- JAMAIS de hashtag dans un DM

Retourne EXACTEMENT ce JSON (pas de texte autour) :
{
  "variant_a": "le premier message",
  "variant_b": "le second message, ton légèrement différent"
}`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Clean AI response: strip markdown fences, trim
    let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response");

    let variants: { variant_a: string; variant_b: string };
    try {
      variants = JSON.parse(jsonMatch[0]);
    } catch {
      // Try fixing common LLM JSON issues: unescaped newlines inside strings
      const fixed = jsonMatch[0]
        .replace(/(?<=:\s*")([\s\S]*?)(?="[\s,}])/g, (match) =>
          match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
        );
      try {
        variants = JSON.parse(fixed);
      } catch {
        // Last resort: extract variants manually
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
