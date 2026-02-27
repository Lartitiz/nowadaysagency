import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { callAnthropic, getModelForAction } from "../_shared/anthropic.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { validateRequiredFields } from "../_shared/ai-validators.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req); const cors = corsHeaders;
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: cors });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: cors });
    }
    const userId = claims.claims.sub as string;

    const { post_text, objectif, ton_envie, platform } = await req.json();

    const missing = validateRequiredFields({ post_text, objectif, ton_envie, platform }, ["post_text", "objectif", "ton_envie", "platform"]);
    if (missing) return new Response(JSON.stringify({ error: missing }), { status: 400, headers: cors });

    // Check usage
    const limitCheck = await checkAndIncrementUsage(supabase, userId, "engagement_coaching", "coaching");
    if (limitCheck) return new Response(JSON.stringify({ error: limitCheck }), { status: 403, headers: cors });

    // Get user context
    const context = await getUserContext(supabase, userId);
    const contextStr = formatContextForAI(context, CONTEXT_PRESETS.comments);

    const systemPrompt = `Tu es une experte en engagement sur les réseaux sociaux. Tu aides des solopreneuses créatives à écrire des commentaires stratégiques qui attirent l'attention des bonnes personnes.

VOIX DE L'UTILISATRICE :
${contextStr}

RÈGLES :
- Le commentaire doit sonner NATUREL, pas copié-collé d'un template
- Pas de flatterie vide ("super post !" est inutile)
- Pas de spam ("je fais la même chose, viens voir mon profil")
- Un bon commentaire AJOUTE de la valeur : il apporte un point de vue, une expérience, une question
- Adapte au ton de la plateforme : Instagram = plus casual, LinkedIn = plus pro
- Utilise la voix de l'utilisatrice (ses expressions, son ton)
- ${platform === "linkedin" ? "Sur LinkedIn, vise 15+ mots minimum. Les commentaires courts sont ignorés par l'algorithme." : "Sur Instagram, sois authentique et engageante. Les emojis sont bienvenus mais sans excès."}

Retourne UNIQUEMENT un JSON valide, sans markdown.`;

    const userPrompt = `POST À COMMENTER :
${post_text}

OBJECTIF : ${objectif}
- visibilite : se faire remarquer par l'auteur·e du post et sa communauté
- expertise : montrer qu'on maîtrise le sujet
- conversation : créer un vrai échange, engager la discussion

TON SOUHAITÉ : ${ton_envie}

Génère 3 commentaires DIFFÉRENTS en JSON :
{
  "comments": [
    { "type": "court", "text": "1-2 lignes, percutant", "strategy": "pourquoi ce commentaire fonctionne" },
    { "type": "developpe", "text": "3-4 lignes avec une question à la fin", "strategy": "..." },
    { "type": "value_bomb", "text": "apporte un conseil ou un point de vue complémentaire", "strategy": "..." }
  ],
  "tip": "Un conseil d'engagement contextuel"
}`;

    const raw = await callAnthropic({
      model: getModelForAction("dm_comment"),
      system: systemPrompt + "\n\n" + ANTI_SLOP,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.8,
      max_tokens: 2048,
    });

    let result;
    try {
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      result = { comments: [], tip: raw };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("engagement-coaching error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur interne" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
