import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropicToolSimple, getModelForAction, type AnthropicTool, type UsageSink } from "../_shared/anthropic.ts";

// Tool forcé : transport JSON garanti (chantier éradication parse texte, 26/07).
const PALETTE_TOOL: AnthropicTool = {
  name: "rendre_palettes",
  description: "Renvoie 3 palettes de couleurs personnalisées.",
  input_schema: {
    type: "object",
    properties: {
      palettes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            explanation: { type: "string" },
            colors: {
              type: "object",
              properties: {
                primary: { type: "string" },
                secondary: { type: "string" },
                accent: { type: "string" },
                background: { type: "string" },
                text: { type: "string" },
              },
              required: ["primary", "secondary", "accent", "background", "text"],
            },
          },
          required: ["name", "colors"],
        },
      },
    },
    required: ["palettes"],
  },
};
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);

    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    const { emotions, universe, styleAxes, userSector } = await req.json();

    const quota = await checkQuota(userId, "content");
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!emotions?.length || !universe) {
      return new Response(JSON.stringify({ error: "Sélectionne au moins une émotion et un univers visuel." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emotionLabels: Record<string, string> = {
      confidence: "Confiance et expertise",
      warmth: "Chaleur et proximité",
      energy: "Énergie et audace",
      calm: "Calme et sérénité",
      creativity: "Créativité et originalité",
      engagement: "Engagement et conviction",
    };

    const universeLabels: Record<string, string> = {
      warm: "Tons chauds (terracotta, miel, rouille)",
      cool: "Tons froids (bleu, vert sauge, gris)",
      pop: "Pop & coloré (rose, jaune, bleu électrique)",
      minimal: "Minimaliste & neutre (noir, blanc, beige)",
      nature: "Nature & organique (vert forêt, brun, crème)",
    };

    const softBold = styleAxes?.softBold ?? 50;
    const classicModern = styleAxes?.classicModern ?? 50;

    const systemPrompt = `Tu es une directrice artistique spécialisée en branding pour entrepreneures. Tu crées des palettes de couleurs cohérentes, professionnelles et différenciantes.

RÈGLES STRICTES :
- Retourne EXACTEMENT un JSON valide, rien d'autre (pas de markdown, pas de commentaires)
- Chaque palette a exactement 5 couleurs en format hex (#RRGGBB)
- Les couleurs doivent être harmonieuses et utilisables sur un site web
- La couleur "background" doit être très claire (>90% luminosité) ou très sombre pour le dark mode
- La couleur "text" doit avoir un contraste suffisant avec "background"
- Chaque palette doit être distincte des autres`;

    const userPrompt = `Génère 3 palettes de couleurs personnalisées pour une entrepreneure avec ces préférences :

ÉMOTIONS SOUHAITÉES : ${emotions.map((e: string) => emotionLabels[e] || e).join(", ")}
UNIVERS VISUEL : ${universeLabels[universe] || universe}
STYLE : ${softBold < 30 ? "Très doux et féminin" : softBold < 50 ? "Plutôt doux" : softBold < 70 ? "Équilibré" : softBold < 85 ? "Plutôt bold et affirmé" : "Très bold et affirmé"}
ÉPOQUE : ${classicModern < 30 ? "Très classique et intemporel" : classicModern < 50 ? "Plutôt classique" : classicModern < 70 ? "Équilibré" : classicModern < 85 ? "Plutôt moderne et tendance" : "Très moderne et tendance"}
${userSector ? `SECTEUR D'ACTIVITÉ : ${userSector}` : ""}

Retourne ce JSON exactement :
{
  "palettes": [
    {
      "name": "Nom évocateur de la palette",
      "explanation": "1 phrase expliquant pourquoi cette palette correspond aux choix",
      "colors": {
        "primary": "#hex",
        "secondary": "#hex",
        "accent": "#hex",
        "background": "#hex",
        "text": "#hex"
      }
    }
  ]
}`;

    const model = getModelForAction("content");
    const usage: UsageSink = {};
    const parsed: any = await callAnthropicToolSimple(model, systemPrompt, userPrompt, PALETTE_TOOL, 0.9, 2048, usage, 60_000);

    // Garde de contenu : le schéma garantit la FORME, pas la présence — zéro
    // palette = inutilisable, erreur franche sans facturer.
    if (!Array.isArray(parsed.palettes) || parsed.palettes.length === 0) {
      console.error("palette-ai: sortie sans palettes");
      return new Response(JSON.stringify({ error: "Erreur de format dans la réponse IA. Réessaie." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logUsage(userId, "content", "palette_ai", usage.total_tokens, usage.model);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("palette-ai error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
