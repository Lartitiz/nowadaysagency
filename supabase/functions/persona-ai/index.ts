import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple } from "../_shared/anthropic.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildProfileBlock(p: any) {
  return [
    p.activite ? `- Activité : ${p.activite}` : "",
    p.mission ? `- Mission : ${p.mission}` : "",
    p.offer ? `- Offre : ${p.offer}` : "",
    p.target_description ? `- Cible : ${p.target_description}` : "",
    p.tone_register ? `- Registre : ${p.tone_register}` : "",
    p.voice_description ? `- Ton & style : ${p.voice_description}` : "",
    p.target_verbatims ? `- Verbatims : ${p.target_verbatims}` : "",
    p.combat_cause ? `- Combats : ${p.combat_cause}` : "",
  ].filter(Boolean).join("\n");
}

function buildPortraitPrompt(d: any, p: any): string {
  const profileBlock = buildProfileBlock(p);
  return `Tu es experte en marketing persona pour des solopreneuses créatives et éthiques.

DONNÉES DU PERSONA :
- Frustrations (étape 1) : "${d.step_1_frustrations || ""}"
- Transformation / bénéfices (étape 2) : "${d.step_2_transformation || ""}"
- Objections / freins (étape 3a) : "${d.step_3a_objections || ""}"
- Clichés à déconstruire (étape 3b) : "${d.step_3b_cliches || ""}"
- Direction visuelle (étape 4) : ce qu'elle trouve beau "${d.step_4_beautiful || ""}", ce qui l'inspire "${d.step_4_inspiring || ""}"
- Plan d'actions (étape 5) : "${d.step_5_actions || ""}"

BRANDING (si rempli) :
${profileBlock}

Génère une fiche portrait de la cliente idéale avec ces éléments :

1. PRÉNOM : Un prénom fictif représentatif de la cible (français, courant, qui sonne "vraie personne")

2. PHRASE SIGNATURE : 1 phrase qui résume son état d'esprit actuel. Comme si elle pensait à voix haute. Entre guillemets.

3. QUI ELLE EST : 5 lignes max
- Âge (tranche)
- Métier / activité
- Situation (seule ? petite équipe ? depuis combien de temps ?)
- CA approximatif si pertinent
- Temps disponible pour la com'

4. CE QUI LA FRUSTRE : Les 3 frustrations les plus fortes, formulées en phrases courtes et percutantes.

5. CE QU'ELLE VEUT : Les 3 objectifs/transformations les plus importants. Formulés positivement, concrets.

6. CE QUI LA BLOQUE : Les 3 objections ou croyances limitantes principales. Entre guillemets (pensées intérieures).

7. COMMENT LUI PARLER :
- Ton recommandé (1 phrase)
- Canal préféré
- Ce qui la convainc (1 phrase)
- Les mots qui la font fuir (3-4 termes)

8. SES MOTS À ELLE : 3 citations courtes, entre guillemets, comme si elle parlait.

RÈGLES :
- Court et percutant
- Pas de jargon marketing
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)
- C'est une VRAIE PERSONNE, pas un profil marketing

Réponds en JSON :
{
  "prenom": "...",
  "phrase_signature": "...",
  "qui_elle_est": {
    "age": "...",
    "metier": "...",
    "situation": "...",
    "ca": "...",
    "temps_com": "..."
  },
  "frustrations": ["...", "...", "..."],
  "objectifs": ["...", "...", "..."],
  "blocages": ["...", "...", "..."],
  "comment_parler": {
    "ton": "...",
    "canal": "...",
    "convainc": "...",
    "fuir": ["...", "...", "..."]
  },
  "ses_mots": ["...", "...", "..."]
}`;
}

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
    const { data: { user }, error: authError2 } = await supabase.auth.getUser();
    const userId = user?.id;

    // Anthropic API key checked in shared helper

    const { type, profile, persona } = await req.json();
    const p = profile || {};
    const d = persona || {};

    const profileBlock = buildProfileBlock(p);
    const startingPointLabel = d.starting_point === "existing" ? "un·e client·e existant·e" : "un persona imaginé";

    let systemPrompt = "";
    let userPrompt = "Génère le contenu demandé.";

    switch (type) {
      case "portrait":
        systemPrompt = buildPortraitPrompt(d, p);
        break;

      case "frustrations":
        systemPrompt = `Tu es expert·e en stratégie de marque pour des solopreneuses créatives et éthiques.

TEXTE DE L'UTILISATRICE SUR LES FRUSTRATIONS DE SA CIBLE :
"${d.step_1_frustrations || ""}"

PROFIL :
${profileBlock}
- Point de départ : ${startingPointLabel}

Génère une liste de 10 tensions, frustrations ou manques que vit cette cliente idéale.

Pour chaque point :
- Une frustration nuancée et réaliste (pas caricaturale)
- L'émotion dominante associée (culpabilité, fatigue, confusion, solitude, impatience, honte...)
- En quoi c'est relié à ce que propose l'utilisatrice

RÈGLES :
- Ton direct et empathique, pas clinique
- Spécifique au secteur de l'utilisatrice
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

Réponds en JSON :
[{"frustration": "...", "emotion": "...", "lien_offre": "..."}, ...]`;
        break;

      case "benefits":
        systemPrompt = `Tu es expert·e en stratégie de marque pour des solopreneuses créatives et éthiques.

TEXTE DE L'UTILISATRICE SUR LA TRANSFORMATION RÊVÉE :
"${d.step_2_transformation || ""}"

PROFIL :
${profileBlock}
- Point de départ : ${startingPointLabel}

Génère 10 bénéfices ou transformations concrètes que la cliente idéale aimerait vivre.

Pour chaque bénéfice :
- Ce qu'elle aurait, ferait ou ressentirait (concret, pas abstrait)
- L'émotion principale (fierté, légèreté, confiance, joie, sérénité...)
- En quoi ça change sa vie de manière tangible

RÈGLES :
- Ton direct et empathique
- Spécifique au secteur
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

Réponds en JSON :
[{"benefice": "...", "emotion": "...", "impact": "..."}, ...]`;
        break;

      case "barriers":
        systemPrompt = `Tu es expert·e en stratégie de marque pour des solopreneuses créatives et éthiques.

TEXTE SUR LES OBJECTIONS :
"${d.step_3a_objections || ""}"

TEXTE SUR LES CLICHÉS :
"${d.step_3b_cliches || ""}"

PROFIL :
${profileBlock}

Génère 2 listes :

LISTE 1 : 10 freins ou croyances limitantes au moment d'acheter
Pour chaque frein :
- La phrase que la cliente se dit (entre guillemets, ton oral)
- Le type de frein (prix, temps, légitimité, confiance, expérience passée)
- Une idée de contenu ou de message pour lever ce frein

LISTE 2 : 10 clichés ou idées reçues sur l'univers de l'utilisatrice
Pour chaque cliché :
- L'idée reçue (entre guillemets)
- Ce qu'elle révèle comme frein profond
- Une idée de contenu "mythe vs réalité" pour le déconstruire

RÈGLES :
- Ton direct et empathique
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

Réponds en JSON :
{"freins": [{"phrase": "...", "type": "...", "idee_contenu": "..."}, ...], "cliches": [{"idee_recue": "...", "frein_profond": "...", "idee_contenu": "..."}, ...]}`;
        break;

      case "visual":
        systemPrompt = `Tu es expert·e en stratégie de marque pour des solopreneuses créatives et éthiques.

L'UNIVERS VISUEL DE LA CLIENTE IDÉALE :
- Ce qu'elle trouve beau : "${d.step_4_beautiful || ""}"
- Ce qui l'inspire : "${d.step_4_inspiring || ""}"
- Ce qui la rebute : "${d.step_4_repulsive || ""}"
- Ce qu'elle a besoin de ressentir : "${d.step_4_feeling || ""}"

PROFIL :
${profileBlock}

Déduis une direction visuelle concrète pour les contenus de l'utilisatrice :
- Type de photos recommandé (3-4 suggestions)
- Ambiance générale (2-3 mots-clés)
- Couleurs à privilégier (3-4 couleurs avec hex si possible)
- Ce qu'il faut éviter visuellement (2-3 points)
- Formats Instagram qui matchent le mieux (carrousel, reel, stories...)
- Suggestion de moodboard (5 types d'images à chercher sur Pinterest)

Réponds en texte structuré (pas de JSON), ton chaleureux et direct. Écriture inclusive avec point médian. JAMAIS de tiret cadratin (—).`;
        break;

      case "actions":
        systemPrompt = `Tu es expert·e en stratégie de marque pour des solopreneuses créatives et éthiques.

PERSONA COMPLET :
- Frustrations : "${d.step_1_frustrations || ""}"
- Transformation rêvée : "${d.step_2_transformation || ""}"
- Objections : "${d.step_3a_objections || ""}"
- Clichés : "${d.step_3b_cliches || ""}"
- Univers visuel : ce qu'elle trouve beau "${d.step_4_beautiful || ""}", ce qui l'inspire "${d.step_4_inspiring || ""}", ce qui la rebute "${d.step_4_repulsive || ""}", ce qu'elle a besoin de ressentir "${d.step_4_feeling || ""}"

PROFIL :
${profileBlock}

Génère un plan d'actions concret :

1. 10 idées de contenus Instagram (posts, stories, reels) directement inspirées du persona. Pour chaque idée : le sujet + le format recommandé + pourquoi ça connecte avec le persona.

2. 5 idées de newsletters ou emails qui répondent à ses besoins profonds.

3. 3 suggestions pour améliorer le message (bio Insta, accroches, page d'accueil).

4. 1 idée de contenu "signature" qui pourrait devenir un repère pour l'audience.

5. 2 idées d'actions hors digital (atelier, collab, événement, partenariat).

Ton direct, concret, actionnable. Écriture inclusive avec point médian. JAMAIS de tiret cadratin (—).

Réponds en JSON :
{"contenus_instagram": [{"sujet": "...", "format": "...", "pourquoi": "..."}, ...], "newsletters": ["...", ...], "ameliorations_message": ["...", ...], "contenu_signature": "...", "actions_hors_digital": ["...", ...]}`;
        break;

      case "pitch":
        systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

FICHE PERSONA :
- Frustrations : "${d.step_1_frustrations || ""}"
- Transformation : "${d.step_2_transformation || ""}"
- Freins : "${d.step_3a_objections || ""}"

PROFIL :
${profileBlock}

Génère 3 versions d'un pitch décrivant la cliente idéale :

VERSION COURTE (2-3 phrases) : pour une bio Instagram ou du networking.
VERSION MOYENNE (4-5 phrases) : pour une page de vente.
VERSION LONGUE (1 paragraphe) : pour une page À propos.

RÈGLES :
- On parle d'ELLE (3e personne), pas de l'offre
- Ton empathique, précis, pas caricatural
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)

Réponds en JSON :
{"short": "...", "medium": "...", "long": "..."}`;
        break;

      default:
        return new Response(JSON.stringify({ error: "Type non reconnu" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (userId) {
      const quotaCheck = await checkQuota(userId, "content");
      if (!quotaCheck.allowed) {
        return new Response(JSON.stringify({ error: quotaCheck.message }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const content = await callAnthropicSimple("claude-sonnet-4-5-20250929", systemPrompt, userPrompt);

    if (userId) {
      await logUsage(userId, "content", "persona");
    }

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("persona-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
