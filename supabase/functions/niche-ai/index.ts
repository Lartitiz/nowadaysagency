import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Subset of writing rules relevant to niche/branding formulations (not full content)
const NICHE_WRITING_RULES = `
RÈGLES D'ÉCRITURE :
- Écriture inclusive avec point médian (créateur·ice, entrepreneur·se)
- JAMAIS de tiret cadratin (—). Utilise : ou ;
- Expressions orales naturelles : "bon", "en vrai", "franchement", "j'avoue", "le truc c'est que", "du coup", "sauf que"
- Alterner phrases longues fluides et phrases courtes qui claquent
- Apartés entre parenthèses : "(Oui, même toi.)", "(Pas besoin d'être parfaite pour ça.)"
- JAMAIS de jargon marketing (funnel, lead magnet, ROI) → Langage humain
- Pas de promesses irréalistes
- Pas de superlatifs creux
- Le texte doit passer le TEST DU CAFÉ : est-ce qu'on peut le dire à voix haute sans avoir l'air d'un robot ?
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anthropic API key checked in shared helper

    const body = await req.json();
    const { type } = body;

    const p = body.profile || {};
    const profileBlock = [
      p.activite ? `- Activité : ${p.activite}` : "",
      p.mission ? `- Mission : ${p.mission}` : "",
      body.proposition?.version_final ? `- Proposition de valeur : ${body.proposition.version_final}` : "",
    ].filter(Boolean).join("\n");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "combats") {
      systemPrompt = `Tu es expert·e en branding engagé pour des solopreneuses créatives et éthiques.

${NICHE_WRITING_RULES}

PRINCIPES DE COPY ÉTHIQUE :
- IDENTIFICATION plutôt que MANIPULATION : le lecteur doit se reconnaître, pas se sentir coupable.
- PERMISSION plutôt que PRESSION : donner le droit de, pas forcer à.
- VULNÉRABILITÉ COMME ENSEIGNEMENT : partager ses galères pour éclairer, pas pour apitoyer.

L'UTILISATRICE A DÉCRIT :

Sa cause :
"${body.step_1a || ""}"

Ses combats :
"${body.step_1b || ""}"

Ce qu'elle propose à la place :
"${body.step_1c || ""}"

PROFIL :
${profileBlock}

Génère 3 à 5 combats structurés :

Pour chaque combat :
1. "Ce que je refuse" (formulé en une phrase tranchée mais pas agressive)
2. "Ce que je propose à la place" (formulé positivement)
3. "Phrase manifeste" (une phrase percutante, réutilisable en post ou en story, qui incarne ce combat. Ton engagé, direct, humain. Doit passer le test du café.)
4. "Idée de contenu" (un sujet de post concret inspiré de ce combat)

RÈGLES :
- Ton engagé mais jamais donneur·se de leçons
- Phrases complètes et fluides
- Les phrases manifestes doivent être partageables : le genre de phrase qu'on screenshote et qu'on envoie à une amie
- Utiliser les mots et expressions de l'utilisatrice quand possible

Réponds en JSON :
[
  {
    "refuse": "...",
    "propose": "...",
    "manifeste": "...",
    "idee_contenu": "..."
  }
]`;
      userPrompt = "Formule mes combats et mon manifeste.";

    } else if (type === "limits") {
      systemPrompt = `Tu es expert·e en positionnement de marque pour des solopreneuses créatives et éthiques.

${NICHE_WRITING_RULES}

L'UTILISATRICE DÉCRIT CE QU'ELLE NE VEUT PLUS :
"${body.step_2 || ""}"

PROFIL :
- Activité : ${p.activite || "?"}

Structure ses refus en 2 colonnes :

Pour chaque refus :
1. "Ce que je refuse" (formulé clairement, ton direct mais pas agressif)
2. "Ce que ça dit de ma niche" (en quoi ce refus éclaire son positionnement)

Génère 5 à 7 refus structurés. Ton empathique et direct.

Réponds en JSON :
[
  {"refuse": "...", "eclaire": "..."}
]`;
      userPrompt = "Clarifie mes limites.";

    } else if (type === "generate-niche") {
      const per = body.persona || {};
      const personaBlock = [
        per.step_1_frustrations ? `Frustrations de sa cible : "${per.step_1_frustrations}"` : "",
        per.step_2_transformation ? `Transformation rêvée : "${per.step_2_transformation}"` : "",
      ].filter(Boolean).join("\n");

      const prop = body.proposition || {};
      const propBlock = [
        prop.step_1_what ? `Ce qu'elle fait : "${prop.step_1_what}"` : "",
        prop.step_2a_process ? `Comment elle le fait : "${prop.step_2a_process}"` : "",
        prop.step_3_for_whom ? `Pour qui : "${prop.step_3_for_whom}"` : "",
        prop.version_final ? `Proposition de valeur : "${prop.version_final}"` : "",
      ].filter(Boolean).join("\n");

      const t = body.tone || {};
      const toneBlock = [
        t.tone_register ? `- Registre : ${t.tone_register}` : "",
        t.key_expressions ? `- Expressions : ${t.key_expressions}` : "",
        t.things_to_avoid ? `- Ce qu'on évite : ${t.things_to_avoid}` : "",
      ].filter(Boolean).join("\n");

      systemPrompt = `Tu es expert·e en positionnement de marque pour des solopreneuses créatives et éthiques.

${NICHE_WRITING_RULES}

PRINCIPES DE COPY ÉTHIQUE :
- IDENTIFICATION plutôt que MANIPULATION
- PERMISSION plutôt que PRESSION
- DÉSIR NATUREL plutôt qu'URGENCE ARTIFICIELLE
- CTA COMME CONVERSATION : ouvrir un dialogue, pas fermer une vente

TOUT LE BRANDING DE L'UTILISATRICE :

${propBlock}

${personaBlock}

SES COMBATS : "${body.niche_step1_summary || ""}"
CE QU'ELLE REFUSE : "${body.niche_step2_summary || ""}"

LES 4 CHAMPS DE SA NICHE :
- Marché : "${body.market || ""}"
- Niche : "${body.niche_specific || ""}"
- Besoin : "${body.need || ""}"
- Public : "${body.ideal_public || ""}"

${toneBlock ? `TON & STYLE :\n${toneBlock}` : ""}

Génère 3 formulations de sa niche :

VERSION DESCRIPTIVE (2-3 phrases) :
Claire, factuelle, complète. Explique ce qu'elle fait, pour qui, comment, et ce qui la différencie.

VERSION PITCH (1 phrase percutante, max 20 mots) :
Ultra-courte, mémorisable, utilisable en networking ou en bio. Doit passer le test du café.

VERSION MANIFESTE (3-4 phrases engagées) :
Inclut le combat, la vision, le drapeau. Plus militante, plus émotionnelle. Le genre de texte qu'on met en page À propos ou en intro de newsletter. Doit donner envie de le screenshoter.

RÈGLES :
- Ton humain, sincère, engagé
- Chaque version doit être immédiatement compréhensible
- Pas de jargon, pas de superlatifs creux
- Utiliser les mots et expressions de l'utilisatrice quand possible
- Alterner phrases longues et courtes qui claquent

Réponds en JSON :
{
  "descriptive": "...",
  "pitch": "...",
  "manifeste": "..."
}`;
      userPrompt = "Génère les 3 formulations de ma niche.";

    } else if (type === "generate-tone-recap") {
      const td = body.tone_data || {};
      const cc = body.creative_concept || "";

      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

À partir du ton, style et combats de cette marque, génère une synthèse structurée pour une fiche récap visuelle.

TON & STYLE :
- Description de la voix : "${td.voice_description || ""}"
- Registre : ${td.tone_register || ""}, Niveau : ${td.tone_level || ""}, Style : ${td.tone_style || ""}, Humour : ${td.tone_humor || ""}, Engagement : ${td.tone_engagement || ""}
- Expressions à utiliser : "${td.key_expressions || ""}"
- Ce qu'elle évite : "${td.things_to_avoid || ""}"
- Verbatims du persona : "${td.target_verbatims || ""}"

COMBATS :
- Cause principale : "${td.combat_cause || ""}"
- Combats : "${td.combat_fights || ""}"
- Ce qu'elle refuse : "${td.combat_refusals || ""}"
- Ce qu'elle propose à la place : "${td.combat_alternative || ""}"

${cc ? `CONCEPT CRÉATIF :\n"${cc}"` : ""}

Génère en JSON STRICT (pas de markdown, pas de commentaires) :
{
  "voice_oneliner": "...",
  "register_tags": ["...", "...", "..."],
  "i_am": ["...", "...", "...", "...", "..."],
  "i_am_not": ["...", "...", "...", "...", "..."],
  "my_expressions": ["...", "..."],
  "forbidden_words": ["...", "..."],
  "verbatims": ["...", "..."],
  "major_fight": {"name": "...", "description": "..."},
  "minor_fights": ["...", "...", "..."]
}

RÈGLES :
- "voice_oneliner" : Si le concept créatif existe, utilise-le. Sinon, crée une formule mémorable type "X rencontre Y". Max 15 mots.
- "register_tags" : 3-6 adjectifs courts (1-2 mots chaque) qui définissent le registre.
- "i_am" : 4-6 points positifs nuancés (ex: "Directe mais douce"). Max 5 mots chaque.
- "i_am_not" : 4-6 points en MIROIR/CONTRASTE de "i_am". Extraits des choses à éviter + déduits.
- "my_expressions" : Les expressions à utiliser, max 10.
- "forbidden_words" : Les mots/expressions à ne jamais utiliser, max 10.
- "verbatims" : Les verbatims du persona, phrases exactes, max 5. Si pas de verbatims, tableau vide.
- "major_fight" : Le combat principal. Nom court + description 1-2 phrases.
- "minor_fights" : Les combats secondaires. Noms courts uniquement. Max 4.
- Tout doit être ULTRA CONCIS (fiche visuelle)
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)
- Réponds UNIQUEMENT avec le JSON, rien d'autre`;
      userPrompt = "Génère la synthèse structurée de mon ton et mes combats.";

    } else {
      return new Response(JSON.stringify({ error: "Type non reconnu" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const quotaCheck = await checkQuota(user.id, "content");
    if (!quotaCheck.allowed) {
      return new Response(JSON.stringify({ error: quotaCheck.message }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = await callAnthropicSimple(getModelForAction("niche"), systemPrompt, userPrompt);

    await logUsage(user.id, "content", "niche");

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("niche-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
