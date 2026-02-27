import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { emotions, universe, styleAxes, userSector } = await req.json();

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
    const raw = await callAnthropicSimple(model, systemPrompt, userPrompt, 0.9, 2048);

    // Extract JSON from response
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || raw);
    } catch {
      console.error("Failed to parse AI response:", raw);
      return new Response(JSON.stringify({ error: "Erreur de format dans la réponse IA. Réessaie." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("palette-ai error:", e);
    const status = (e as any).status || 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
