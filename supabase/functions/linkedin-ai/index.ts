import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchBrandingData(supabase: any, userId: string) {
  const [profRes, propRes, stRes, perRes, toneRes, nicheRes] = await Promise.all([
    supabase.from("profiles").select("prenom, activite, type_activite, cible, mission, offre").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("version_final, version_short, version_complete, step_1_what, step_2a_process, step_2b_values, step_3_for_whom").eq("user_id", userId).maybeSingle(),
    supabase.from("storytelling").select("step_7_polished").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_niche").select("niche_specific, version_final, version_pitch, step_1a_cause, step_1b_combats").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    profile: profRes.data,
    proposition: propRes.data,
    storytelling: stRes.data,
    persona: perRes.data,
    tone: toneRes.data,
    niche: nicheRes.data,
  };
}

function buildContext(data: any): string {
  const lines: string[] = [];
  const p = data.profile;
  if (p) {
    lines.push(`PROFIL :`);
    if (p.activite) lines.push(`- Activité : ${p.activite}`);
    if (p.mission) lines.push(`- Mission : ${p.mission}`);
    if (p.offre) lines.push(`- Offre : ${p.offre}`);
    if (p.cible) lines.push(`- Cible : ${p.cible}`);
  }
  const prop = data.proposition;
  if (prop) {
    if (prop.version_final) lines.push(`\nPROPOSITION DE VALEUR : ${prop.version_final}`);
    else if (prop.version_short) lines.push(`\nPROPOSITION DE VALEUR : ${prop.version_short}`);
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
    const reg = [t.tone_register, t.tone_level, t.tone_style].filter(Boolean).join(" - ");
    if (reg) tl.push(`- Registre : ${reg}`);
    if (t.key_expressions) tl.push(`- Expressions clés : ${t.key_expressions}`);
    if (t.things_to_avoid) tl.push(`- Ce qu'on évite : ${t.things_to_avoid}`);
    if (tl.length) lines.push(`\nTON & STYLE :\n${tl.join("\n")}`);
  }
  const n = data.niche;
  if (n) {
    if (n.niche_specific) lines.push(`\nNICHE : ${n.niche_specific}`);
    if (n.step_1a_cause) lines.push(`COMBAT : ${n.step_1a_cause}`);
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
      systemPrompt = `Tu es expert·e en personal branding LinkedIn pour des solopreneuses créatives et éthiques.

${context}

Génère 3 options de titre LinkedIn :

OPTION 1 : Format proposition de valeur
"J'aide [qui] à [quoi] grâce à [comment]"

OPTION 2 : Format poste + mots-clés
"[Poste] : [Spécialité] : [Secteur]"

OPTION 3 : Format hybride (proposition + preuve sociale)
"[Proposition courte] | [Poste] | [Preuve sociale]"

Chaque titre doit :
- Faire max 220 caractères
- Contenir des mots-clés pertinents pour le SEO LinkedIn
- Donner envie de cliquer sur le profil
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin

Réponds UNIQUEMENT en JSON sans backticks :
["titre 1", "titre 2", "titre 3"]`;
      userPrompt = "Génère 3 options de titre LinkedIn pour moi.";

    } else if (action === "summary") {
      const { passion, parcours, offre, cta } = params;
      systemPrompt = `Tu es expert·e en personal branding LinkedIn.

${context}

ÉLÉMENTS FOURNIS PAR L'UTILISATRICE :
- Sa passion : "${passion || ""}"
- Son parcours : "${parcours || ""}"
- Ce qu'elle propose : "${offre || ""}"
- Son appel à l'action : "${cta || ""}"

Génère 2 versions du résumé LinkedIn :

VERSION STORYTELLING :
- Commence par un hook percutant
- Raconte son parcours de manière narrative et émotionnelle
- Intègre sa proposition de valeur naturellement
- Finit par un appel à l'action clair
- 200-300 mots
${branding.storytelling?.step_7_polished ? "- Utilise le storytelling comme base narrative" : ""}

VERSION PRO :
- Plus structurée, factuelle
- Hook + passion + parcours + offre + CTA
- 150-200 mots

RÈGLES :
- Ton professionnel mais humain et sincère
- Pas de jargon corporate
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin
- Utiliser les expressions clés de l'utilisatrice

Réponds UNIQUEMENT en JSON sans backticks :
{"storytelling": "...", "pro": "..."}`;
      userPrompt = "Génère 2 versions de résumé LinkedIn.";

    } else if (action === "optimize-experience") {
      const { job_title, company, description } = params;
      systemPrompt = `Tu reformules des expériences LinkedIn.

Reformule cette expérience en suivant la structure :
1. Contexte : l'entreprise et son rôle (1-2 phrases)
2. Problématique : le défi ou besoin (1 phrase)
3. Solution : les actions concrètes (2-3 phrases)
4. Résultats : les bénéfices, chiffrés si possible (1-2 phrases)

Ton professionnel, engageant, concret. Pas de jargon. Écriture inclusive avec point médian. JAMAIS de tiret cadratin.

Réponds UNIQUEMENT avec le texte reformulé, sans commentaire, sans backticks.`;
      userPrompt = `Intitulé : ${job_title}\nEntreprise : ${company}\nDescription : ${description}`;

    } else if (action === "suggest-skills") {
      systemPrompt = `Tu es expert·e en personal branding LinkedIn.

${context}

Suggère 10 compétences LinkedIn pertinentes :
- 5 compétences techniques (liées au métier)
- 5 compétences comportementales (soft skills)

Chaque compétence doit la différencier. Pas de banalités.

Réponds UNIQUEMENT en JSON sans backticks :
{"techniques": ["...", ...], "comportementales": ["...", ...]}`;
      userPrompt = "Suggère des compétences LinkedIn.";

    } else if (action === "personalize-message") {
      systemPrompt = `Tu es expert·e en communication LinkedIn.

${context}

Personnalise ce message de demande de recommandation en 3 variantes adaptées au ton de l'utilisatrice.

Chaque variante doit :
- Être sincère et chaleureuse
- Faire ~3-4 phrases
- Finir par une question ou un remerciement

Réponds UNIQUEMENT en JSON sans backticks :
["variante 1", "variante 2", "variante 3"]`;
      userPrompt = "Personnalise mon message de demande de recommandation LinkedIn.";

    } else if (action === "draft-recommendation") {
      const { person_name, collab_type, highlights } = params;
      systemPrompt = `Tu rédiges un brouillon de recommandation LinkedIn.

${context}

Pour : ${person_name}
Type de collaboration : ${collab_type}
Ce qu'on veut mettre en avant : ${highlights}

Rédige un brouillon (150-200 mots) du point de vue de la personne qui recommande.
Sincère, concret, facilement personnalisable.

Réponds avec le brouillon uniquement, sans commentaire.`;
      userPrompt = "Rédige un brouillon de recommandation.";

    } else {
      return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
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
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
