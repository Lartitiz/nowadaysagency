import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LINKEDIN_PRINCIPLES, LINKEDIN_TEMPLATES, ANTI_SLOP, CHAIN_OF_THOUGHT, ETHICAL_GUARDRAILS, ANTI_BIAS } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Voice profile is fetched by getUserContext now

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

    // Check plan limits
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();
    const ctx = await getUserContext(supabase, user.id);
    const context = formatContextForAI(ctx, CONTEXT_PRESETS.linkedin);
    const qualityBlocks = `${ANTI_SLOP}\n\n${ETHICAL_GUARDRAILS}\n\n${ANTI_BIAS}\n\n${CHAIN_OF_THOUGHT}`;
    const branding = { storytelling: ctx.storytelling };

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
