import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Simple in-memory rate limiting
const ipCounts = new Map<string, { count: number; resetAt: number }>();
const handleCounts = new Map<string, number>();

function checkRateLimit(ip: string, handle: string): string | null {
  const now = Date.now();
  
  // IP: max 3/hour
  const ipEntry = ipCounts.get(ip);
  if (ipEntry && ipEntry.resetAt > now) {
    if (ipEntry.count >= 3) {
      return "Tu as déjà testé 3 profils. Crée ton compte pour des analyses illimitées 😉";
    }
    ipEntry.count++;
  } else {
    ipCounts.set(ip, { count: 1, resetAt: now + 3600000 });
  }
  
  // Handle: max 1/hour
  const handleTime = handleCounts.get(handle);
  if (handleTime && now - handleTime < 3600000) {
    return null; // silently return cached-like result
  }
  handleCounts.set(handle, now);
  
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { handle } = await req.json();
    if (!handle || typeof handle !== "string" || handle.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Handle invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanHandle = handle.trim().replace(/^@/, "").toLowerCase();
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    
    const rateLimitMsg = checkRateLimit(ip, cleanHandle);
    if (rateLimitMsg) {
      return new Response(JSON.stringify({ error: rateLimitMsg, rate_limited: true }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Lovable AI to generate a realistic mini-audit
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Tu es une experte Instagram et communication de marque. On te donne un handle Instagram. Génère un mini-audit réaliste et utile.

RÈGLES:
- Score entre 35 et 78 (jamais trop haut, jamais trop bas)
- UN SEUL insight concret et actionnable sur la bio ou le profil
- L'insight doit donner envie d'en savoir plus
- Ton : direct, bienveillant, expert
- Pas de jargon marketing
- L'insight fait max 2 phrases

Retourne UNIQUEMENT un JSON valide :
{
  "score": 62,
  "insight": "Ta bio manque de mots-clés. Les gens cherchent 'photographe portrait femmes', pas juste 'photographe'.",
  "category": "bio" | "feed" | "engagement" | "highlights" | "general"
}`
          },
          {
            role: "user",
            content: `Analyse le profil Instagram @${cleanHandle}. Génère un score et un insight réaliste basé sur le type d'activité que le handle suggère.`
          }
        ],
        temperature: 0.9,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Invalid AI response");
    
    const result = JSON.parse(jsonMatch[0]);
    
    return new Response(JSON.stringify({
      handle: cleanHandle,
      score: Math.min(78, Math.max(35, result.score || 55)),
      insight: result.insight || "Ton profil a du potentiel ! Crée ton compte pour un diagnostic complet.",
      category: result.category || "general",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("mini-audit error:", error);
    // Fallback: return a generic but useful result
    return new Response(JSON.stringify({
      handle: "profil",
      score: 52,
      insight: "Ton profil mérite un vrai diagnostic. Crée ton compte pour découvrir tes axes d'amélioration.",
      category: "general",
      fallback: true,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
