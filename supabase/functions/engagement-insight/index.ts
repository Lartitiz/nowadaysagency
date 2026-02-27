import { getCorsHeaders } from "../_shared/cors.ts";
import { validateInput, ValidationError, EngagementInsightSchema } from "../_shared/input-validators.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);

    const { currentWeek, history } = validateInput(await req.json(), EngagementInsightSchema);

    // Anthropic API key checked in shared helper

    const prevWeek = history?.[0];

    function vari(curr: number | null, prev: number | null) {
      if (curr == null || prev == null || prev === 0) return "N/A";
      const pct = Math.round(((curr - prev) / prev) * 100);
      return pct > 0 ? `+${pct}%` : `${pct}%`;
    }

    const metricsText = `
Abonné·es : ${currentWeek.followers ?? "?"} (${prevWeek ? vari(currentWeek.followers, prevWeek.followers) : "1ère semaine"})
Reach moyen/post : ${currentWeek.avg_reach ?? "?"} (${prevWeek ? vari(currentWeek.avg_reach, prevWeek.avg_reach) : ""})
Likes moyen/post : ${currentWeek.avg_likes ?? "?"} (${prevWeek ? vari(currentWeek.avg_likes, prevWeek.avg_likes) : ""})
Saves moyen/post : ${currentWeek.avg_saves ?? "?"} (${prevWeek ? vari(currentWeek.avg_saves, prevWeek.avg_saves) : ""})
DM reçus : ${currentWeek.dm_received ?? "?"} (${prevWeek ? vari(currentWeek.dm_received, prevWeek.dm_received) : ""})
Visites profil : ${currentWeek.profile_visits ?? "?"} (${prevWeek ? vari(currentWeek.profile_visits, prevWeek.profile_visits) : ""})
Clics lien bio : ${currentWeek.link_clicks ?? "?"} (${prevWeek ? vari(currentWeek.link_clicks, prevWeek.link_clicks) : ""})
    `.trim();

    const prompt = `Tu es experte en stratégie Instagram pour des solopreneuses créatives.

MÉTRIQUES DE LA SEMAINE :
${metricsText}

Génère 1-2 phrases d'insight :
- Identifie la tendance la plus notable
- Donne une explication possible
- Suggère une action concrète
- Ton : direct, encourageant, pas de jargon
- Max 2 phrases courtes
- Ne commence PAS par "Tes" systématiquement, varie les tournures`;

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
          { role: "system", content: "Tu réponds en français. Tu es directe et concrète. Max 2 phrases." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) throw new Error("Trop de requêtes, réessaie dans un moment.");
      if (status === 402) throw new Error("Crédits IA insuffisants.");
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const insight = (aiData.choices?.[0]?.message?.content || "").trim();

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("engagement-insight error:", e);
    const status = e instanceof ValidationError ? 400 : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
