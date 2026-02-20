import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchBrandingData(supabase: any, userId: string) {
  const [profRes, propRes, perRes, toneRes] = await Promise.all([
    supabase.from("profiles").select("prenom, activite, type_activite, cible, mission, offre").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_bio").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("voice_description, combat_cause, tone_register, key_expressions, things_to_avoid").eq("user_id", userId).maybeSingle(),
  ]);
  return { profile: profRes.data, proposition: propRes.data, persona: perRes.data, tone: toneRes.data };
}

function buildContext(data: any): string {
  const lines: string[] = [];
  const p = data.profile;
  if (p) {
    lines.push("PROFIL :");
    if (p.prenom) lines.push(`- Prénom : ${p.prenom}`);
    if (p.activite) lines.push(`- Activité : ${p.activite}`);
    if (p.cible) lines.push(`- Cible : ${p.cible}`);
  }
  if (data.proposition?.version_bio) lines.push(`\nPROPOSITION DE VALEUR : ${data.proposition.version_bio}`);
  else if (data.proposition?.version_final) lines.push(`\nPROPOSITION DE VALEUR : ${data.proposition.version_final}`);
  if (data.tone?.combat_cause) lines.push(`COMBATS : ${data.tone.combat_cause}`);
  if (data.persona?.step_1_frustrations) lines.push(`FRUSTRATIONS CIBLE : ${data.persona.step_1_frustrations}`);
  if (data.persona?.step_2_transformation) lines.push(`TRANSFORMATION : ${data.persona.step_2_transformation}`);
  return lines.join("\n");
}

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
    const branding = await fetchBrandingData(supabase, user.id);
    const context = buildContext(branding);

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "name") {
      systemPrompt = `Tu es expert·e en SEO Pinterest pour des solopreneuses créatives.\n\n${context}\n\nPropose 3 options de nom Pinterest optimisé.\nFormat : "[Prénom] — [Mot-clé principal] & [Mot-clé secondaire]"\nMax 65 caractères.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["nom 1", "nom 2", "nom 3"]`;
      userPrompt = "Génère 3 options de nom Pinterest.";

    } else if (action === "bio") {
      systemPrompt = `Tu es expert·e en SEO Pinterest.\n\n${context}\n\nGénère 3 bios Pinterest :\n- Max 160 caractères chacune\n- Inclure qui tu es, ce que tu proposes, à qui\n- Intégrer 1-2 mots-clés naturellement\n- Écriture inclusive avec point médian\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["bio 1", "bio 2", "bio 3"]`;
      userPrompt = "Génère 3 bios Pinterest.";

    } else if (action === "board-description") {
      const { board_name, board_type } = params;
      const kwRes = await supabase.from("pinterest_keywords").select("keywords_raw").eq("user_id", user.id).maybeSingle();
      const kw = kwRes.data?.keywords_raw || "";
      systemPrompt = `Tu es expert·e en SEO Pinterest.\n\nNOM DU TABLEAU : "${board_name}"\nTYPE : ${board_type}\n\n${context}\n\nMOTS-CLÉS : ${kw}\n\nRédige une description optimisée SEO (50-100 mots). Ton chaleureux, pas de hashtags.\n\nRéponds avec le texte seul.`;
      userPrompt = "Rédige la description du tableau.";

    } else if (action === "pin") {
      const { subject, board_name } = params;
      const kwRes = await supabase.from("pinterest_keywords").select("keywords_raw").eq("user_id", user.id).maybeSingle();
      const kw = kwRes.data?.keywords_raw || "";
      systemPrompt = `Tu es expert·e en SEO Pinterest.\n\nSUJET : "${subject}"\nTABLEAU : "${board_name}"\n\n${context}\n\nMOTS-CLÉS : ${kw}\nTON : ${branding.tone?.tone_register || ""}\n\nGénère 3 variantes titre + description :\nVARIANTE 1 — SEO\nVARIANTE 2 — STORYTELLING\nVARIANTE 3 — BÉNÉFICE\n\nTitre : max 100 caractères. Description : 100-200 mots, PAS de hashtags.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n[{"title": "...", "description": "..."}, {"title": "...", "description": "..."}, {"title": "...", "description": "..."}]`;
      userPrompt = "Génère titre + description pour l'épingle.";

    } else if (action === "keywords") {
      systemPrompt = `Tu es expert·e en SEO Pinterest.\n\n${context}\n\nGénère 20 mots-clés Pinterest pertinents en 4 catégories :\n1. PRODUIT (5)\n2. BESOIN (5)\n3. INSPIRATION (5)\n4. ANGLAIS (5)\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"produit": [...], "besoin": [...], "inspiration": [...], "anglais": [...]}`;
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
