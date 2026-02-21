import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { currentWeek, history } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("engagement-insight error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
