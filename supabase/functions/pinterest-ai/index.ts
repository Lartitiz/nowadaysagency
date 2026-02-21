import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Pinterest-specific writing principles (SEO-focused, adapted from CORE_PRINCIPLES)
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
  if (data.tone?.voice_description) lines.push(`VOIX : ${data.tone.voice_description}`);
  if (data.tone?.key_expressions) lines.push(`EXPRESSIONS CLÉS : ${data.tone.key_expressions}`);
  if (data.tone?.things_to_avoid) lines.push(`À ÉVITER : ${data.tone.things_to_avoid}`);
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
      systemPrompt = `${PINTEREST_PRINCIPLES}

${context}

Propose 3 options de nom Pinterest optimisé SEO.
Format : "[Prénom] — [Mot-clé principal] & [Mot-clé secondaire]"
Max 65 caractères.

Le nom doit :
- Être immédiatement compréhensible (on sait ce que fait la personne)
- Contenir des mots-clés que sa cible chercherait sur Pinterest
- Rester humain et pas générique

Réponds UNIQUEMENT en JSON sans backticks :
["nom 1", "nom 2", "nom 3"]`;
      userPrompt = "Génère 3 options de nom Pinterest.";

    } else if (action === "bio") {
      systemPrompt = `${PINTEREST_PRINCIPLES}

${context}

Génère 3 bios Pinterest :
- Max 160 caractères chacune
- Inclure qui tu es, ce que tu proposes, à qui
- Intégrer 1-2 mots-clés naturellement (pas de keyword stuffing)
- Ton chaleureux et engageant
- Doit donner envie de suivre ET de cliquer

Réponds UNIQUEMENT en JSON sans backticks :
["bio 1", "bio 2", "bio 3"]`;
      userPrompt = "Génère 3 bios Pinterest.";

    } else if (action === "board-description") {
      const { board_name, board_type } = params;
      const kwRes = await supabase.from("pinterest_keywords").select("keywords_raw").eq("user_id", user.id).maybeSingle();
      const kw = kwRes.data?.keywords_raw || "";
      systemPrompt = `${PINTEREST_PRINCIPLES}

NOM DU TABLEAU : "${board_name}"
TYPE : ${board_type}

${context}

MOTS-CLÉS DISPONIBLES : ${kw}

Rédige une description optimisée SEO (50-100 mots).
- Intègre les mots-clés naturellement dans des phrases fluides
- Ton chaleureux, pas robotique
- Pas de hashtags
- La description doit donner envie d'explorer le tableau
- Doit passer le test du café : ça sonne humain à voix haute

Réponds avec le texte seul.`;
      userPrompt = "Rédige la description du tableau.";

    } else if (action === "pin") {
      const { subject, board_name } = params;
      const kwRes = await supabase.from("pinterest_keywords").select("keywords_raw").eq("user_id", user.id).maybeSingle();
      const kw = kwRes.data?.keywords_raw || "";
      systemPrompt = `${PINTEREST_PRINCIPLES}

SUJET DE L'ÉPINGLE : "${subject}"
TABLEAU : "${board_name}"

${context}

MOTS-CLÉS DISPONIBLES : ${kw}
TON : ${branding.tone?.tone_register || "Non renseigné"}

Génère 3 variantes titre + description pour cette épingle :

VARIANTE 1 — SEO (mots-clés en priorité, clarté maximale)
VARIANTE 2 — STORYTELLING (accroche émotionnelle, curiosité)
VARIANTE 3 — BÉNÉFICE (résultat concret pour le lecteur)

Pour chaque variante :
- Titre : max 100 caractères, descriptif et attractif
- Description : 100-200 mots, PAS de hashtags
- Intégrer les mots-clés naturellement
- Ton humain et engageant
- Inclure un appel à l'action doux en fin de description

Réponds UNIQUEMENT en JSON sans backticks :
[{"title": "...", "description": "..."}, {"title": "...", "description": "..."}, {"title": "...", "description": "..."}]`;
      userPrompt = "Génère titre + description pour l'épingle.";

    } else if (action === "keywords") {
      systemPrompt = `${PINTEREST_PRINCIPLES}

${context}

Génère 20 mots-clés Pinterest pertinents en 4 catégories :

1. PRODUIT (5) : mots-clés liés directement à ce qu'elle vend/propose
2. BESOIN (5) : mots-clés liés aux problèmes/besoins de sa cible
3. INSPIRATION (5) : mots-clés liés à l'univers visuel et aspirationnel
4. ANGLAIS (5) : versions anglaises des meilleurs mots-clés (Pinterest est international)

Les mots-clés doivent :
- Être des termes que sa cible taperait réellement dans la barre de recherche Pinterest
- Mélanger des termes généraux (volume) et spécifiques (intention)
- Être utilisables dans les titres, descriptions et noms de tableaux

Réponds UNIQUEMENT en JSON sans backticks :
{"produit": [...], "besoin": [...], "inspiration": [...], "anglais": [...]}`;
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
