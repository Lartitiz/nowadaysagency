import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LINKEDIN_PRINCIPLES, LINKEDIN_TEMPLATES, ANTI_SLOP, CHAIN_OF_THOUGHT, ETHICAL_GUARDRAILS, ANTI_BIAS } from "../_shared/copywriting-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchBrandingData(supabase: any, userId: string) {
  const [profRes, propRes, stRes, perRes, toneRes, voiceRes] = await Promise.all([
    supabase.from("profiles").select("prenom, activite, type_activite, cible, mission, offre").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_bio, step_1_what, step_2a_process, step_2b_values, step_3_for_whom").eq("user_id", userId).maybeSingle(),
    supabase.from("storytelling").select("step_7_polished").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims").eq("user_id", userId).maybeSingle(),
    supabase.from("voice_profile").select("structure_patterns, tone_patterns, signature_expressions, banned_expressions, voice_summary").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    profile: profRes.data,
    proposition: propRes.data,
    storytelling: stRes.data,
    persona: perRes.data,
    tone: toneRes.data,
    voice: voiceRes.data,
  };
}

function buildContext(data: any): string {
  const lines: string[] = [];
  const p = data.profile;
  if (p) {
    lines.push("PROFIL :");
    if (p.activite) lines.push(`- Activité : ${p.activite}`);
    if (p.mission) lines.push(`- Mission : ${p.mission}`);
    if (p.offre) lines.push(`- Offre : ${p.offre}`);
    if (p.cible) lines.push(`- Cible : ${p.cible}`);
  }
  const prop = data.proposition;
  if (prop) {
    if (prop.version_final) lines.push(`\nPROPOSITION DE VALEUR : ${prop.version_final}`);
    if (prop.step_1_what) lines.push(`- Ce qu'elle fait : ${prop.step_1_what}`);
    if (prop.step_3_for_whom) lines.push(`- Pour qui : ${prop.step_3_for_whom}`);
  }
  if (data.storytelling?.step_7_polished) lines.push(`\nSTORYTELLING :\n${data.storytelling.step_7_polished}`);
  const per = data.persona;
  if (per) {
    if (per.step_1_frustrations) lines.push(`\nFRUSTRATIONS CIBLE : ${per.step_1_frustrations}`);
    if (per.step_2_transformation) lines.push(`TRANSFORMATION RÊVÉE : ${per.step_2_transformation}`);
  }
  const t = data.tone;
  if (t) {
    const tl: string[] = [];
    if (t.voice_description) tl.push(`- Comment elle parle : ${t.voice_description}`);
    const reg = [t.tone_register, t.tone_level, t.tone_style].filter(Boolean).join(" - ");
    if (reg) tl.push(`- Registre : ${reg}`);
    if (t.key_expressions) tl.push(`- Expressions clés : ${t.key_expressions}`);
    if (t.things_to_avoid) tl.push(`- Ce qu'on évite : ${t.things_to_avoid}`);
    if (tl.length) lines.push(`\nTON & STYLE :\n${tl.join("\n")}`);
    if (t.combat_cause) lines.push(`\nCOMBATS : ${t.combat_cause}`);
  }
  // Voice profile
  const v = data.voice;
  if (v) {
    lines.push("\nPROFIL DE VOIX :");
    if (v.signature_expressions) lines.push(`- Expressions signature : ${JSON.stringify(v.signature_expressions)}`);
    if (v.banned_expressions) lines.push(`- Expressions interdites : ${JSON.stringify(v.banned_expressions)}`);
    if (v.voice_summary) lines.push(`- Style résumé : ${v.voice_summary}`);
  }
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { action, ...params } = await req.json();
    const branding = await fetchBrandingData(supabase, user.id);
    const context = buildContext(branding);
    const qualityBlocks = `${ANTI_SLOP}\n\n${ETHICAL_GUARDRAILS}\n\n${ANTI_BIAS}\n\n${CHAIN_OF_THOUGHT}`;

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "title") {
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\n${qualityBlocks}\n\nGénère 3 options de titre LinkedIn :\n\nOPTION 1 : Format proposition de valeur\n"J'aide [qui] à [quoi] grâce à [comment]"\n\nOPTION 2 : Format poste + mots-clés\n"[Poste] : [Spécialité] : [Secteur]"\n\nOPTION 3 : Format hybride\n"[Proposition courte] | [Poste] | [Preuve sociale]"\n\nChaque titre doit faire max 220 caractères et contenir des mots-clés pour le SEO LinkedIn.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["titre 1", "titre 2", "titre 3"]`;
      userPrompt = "Génère 3 options de titre LinkedIn pour moi.";

    } else if (action === "summary") {
      const { passion, parcours, offre, cta } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\n${qualityBlocks}\n\nÉLÉMENTS FOURNIS :\n- Sa passion : "${passion || ""}"\n- Son parcours : "${parcours || ""}"\n- Ce qu'elle propose : "${offre || ""}"\n- Son appel à l'action : "${cta || ""}"\n\nGénère 2 versions du résumé LinkedIn :\n\nVERSION STORYTELLING :\n- Hook percutant, parcours narratif, proposition de valeur naturelle, CTA clair\n- 200-300 mots\n${branding.storytelling?.step_7_polished ? "- Utilise le storytelling comme base narrative" : ""}\n\nVERSION PRO :\n- Plus structurée, factuelle\n- 150-200 mots\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"storytelling": "...", "pro": "..."}`;
      userPrompt = "Génère 2 versions de résumé LinkedIn.";

    } else if (action === "generate-post") {
      const { template, audience, sujet, anecdote, emotion, conviction } = params;
      const templateContent = (LINKEDIN_TEMPLATES as any)[template] || "";
      
      let personalBlock = "";
      if (anecdote || emotion || conviction) {
        personalBlock = `\nÉLÉMENTS PERSONNELS :\n${anecdote ? `- Anecdote : "${anecdote}"` : ""}\n${emotion ? `- Émotion visée : ${emotion}` : ""}\n${conviction ? `- Conviction : "${conviction}"` : ""}`;
      }

      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\n${qualityBlocks}\n\nAUDIENCE : ${audience || "solopreneuses"}\n${audience === "structures" ? "Utilise le vouvoiement chaleureux." : "Utilise le tutoiement."}\n\n${templateContent}\n${personalBlock}\n\nRETOURNE UNIQUEMENT un JSON valide sans backticks :\n{\n  "hook": "Les 210 premiers caractères",\n  "body": "Le corps complet avec sauts de ligne",\n  "cta": "La question ou invitation finale",\n  "full_text": "Le post complet prêt à copier",\n  "character_count": 1247,\n  "hashtags": [],\n  "template_used": "${template}",\n  "checklist": [\n    { "item": "Accroche dans les 210 car.", "ok": true },\n    { "item": "Paragraphes courts", "ok": true },\n    { "item": "Opinion visible", "ok": true },\n    { "item": "Exemple concret", "ok": true },\n    { "item": "0-2 emojis", "ok": true },\n    { "item": "0-2 hashtags", "ok": true },\n    { "item": "Pas de lien dans le corps", "ok": true },\n    { "item": "CTA question ouverte", "ok": true },\n    { "item": "Écriture inclusive", "ok": true },\n    { "item": "Pas de tiret cadratin", "ok": true }\n  ]\n}`;
      userPrompt = `Rédige un post LinkedIn sur ce sujet : "${sujet || "sujet libre"}"`;

    } else if (action === "adapt-instagram") {
      const { postContent, audience } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\n${qualityBlocks}\n\nADAPTE ce post Instagram pour LinkedIn.\n\nPOST INSTAGRAM :\n${postContent}\n\nAUDIENCE LINKEDIN : ${audience || "solopreneuses"}\n${audience === "structures" ? "Utilise le vouvoiement chaleureux." : "Utilise le tutoiement."}\n\nRÈGLES :\n1. ACCROCHE : reformuler pour les 210 premiers caractères LinkedIn\n2. LONGUEUR : développer à 800-2000 caractères\n3. TON : garder le style mais légèrement plus expert·e\n4. RÉFÉRENCES : ajouter 1-2 données si pertinent\n5. EMOJIS : 0-2 max\n6. HASHTAGS : 0-2 max\n7. CTA : question ouverte ou invitation DM pro\n8. STRUCTURE : paragraphes courts, espacement blanc\n\nNE PAS copier-coller. C'est une RÉÉCRITURE.\n\nRETOURNE UNIQUEMENT un JSON valide sans backticks :\n{\n  "hook": "210 premiers caractères",\n  "full_text": "Le post LinkedIn complet",\n  "character_count": 1247,\n  "hashtags": [],\n  "checklist": [\n    { "item": "Accroche dans les 210 car.", "ok": true },\n    { "item": "0-2 emojis", "ok": true },\n    { "item": "0-2 hashtags", "ok": true },\n    { "item": "Pas de lien dans le corps", "ok": true },\n    { "item": "Écriture inclusive", "ok": true }\n  ]\n}`;
      userPrompt = "Adapte ce post Instagram pour LinkedIn.";

    } else if (action === "crosspost") {
      const { sourceContent, sourceType, targetChannels } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\n${qualityBlocks}\n\nCONTENU SOURCE (${sourceType || "texte libre"}) :\n${sourceContent}\n\nADAPTE pour : ${JSON.stringify(targetChannels)}\n\nRÈGLES :\n- Chaque canal prend un ANGLE DIFFÉRENT du contenu source\n- LinkedIn : ton expert, 800-2000 car., 0-2 hashtags, question ouverte\n- Instagram : ton complice, 800-1500 car., 3-5 hashtags, CTA doux\n- Reel : script avec hook 0-3s, timing, cuts, 30-60 sec\n- Stories : séquence 5 stories, ton intime, stickers\n\nNE PAS copier-coller entre les canaux. Chaque version est une réécriture.\n\nRETOURNE un JSON :\n{\n  "versions": {\n    "linkedin": { "full_text": "...", "character_count": 1200, "angle_choisi": "..." },\n    "instagram": { "full_text": "...", "character_count": 900, "angle_choisi": "..." },\n    "reel": { "script": "...", "duration": "30-60s", "angle_choisi": "..." },\n    "stories": { "sequence": [...], "angle_choisi": "..." }\n  }\n}\nN'inclus que les canaux demandés.`;
      userPrompt = "Adapte ce contenu pour chaque canal demandé.";

    } else if (action === "optimize-experience") {
      const { job_title, company, description } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${qualityBlocks}\n\nReformule cette expérience :\n1. Contexte (1-2 phrases)\n2. Problématique (1 phrase)\n3. Solution (2-3 phrases)\n4. Résultats (1-2 phrases)\n\nTon professionnel, engageant, concret.\n\nRéponds UNIQUEMENT avec le texte reformulé.`;
      userPrompt = `Intitulé : ${job_title}\nEntreprise : ${company}\nDescription : ${description}`;

    } else if (action === "suggest-skills") {
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\nSuggère 10 compétences LinkedIn pertinentes :\n- 5 compétences techniques\n- 5 compétences comportementales\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"techniques": ["...", ...], "comportementales": ["...", ...]}`;
      userPrompt = "Suggère des compétences LinkedIn.";

    } else if (action === "personalize-message") {
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\n${qualityBlocks}\n\nPersonnalise ce message de demande de recommandation en 3 variantes adaptées au ton de l'utilisatrice.\n\nChaque variante : sincère, chaleureuse, 3-4 phrases.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["variante 1", "variante 2", "variante 3"]`;
      userPrompt = "Personnalise mon message de demande de recommandation LinkedIn.";

    } else if (action === "draft-recommendation") {
      const { person_name, collab_type, highlights } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\nPour : ${person_name}\nType de collaboration : ${collab_type}\nCe qu'on veut mettre en avant : ${highlights}\n\nRédige un brouillon (150-200 mots) du point de vue de la personne qui recommande.\nSincère, concret, facilement personnalisable.\n\nRéponds avec le brouillon uniquement.`;
      userPrompt = "Rédige un brouillon de recommandation.";

    } else if (action === "analyze-resume") {
      const { existing_resume } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\n${qualityBlocks}\n\nRÉSUMÉ LINKEDIN ACTUEL :\n"""\n${existing_resume}\n"""\n\nANALYSE le résumé selon 5 éléments :\n1. HOOK (3 premières lignes)\n2. PASSION\n3. PARCOURS\n4. PROPOSITION\n5. CTA\n\nRETOURNE UNIQUEMENT un JSON valide :\n{\n  "score": 55,\n  "summary": { "positives": ["max 2"], "improvements": ["max 2"] },\n  "recommendations": [\n    { "number": 1, "title": "max 8 mots", "status": "good|partial|missing", "explanation": "max 2 phrases", "example": "optionnel" }\n  ],\n  "proposed_version": "Version améliorée complète, 1500-2000 caractères."\n}`;
      userPrompt = "Analyse et améliore mon résumé LinkedIn existant.";

    } else {
      return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      throw new Error("Oups, l'IA n'a pas pu générer. Réessaie dans un instant.");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("linkedin-ai error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
