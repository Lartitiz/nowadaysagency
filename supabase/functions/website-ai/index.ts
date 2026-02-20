import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchFullBranding(supabase: any, userId: string) {
  const [profRes, propRes, perRes, nicheRes, stRes, toneRes, stratRes] = await Promise.all([
    supabase.from("profiles").select("prenom, activite, type_activite, cible, mission, offre").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_short, version_complete").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_niche").select("niche_specific, version_pitch, step_1a_cause").eq("user_id", userId).maybeSingle(),
    supabase.from("storytelling").select("step_7_polished, pitch_short").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("tone_register, tone_level, tone_style, key_expressions, things_to_avoid, target_verbatims, mission, offer").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_strategy").select("cloud_offer, cloud_universe").eq("user_id", userId).maybeSingle(),
  ]);
  return { profile: profRes.data, proposition: propRes.data, persona: perRes.data, niche: nicheRes.data, storytelling: stRes.data, tone: toneRes.data, strategy: stratRes.data };
}

function buildContext(d: any): string {
  const l: string[] = [];
  const p = d.profile;
  if (p) {
    if (p.activite) l.push(`Activité : ${p.activite}`);
    if (p.offre) l.push(`Offre : ${p.offre}`);
    if (p.cible) l.push(`Cible : ${p.cible}`);
    if (p.mission) l.push(`Mission : ${p.mission}`);
  }
  const prop = d.proposition;
  if (prop?.version_final) l.push(`Proposition de valeur : ${prop.version_final}`);
  else if (prop?.version_short) l.push(`Proposition courte : ${prop.version_short}`);
  const per = d.persona;
  if (per) {
    if (per.step_1_frustrations) l.push(`Frustrations cible : ${per.step_1_frustrations}`);
    if (per.step_2_transformation) l.push(`Transformation rêvée : ${per.step_2_transformation}`);
    if (per.step_3a_objections) l.push(`Objections : ${per.step_3a_objections}`);
    if (per.step_3b_cliches) l.push(`Clichés : ${per.step_3b_cliches}`);
  }
  if (d.niche?.niche_specific) l.push(`Niche : ${d.niche.niche_specific}`);
  if (d.niche?.step_1a_cause) l.push(`Combats : ${d.niche.step_1a_cause}`);
  if (d.storytelling?.step_7_polished) l.push(`Storytelling : ${d.storytelling.step_7_polished}`);
  if (d.storytelling?.pitch_short) l.push(`Pitch storytelling : ${d.storytelling.pitch_short}`);
  const t = d.tone;
  if (t) {
    const reg = [t.tone_register, t.tone_level, t.tone_style].filter(Boolean).join(" - ");
    if (reg) l.push(`Ton : ${reg}`);
    if (t.key_expressions) l.push(`Expressions clés : ${t.key_expressions}`);
    if (t.things_to_avoid) l.push(`Ce qu'on évite : ${t.things_to_avoid}`);
    if (t.target_verbatims) l.push(`Verbatims cible : ${t.target_verbatims}`);
  }
  return l.join("\n");
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
    const branding = await fetchFullBranding(supabase, user.id);
    const context = buildContext(branding);

    let systemPrompt = "";
    let userPrompt = "";

    const rules = `\nRÈGLES :\n- Ton humain, sincère, engageant\n- Pas de jargon marketing\n- Écriture inclusive avec point médian\n- JAMAIS de tiret cadratin (—)\n- Utiliser les expressions et le ton de l'utilisatrice`;

    if (action === "generate-all") {
      systemPrompt = `Tu es expert·e en copywriting de pages de vente pour des solopreneuses créatives et éthiques.\n\n${context}\n\nGénère les textes complets pour une page d'accueil, section par section :\n\nSECTION 1 — TITRE (HOOK)\n- 1 titre principal (max 12 mots, percutant, bénéfice client)\n- 1 sous-titre (1-2 phrases, précise comment et pour qui)\n\nSECTION 2 — LE PROBLÈME\n- 3 phrases max : accroche empathique + mission + promesse\n- Utilise les frustrations du persona\n\nSECTION 3 — LES BÉNÉFICES\n- 3 phrases max : vision + objectif incarné + promesse\n- Utilise la transformation rêvée du persona\n\nSECTION 4 — L'OFFRE\n- Titre engageant + 4-6 points clés en positif + ce que l'offre comprend\n\nSECTION 5 — QUI TU ES\n- 3-4 phrases : point de départ + déclic + lien avec la cliente\n- Basé sur le storytelling\n\nSECTION 6 — FAQ\n- 6 questions/réponses basées sur les objections et clichés du persona\n- Ton humain, transparent, rassurant\n\nSECTION 7 — CTA\n- 3 suggestions de CTA principal (verbe à l'indicatif, direct)${rules}\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"titre": "...", "sous_titre": "...", "probleme": "...", "benefices": "...", "offre": "...", "presentation": "...", "faq": [{"question": "...", "reponse": "..."}, ...], "cta": ["...", "...", "..."]}`;
      userPrompt = "Génère toute ma page d'accueil.";

    } else if (action === "titles") {
      systemPrompt = `Tu es expert·e en copywriting.\n\n${context}\n\nGénère 5 titres punchline pour une page d'accueil.\n\nRespecte ces 5 ingrédients :\n1. Court : max 10-12 mots\n2. Simple : compréhensible immédiatement\n3. Surprenant : pique la curiosité\n4. Bénéfice client : résultat concret\n5. Engageant : donne envie d'en savoir plus\n\nUtilise ces formules :\n- 1 titre "bénéfice simple"\n- 1 titre "bénéfice + désir profond"\n- 1 titre "comment + désir"\n- 1 titre "citer un problème"\n- 1 titre libre/créatif${rules}\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["titre 1", "titre 2", "titre 3", "titre 4", "titre 5"]`;
      userPrompt = "Génère 5 titres pour ma page d'accueil.";

    } else if (action === "subtitles") {
      const { title } = params;
      systemPrompt = `Tu es expert·e en copywriting.\n\nTITRE CHOISI : "${title}"\n\n${context}\n\nGénère 3 sous-titres (1-2 phrases chacun) qui :\n- Précisent comment le bénéfice est apporté\n- Indiquent pour qui c'est\n- Ajoutent une preuve ou un détail rassurant\n\nFormules :\n- 1 version "bénéfice + méthode"\n- 1 version "bénéfice + preuve"\n- 1 version "bénéfice + temporalité"${rules}\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["sous-titre 1", "sous-titre 2", "sous-titre 3"]`;
      userPrompt = "Génère 3 sous-titres.";

    } else if (action === "problem") {
      systemPrompt = `Tu es expert·e en copywriting.\n\n${context}\n\nGénère 2 versions du bloc "problème" pour la page d'accueil :\n\nVERSION EMPATHIQUE (plus émotionnelle, storytelling)\nVERSION DIRECTE (plus factuelle, percutante)\n\nChaque version : 3 phrases max.\nStructure : accroche empathique + mission + promesse.${rules}\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"empathique": "...", "directe": "..."}`;
      userPrompt = "Génère le bloc problème.";

    } else if (action === "benefits") {
      systemPrompt = `Tu es expert·e en copywriting.\n\n${context}\n\nGénère le bloc "bénéfices" : 3 phrases max.\nStructure : vision concrète + objectif incarné + promesse d'accompagnement.\nSubtil, pas trop vendeuse. Images concrètes.${rules}\n\nRéponds avec le texte seul.`;
      userPrompt = "Génère le bloc bénéfices.";

    } else if (action === "offer") {
      systemPrompt = `Tu es expert·e en copywriting.\n\n${context}\n\nGénère une présentation claire :\n- Titre engageant\n- 4-6 points clés (positifs, bénéfices, pas de jargon)\n- Ce que l'offre comprend${rules}\n\nRéponds avec le texte structuré.`;
      userPrompt = "Génère la présentation de mon offre.";

    } else if (action === "presentation") {
      systemPrompt = `Tu es expert·e en copywriting.\n\n${context}\n\nCondense le storytelling en 3-4 phrases pour la page d'accueil.\nStructure : problème personnel + déclic + lien avec la cliente.\nTon fluide, direct, authentique.${rules}\n\nRéponds avec le texte seul.`;
      userPrompt = "Génère ma présentation personnelle.";

    } else if (action === "faq") {
      systemPrompt = `Tu es expert·e en copywriting.\n\n${context}\n\nGénère 8-10 questions/réponses pour une FAQ de page d'accueil.\n\nLes questions doivent :\n- Répondre aux objections avant l'achat\n- Rassurer un·e client·e qui découvre\n- Couvrir les aspects pratiques (livraison, retours, paiement si pertinent)\n\nLes réponses doivent être :\n- Claires, pas de jargon\n- Transparentes\n- Humaines\n- Avec des preuves si possible${rules}\n\nRéponds UNIQUEMENT en JSON sans backticks :\n[{"question": "...", "reponse": "..."}, ...]`;
      userPrompt = "Génère ma FAQ.";

    } else if (action === "cta") {
      const { objective } = params;
      systemPrompt = `Tu es expert·e en copywriting.\n\nOBJECTIF PRINCIPAL : ${objective}\n\n${context}\n\nGénère 5 CTA (appels à l'action) adaptés :\n- Verbe à l'indicatif\n- Simple et direct\n- Dit ce qui se passe après le clic\n- Pas de "clique ici" ou "plus d'infos"${rules}\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["cta 1", "cta 2", "cta 3", "cta 4", "cta 5"]`;
      userPrompt = "Génère mes CTA.";

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
      throw new Error(`AI error: ${response.status} - ${t}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
