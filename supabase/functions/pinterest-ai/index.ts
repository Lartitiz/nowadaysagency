import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PINTEREST_PRINCIPLES = `
Tu es expert·e en SEO Pinterest pour des solopreneuses créatives et éthiques.

PRINCIPES D'ÉCRITURE PINTEREST :
- Pinterest est un MOTEUR DE RECHERCHE VISUEL, pas un réseau social classique
- Les mots-clés sont essentiels : intégrés naturellement, jamais en keyword stuffing
- Ton chaleureux et engageant, pas de ton corporate
- Écriture inclusive avec point médian (créateur·ice, entrepreneur·se)
- JAMAIS de tiret cadratin (—). Utilise : ou ;
- JAMAIS de jargon marketing (funnel, lead magnet, ROI) → Langage humain
- Pas de promesses irréalistes
- Pas de hashtags sur Pinterest (inutiles pour le SEO Pinterest)
- Les titres doivent être clairs, descriptifs ET attractifs
- Les descriptions doivent être utiles, pas vendeuses

PRINCIPES DE COPY ÉTHIQUE :
- IDENTIFICATION plutôt que MANIPULATION
- PERMISSION plutôt que PRESSION
- DÉSIR NATUREL plutôt qu'URGENCE ARTIFICIELLE
- CTA comme invitation, pas comme pression
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Auth requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Auth invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { action, ...params } = await req.json();

    // Fetch full user context server-side
    const ctx = await getUserContext(supabase, user.id);
    const context = formatContextForAI(ctx, CONTEXT_PRESETS.pinterest);

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "name") {
      systemPrompt = `${PINTEREST_PRINCIPLES}\n\n${context}\n\nPropose 3 options de nom Pinterest optimisé SEO.\nFormat : "[Prénom] — [Mot-clé principal] & [Mot-clé secondaire]"\nMax 65 caractères.\n\nLe nom doit :\n- Être immédiatement compréhensible\n- Contenir des mots-clés que sa cible chercherait sur Pinterest\n- Rester humain et pas générique\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["nom 1", "nom 2", "nom 3"]`;
      userPrompt = "Génère 3 options de nom Pinterest.";

    } else if (action === "bio") {
      systemPrompt = `${PINTEREST_PRINCIPLES}\n\n${context}\n\nGénère 3 bios Pinterest :\n- Max 160 caractères chacune\n- Inclure qui tu es, ce que tu proposes, à qui\n- Intégrer 1-2 mots-clés naturellement\n- Ton chaleureux et engageant\n- Doit donner envie de suivre ET de cliquer\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["bio 1", "bio 2", "bio 3"]`;
      userPrompt = "Génère 3 bios Pinterest.";

    } else if (action === "board-description") {
      const { board_name, board_type } = params;
      const kwRes = await supabase.from("pinterest_keywords").select("keywords_raw").eq("user_id", user.id).maybeSingle();
      const kw = kwRes.data?.keywords_raw || "";
      systemPrompt = `${PINTEREST_PRINCIPLES}\n\nNOM DU TABLEAU : "${board_name}"\nTYPE : ${board_type}\n\n${context}\n\nMOTS-CLÉS DISPONIBLES : ${kw}\n\nRédige une description optimisée SEO (50-100 mots).\n- Intègre les mots-clés naturellement dans des phrases fluides\n- Ton chaleureux, pas robotique\n- Pas de hashtags\n- La description doit donner envie d'explorer le tableau\n\nRéponds avec le texte seul.`;
      userPrompt = "Rédige la description du tableau.";

    } else if (action === "pin") {
      const { subject, board_name } = params;
      const kwRes = await supabase.from("pinterest_keywords").select("keywords_raw").eq("user_id", user.id).maybeSingle();
      const kw = kwRes.data?.keywords_raw || "";
      systemPrompt = `${PINTEREST_PRINCIPLES}\n\nSUJET DE L'ÉPINGLE : "${subject}"\nTABLEAU : "${board_name}"\n\n${context}\n\nMOTS-CLÉS DISPONIBLES : ${kw}\n\nGénère 3 variantes titre + description pour cette épingle :\n\nVARIANTE 1 — SEO\nVARIANTE 2 — STORYTELLING\nVARIANTE 3 — BÉNÉFICE\n\nPour chaque variante :\n- Titre : max 100 caractères\n- Description : 100-200 mots, PAS de hashtags\n- Intégrer les mots-clés naturellement\n- Ton humain et engageant\n- Inclure un appel à l'action doux en fin\n\nRéponds UNIQUEMENT en JSON sans backticks :\n[{"title": "...", "description": "..."}, {"title": "...", "description": "..."}, {"title": "...", "description": "..."}]`;
      userPrompt = "Génère titre + description pour l'épingle.";

    } else if (action === "keywords") {
      systemPrompt = `${PINTEREST_PRINCIPLES}\n\n${context}\n\nGénère 20 mots-clés Pinterest pertinents en 4 catégories :\n\n1. PRODUIT (5) : mots-clés liés directement à ce qu'elle vend/propose\n2. BESOIN (5) : mots-clés liés aux problèmes/besoins de sa cible\n3. INSPIRATION (5) : mots-clés liés à l'univers visuel et aspirationnel\n4. ANGLAIS (5) : versions anglaises des meilleurs mots-clés\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"produit": [...], "besoin": [...], "inspiration": [...], "anglais": [...]}`;
      userPrompt = "Trouve mes mots-clés Pinterest.";

    } else {
      return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.8 }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un instant." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("Oups, l'IA n'a pas pu générer. Réessaie dans un instant.");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("pinterest-ai error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
