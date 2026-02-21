import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LINKEDIN_PRINCIPLES } from "../_shared/copywriting-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchBrandingData(supabase: any, userId: string) {
  const [profRes, propRes, stRes, perRes, toneRes] = await Promise.all([
    supabase.from("profiles").select("prenom, activite, type_activite, cible, mission, offre").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_bio, step_1_what, step_2a_process, step_2b_values, step_3_for_whom").eq("user_id", userId).maybeSingle(),
    supabase.from("storytelling").select("step_7_polished").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    profile: profRes.data,
    proposition: propRes.data,
    storytelling: stRes.data,
    persona: perRes.data,
    tone: toneRes.data,
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
    else if (prop.version_bio) lines.push(`\nPROPOSITION DE VALEUR : ${prop.version_bio}`);
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

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "title") {
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\nGénère 3 options de titre LinkedIn :\n\nOPTION 1 : Format proposition de valeur\n"J'aide [qui] à [quoi] grâce à [comment]"\n\nOPTION 2 : Format poste + mots-clés\n"[Poste] : [Spécialité] : [Secteur]"\n\nOPTION 3 : Format hybride\n"[Proposition courte] | [Poste] | [Preuve sociale]"\n\nChaque titre doit :\n- Faire max 220 caractères\n- Contenir des mots-clés pertinents pour le SEO LinkedIn\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["titre 1", "titre 2", "titre 3"]`;
      userPrompt = "Génère 3 options de titre LinkedIn pour moi.";

    } else if (action === "summary") {
      const { passion, parcours, offre, cta } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\nÉLÉMENTS FOURNIS :\n- Sa passion : "${passion || ""}"\n- Son parcours : "${parcours || ""}"\n- Ce qu'elle propose : "${offre || ""}"\n- Son appel à l'action : "${cta || ""}"\n\nGénère 2 versions du résumé LinkedIn :\n\nVERSION STORYTELLING :\n- Hook percutant, parcours narratif, proposition de valeur naturelle, CTA clair\n- 200-300 mots\n${branding.storytelling?.step_7_polished ? "- Utilise le storytelling comme base narrative" : ""}\n\nVERSION PRO :\n- Plus structurée, factuelle\n- 150-200 mots\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"storytelling": "...", "pro": "..."}`;
      userPrompt = "Génère 2 versions de résumé LinkedIn.";

    } else if (action === "optimize-experience") {
      const { job_title, company, description } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\nReformule cette expérience :\n1. Contexte (1-2 phrases)\n2. Problématique (1 phrase)\n3. Solution (2-3 phrases)\n4. Résultats (1-2 phrases)\n\nTon professionnel, engageant, concret.\n\nRéponds UNIQUEMENT avec le texte reformulé.`;
      userPrompt = `Intitulé : ${job_title}\nEntreprise : ${company}\nDescription : ${description}`;

    } else if (action === "suggest-skills") {
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\nSuggère 10 compétences LinkedIn pertinentes :\n- 5 compétences techniques\n- 5 compétences comportementales\n\nRéponds UNIQUEMENT en JSON sans backticks :\n{"techniques": ["...", ...], "comportementales": ["...", ...]}`;
      userPrompt = "Suggère des compétences LinkedIn.";

    } else if (action === "personalize-message") {
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\nPersonnalise ce message de demande de recommandation en 3 variantes adaptées au ton de l'utilisatrice.\n\nChaque variante : sincère, chaleureuse, 3-4 phrases.\n\nRéponds UNIQUEMENT en JSON sans backticks :\n["variante 1", "variante 2", "variante 3"]`;
      userPrompt = "Personnalise mon message de demande de recommandation LinkedIn.";

    } else if (action === "draft-recommendation") {
      const { person_name, collab_type, highlights } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\nPour : ${person_name}\nType de collaboration : ${collab_type}\nCe qu'on veut mettre en avant : ${highlights}\n\nRédige un brouillon (150-200 mots) du point de vue de la personne qui recommande.\nSincère, concret, facilement personnalisable.\n\nRéponds avec le brouillon uniquement.`;
      userPrompt = "Rédige un brouillon de recommandation.";

    } else if (action === "analyze-resume") {
      const { existing_resume } = params;
      systemPrompt = `${LINKEDIN_PRINCIPLES}\n\n${context}\n\nTu es experte en optimisation de profils LinkedIn pour des solopreneuses créatives et engagées.\n\nRÉSUMÉ LINKEDIN ACTUEL DE L'UTILISATRICE :\n"""\n${existing_resume}\n"""\n\nANALYSE le résumé selon les 5 éléments d'un bon résumé LinkedIn :\n\n1. HOOK (les 3 premières lignes) : accrocheur ? donne envie de cliquer "voir plus" ?\n2. PASSION : explique pourquoi elle fait ce métier ?\n3. PARCOURS : d'où elle vient, en 2-3 phrases max ?\n4. PROPOSITION : pour qui elle travaille, quel résultat concret ?\n5. CTA : invitation à passer à l'action ?\n\nRETOURNE UNIQUEMENT un JSON valide, pas de texte avant ou après :\n{\n  "score": 55,\n  "summary": {\n    "positives": ["max 2 items, 1 phrase chacun"],\n    "improvements": ["max 2 items, 1 phrase chacun"]\n  },\n  "recommendations": [\n    {\n      "number": 1,\n      "title": "Hook : manquant",\n      "status": "missing",\n      "explanation": "1-2 phrases max.",\n      "example": "Exemple concret optionnel"\n    }\n  ],\n  "proposed_version": "Version améliorée complète du résumé..."\n}\n\nRÈGLES :\n- "title" : MAX 8 mots.\n- "status" : "good", "partial" ou "missing"\n- "explanation" : MAX 2 phrases.\n- "example" : 1 exemple concret si status != "good".\n- "recommendations" : exactement 5 items (un par élément).\n- "proposed_version" : résumé complet amélioré, 1500-2000 caractères.\n- Pas de markdown dans le JSON.\n- Utilise le branding pour personnaliser.`;
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
