import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WEBSITE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchFullBranding(supabase: any, userId: string) {
  const [profRes, propRes, perRes, stRes, toneRes, stratRes] = await Promise.all([
    supabase.from("profiles").select("prenom, activite, type_activite, cible, mission, offre").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_bio, version_site_web").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_3b_cliches").eq("user_id", userId).maybeSingle(),
    supabase.from("storytelling").select("step_7_polished, pitch_short").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, tone_register, tone_level, tone_style, key_expressions, things_to_avoid, target_verbatims, mission, offer").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_strategy").select("pillar_major, pillar_minor_1, pillar_minor_2, creative_concept").eq("user_id", userId).maybeSingle(),
  ]);
  return { profile: profRes.data, proposition: propRes.data, persona: perRes.data, storytelling: stRes.data, tone: toneRes.data, strategy: stratRes.data };
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
  else if (prop?.version_site_web) l.push(`Proposition site web : ${prop.version_site_web}`);
  else if (prop?.version_bio) l.push(`Proposition courte : ${prop.version_bio}`);
  const per = d.persona;
  if (per) {
    if (per.step_1_frustrations) l.push(`Frustrations cible : ${per.step_1_frustrations}`);
    if (per.step_2_transformation) l.push(`Transformation rêvée : ${per.step_2_transformation}`);
    if (per.step_3a_objections) l.push(`Objections : ${per.step_3a_objections}`);
    if (per.step_3b_cliches) l.push(`Clichés : ${per.step_3b_cliches}`);
  }
  const t = d.tone;
  if (t) {
    if (t.combat_cause) l.push(`Combats : ${t.combat_cause}`);
    if (t.voice_description) l.push(`Comment elle parle : ${t.voice_description}`);
    const reg = [t.tone_register, t.tone_level, t.tone_style].filter(Boolean).join(" - ");
    if (reg) l.push(`Ton : ${reg}`);
    if (t.key_expressions) l.push(`Expressions clés : ${t.key_expressions}`);
    if (t.things_to_avoid) l.push(`Ce qu'on évite : ${t.things_to_avoid}`);
    if (t.target_verbatims) l.push(`Verbatims cible : ${t.target_verbatims}`);
  }
  if (d.storytelling?.step_7_polished) l.push(`Storytelling : ${d.storytelling.step_7_polished}`);
  if (d.storytelling?.pitch_short) l.push(`Pitch storytelling : ${d.storytelling.pitch_short}`);
  const s = d.strategy;
  if (s) {
    if (s.pillar_major) l.push(`Pilier majeur : ${s.pillar_major}`);
    if (s.creative_concept) l.push(`Concept créatif : ${s.creative_concept}`);
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

    if (action === "generate-all") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGénère les textes complets pour une page d'accueil, section par section :\n\nSECTION 1 — TITRE (HOOK)\n- 1 titre principal (max 12 mots, percutant, bénéfice client)\n- 1 sous-titre (1-2 phrases)\n\nSECTION 2 — LE PROBLÈME\n- 3 phrases max : accroche empathique + mission + promesse\n\nSECTION 3 — LES BÉNÉFICES\n- 3 phrases max : vision + objectif incarné + promesse\n\nSECTION 4 — L'OFFRE\n- Titre engageant + 4-6 points clés\n\nSECTION 5 — QUI TU ES\n- 3-4 phrases basées sur le storytelling\n\nSECTION 6 — FAQ\n- 6 questions/réponses\n\nSECTION 7 — CTA\n- 3 suggestions\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"titre": "...", "sous_titre": "...", "probleme": "...", "benefices": "...", "offre": "...", "presentation": "...", "faq": [{"question": "...", "reponse": "..."}, ...], "cta": ["...", "...", "..."]}`;
      userPrompt = "Génère toute ma page d'accueil.";

    } else if (action === "titles") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGénère 5 titres punchline pour une page d'accueil. Max 10-12 mots chacun.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["titre 1", "titre 2", "titre 3", "titre 4", "titre 5"]`;
      userPrompt = "Génère 5 titres pour ma page d'accueil.";

    } else if (action === "subtitles") {
      const { title } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\nTITRE CHOISI : "${title}"\n\n${context}\n\nGénère 3 sous-titres (1-2 phrases chacun).\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["sous-titre 1", "sous-titre 2", "sous-titre 3"]`;
      userPrompt = "Génère 3 sous-titres.";

    } else if (action === "problem") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGénère 2 versions du bloc "problème" :\nVERSION EMPATHIQUE et VERSION DIRECTE\nChacune 3 phrases max.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"empathique": "...", "directe": "..."}`;
      userPrompt = "Génère le bloc problème.";

    } else if (action === "benefits") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGénère le bloc "bénéfices" : 3 phrases max.\n\nRéponds avec le texte seul.`;
      userPrompt = "Génère le bloc bénéfices.";

    } else if (action === "offer") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGénère une présentation claire : titre engageant + 4-6 points clés.\n\nRéponds avec le texte structuré.`;
      userPrompt = "Génère la présentation de mon offre.";

    } else if (action === "presentation") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nCondense le storytelling en 3-4 phrases pour la page d'accueil.\n\nRéponds avec le texte seul.`;
      userPrompt = "Génère ma présentation personnelle.";

    } else if (action === "faq") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGénère 8-10 questions/réponses pour une FAQ. Transparentes, humaines.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n[{"question": "...", "reponse": "..."}, ...]`;
      userPrompt = "Génère ma FAQ.";

    } else if (action === "cta") {
      const { objective } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\nOBJECTIF : ${objective}\n\n${context}\n\nGénère 5 CTA (verbe à l'indicatif, direct, comme une invitation pas une pression).\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["cta 1", "cta 2", "cta 3", "cta 4", "cta 5"]`;
      userPrompt = "Génère mes CTA.";

    } else if (action === "about-page") {
      const { angle } = params;
      const angleDesc = angle === "lettre" ? "Ton intimiste, comme une lettre ouverte à ta future cliente" : angle === "manifeste" ? "Ton engagé, tes convictions d'abord, un manifeste" : "Ton narratif chronologique, ton parcours";
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nTu rédiges une page "À propos" pour un site web. Ce n'est pas un CV, c'est une page qui crée une CONNEXION avec la visiteuse.\n\nANGLE CHOISI : ${angleDesc}\n\nRédige la page à propos :\n\n1. TITRE D'ACCROCHE : une phrase qui résume la conviction, pas "À propos de moi"\n2. MON HISTOIRE : version web du storytelling (plus fluide qu'un post, plus courte qu'un article). 150-250 mots.\n3. MES VALEURS : 3-4 blocs. Chaque bloc = titre court + 2-3 phrases.\n4. MON APPROCHE : ce qui rend sa méthode unique. 100-150 mots.\n5. POUR QUI : description chaleureuse de sa cliente idéale. 50-100 mots.\n6. CTA : invitation douce à prendre contact ou découvrir l'offre.\n\nRÈGLES :\n- Écriture inclusive point médian\n- JAMAIS de tiret cadratin\n- Ton aligné avec le branding\n- La page doit sonner HUMAIN, pas corporate\n- Elle doit donner envie de travailler avec cette personne\n- Chaque section est autonome\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"title": "...", "story": "...", "values": [{"title": "...", "description": "..."}, ...], "approach": "...", "for_whom": "...", "cta": "..."}`;
      userPrompt = "Génère ma page à propos.";

    } else if (action === "plan-steps") {
      const { offer_description } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGénère un "Plan en 3 étapes" pour la page de vente.\n\nOFFRE : ${offer_description || "voir contexte"}\n\nRÈGLES :\n- EXACTEMENT 3 étapes (pas plus)\n- Chaque étape = 1 titre court (3-6 mots) + 1 phrase d'explication\n- Les étapes doivent montrer une PROGRESSION (début > milieu > résultat)\n- Langage simple, concret, pas de jargon\n- La 3e étape = le résultat désiré, pas une action\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"steps": [{"number": 1, "title": "...", "description": "..."}, {"number": 2, "title": "...", "description": "..."}, {"number": 3, "title": "...", "description": "..."}]}`;
      userPrompt = "Génère un plan en 3 étapes pour ma page de vente.";

    } else if (action === "guarantee") {
      const { guarantee_type, conditions, offer_name, offer_price } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nFormule une section garantie pour la page de vente.\n\nTYPE : ${guarantee_type}\nCONDITIONS : ${conditions || "non précisées"}\nOFFRE : ${offer_name || "voir contexte"} (${offer_price || "prix non précisé"})\n\nRÈGLES :\n- Ton direct et rassurant, pas corporate\n- La garantie réduit le risque perçu, pas la valeur perçue\n- Formuler en "tu"\n- PAS de conditions cachées\n- PAS de ton "marketing bro"\n- La garantie doit être CRÉDIBLE et HONNÊTE\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"title": "...", "body": "...", "micro_note": "..."}`;
      userPrompt = "Formule ma garantie.";

    } else if (action === "storybrand") {
      const { offer_name, offer_description, offer_price } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nTu génères une page de vente en utilisant le framework StoryBrand.\n\nPRINCIPE FONDAMENTAL : la cliente est l'héroïne de l'histoire. Pas la marque. Pas l'offre. LA CLIENTE.\nToi (l'utilisatrice) tu es le GUIDE : empathie + autorité.\n\nOFFRE : ${offer_name || "voir contexte"} - ${offer_description || ""} (${offer_price || ""})\n\nSTRUCTURE STORYBRAND :\n\n1. HERO\nLe personnage (la cliente) veut quelque chose. Formuler clairement ce désir en 1-2 phrases.\n+ Le guide (toi) se positionne en 1 phrase.\n\n2. LE PROBLÈME — 3 niveaux\na) Problème EXTERNE (le truc concret)\nb) Problème INTERNE (le ressenti)\nc) Problème PHILOSOPHIQUE (l'injustice)\nLe problème interne est le plus puissant.\n\n3. LE GUIDE (empathie + autorité)\na) Empathie : montrer qu'on comprend\nb) Autorité : preuves de crédibilité\nL'empathie AVANT l'autorité. Toujours.\n\n4. LE PLAN EN 3 ÉTAPES\n3 étapes simples, claires, numérotées.\n\n5. CTA\na) CTA direct : l'action principale\nb) CTA transitionnel : pour celles qui ne sont pas prêtes\n\n6. L'ÉCHEC (ce qui se passe si elle ne fait rien)\nUne pincée suffit. PAS de shaming. PAS de catastrophisme. MAX 2-3 phrases.\n\n7. LE SUCCÈS (la vie après)\nBénéfices émotionnels + concrets.\n\nRÈGLES STORYBRAND :\n- La cliente est TOUJOURS l'héroïne, jamais la marque\n- Le guide a de l'empathie ET de l'autorité\n- Le plan doit être en 3 étapes\n- L'échec est une pincée, le succès est un festin\n- Ton Nowadays : direct, chaleureux, oral, pas de jargon\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"hero": "...", "problem_external": "...", "problem_internal": "...", "problem_philosophical": "...", "guide_empathy": "...", "guide_authority": "...", "plan": [{"number": 1, "title": "...", "description": "..."}, ...], "cta_direct": "...", "cta_transitional": "...", "failure": "...", "success": "...", "faq": [{"question": "...", "reponse": "..."}, ...]}`;
      userPrompt = "Génère ma page de vente StoryBrand.";

    } else if (action === "failure-section") {
      const { failure_description } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nFormule une section "échec" pour la page de vente StoryBrand.\n\nCE QUI SE PASSE SI RIEN NE CHANGE : ${failure_description}\n\nRÈGLES ÉTHIQUES ABSOLUES :\n- MAX 2-3 phrases. Pas plus.\n- Nommer la frustration que la personne ressent DÉJÀ\n- NE PAS créer de peur nouvelle\n- NE PAS catastrophiser\n- NE PAS shamer\n- Ton : factuel et empathique, pas dramatique\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"failure_text": "..."}`;
      userPrompt = "Formule la section échec.";

    } else if (action === "structure-testimonial") {
      const { raw_testimonial } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nRestructure ce témoignage brut pour la page de vente.\n\nTÉMOIGNAGE BRUT :\n"${raw_testimonial}"\n\nRÈGLES ABSOLUES :\n- NE CHANGE PAS les mots de la personne\n- Tu peux RACCOURCIR (couper les répétitions, les hésitations)\n- Tu peux RÉORGANISER (mettre le résultat en premier si plus impactant)\n- Tu NE PEUX PAS ajouter des mots qu'elle n'a pas dits\n- Tu NE PEUX PAS embellir ou exagérer\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"quote": "...", "name": "...", "context": "...", "result": "...", "full_version": "...", "highlight": "..."}`;
      userPrompt = "Structure ce témoignage.";

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
    console.error("website-ai error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
