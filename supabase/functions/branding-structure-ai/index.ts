import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";

const SECTION_PROMPTS: Record<string, string> = {
  story: `Tu es une experte en storytelling de marque personnelle.
L'utilisatrice t'a raconté son histoire en quelques lignes, de façon informelle.
À partir de ce texte brut, structure son histoire en 6 parties :

1. "origin" — Son point de départ, d'où elle vient
2. "turning_point" — Le déclic, le moment charnière
3. "struggles" — Les galères, les obstacles traversés
4. "unique" — Ce qui la rend unique, différente des autres
5. "vision" — Sa vision, ce vers quoi elle tend
6. "full_story" — L'histoire complète, fluide, racontée à la 1re personne (200-300 mots max)

IMPORTANT :
- Garde ses mots, son rythme, sa voix. Ne "professionnalise" pas trop.
- Si une partie n'est pas dans le texte, invente PAS : mets une chaîne vide.
- L'histoire complète doit être chaleureuse, authentique, pas corporate.
- Tutoie l'utilisatrice dans tes commentaires mais PAS dans l'histoire (c'est son récit à elle).

Retourne un JSON avec les clés : origin, turning_point, struggles, unique, vision, full_story.`,

  persona: `Tu es une experte en marketing pour entrepreneures créatives.
L'utilisatrice a répondu à 3 questions simples sur sa cliente idéale.
À partir de ces réponses, génère une fiche persona complète :

1. "portrait_prenom" — Un prénom fictif pour cette persona
2. "portrait_age" — Tranche d'âge estimée (ex: "30-40 ans")
3. "portrait_job" — Son métier/activité
4. "portrait_situation" — Sa situation (ex: "Freelance depuis 2 ans, en quête de visibilité")
5. "objectives" — Ses 3 objectifs principaux (array de strings)
6. "frustrations" — Ses 3 frustrations majeures (array de strings)
7. "desires" — Ses 3 désirs profonds (array de strings)
8. "channels" — Les 3 canaux où elle passe du temps (array de strings)
9. "brands" — 3 marques/comptes qu'elle suit probablement (array de strings)
10. "description" — Un paragraphe de description complète (80-120 mots)

IMPORTANT : base-toi UNIQUEMENT sur ce que l'utilisatrice a dit. Ne rajoute pas d'infos inventées qui contrediraient son contexte.

Retourne un JSON avec ces clés.`,

  value_proposition: `Tu es une experte en positionnement de marque.
L'utilisatrice a répondu à 2 questions :
- Ce qu'elle fait
- Pourquoi elle et pas quelqu'un d'autre

Génère sa proposition de valeur structurée :

1. "key_phrase" — LA phrase de positionnement, percutante, 1-2 lignes max
2. "problem" — Le problème qu'elle résout (1-2 phrases)
3. "solution" — La solution qu'elle apporte (1-2 phrases)
4. "differentiator" — Ce qui la différencie (1-2 phrases)
5. "proof" — Les preuves/signaux de crédibilité (1-2 phrases, déduits de son texte)

La phrase clé doit être naturelle, pas marketing. Comme si elle l'expliquait à une amie.

Retourne un JSON avec ces clés.`,

  tone_style: `Tu es une experte en identité verbale de marque.
L'utilisatrice a choisi un archétype de marque, réglé des curseurs de ton, et décrit ce qui l'énerve dans son secteur.

Génère son identité verbale :

1. "tone_keywords" — 5-7 mots-clés qui définissent son ton (array de strings)
2. "tone_do" — 5 choses qu'elle FAIT dans sa communication (array de strings, commençant par un verbe)
3. "tone_dont" — 5 choses qu'elle ne fait JAMAIS (array de strings)
4. "combats" — Ses combats, reformulés de façon percutante (2-3 phrases)
5. "voice_description" — Description de sa voix en 2-3 phrases

IMPORTANT : reste fidèle à ses choix (archétype, curseurs). Si elle a choisi "décontracté", le ton ne doit pas être corporate.

Retourne un JSON avec ces clés.`,

  content_strategy: `Tu es une stratège de contenu pour entrepreneures créatives.
Tu as accès à toutes les données branding de l'utilisatrice (histoire, persona, proposition de valeur, ton).

Génère sa stratégie de contenu :

1. "pillars" — 3 piliers de contenu (array d'objets avec "name" et "description")
2. "creative_twist" — Son concept créatif unique, le fil rouge de sa com' (2-3 phrases)
3. "formats" — 4 formats de contenu recommandés (array d'objets avec "name", "frequency", "example")
4. "rhythm" — Rythme de publication suggéré (1-2 phrases)
5. "editorial_line" — Sa ligne éditoriale en 3-4 phrases

Base-toi sur TOUT son branding pour que la stratégie soit cohérente et personnalisée.

Retourne un JSON avec ces clés.`,

  offers: `Tu es une experte en structuration d'offres pour entrepreneures.
L'utilisatrice a décrit ses offres de façon informelle (nom, ce que c'est, pour qui/combien).

Pour CHAQUE offre, structure :

1. "name" — Nom de l'offre (gardé tel quel ou légèrement amélioré)
2. "description" — Description professionnelle mais chaleureuse (3-4 phrases)
3. "target" — À qui s'adresse cette offre (1-2 phrases)
4. "promise" — La promesse/transformation (1-2 phrases)
5. "includes" — Ce qui est inclus (array de strings, 4-6 éléments)

Retourne un JSON : { "offers": [ { name, description, target, promise, includes }, ... ] }`,
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { section, input, branding_context } = await req.json();

    if (!section || !SECTION_PROMPTS[section]) {
      return new Response(JSON.stringify({ error: "Section invalide" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sectionPrompt = SECTION_PROMPTS[section];
    
    let userMessage = "";
    
    if (section === "story") {
      userMessage = `Voici ce que l'utilisatrice a raconté :\n\n"${input.raw_text}"`;
    } else if (section === "persona") {
      userMessage = `Voici les réponses de l'utilisatrice :\n\n1. À qui elle vend : "${input.who}"\n2. Leur plus grosse galère : "${input.struggle}"\n3. Le problème n°1 à résoudre : "${input.problem}"`;
    } else if (section === "value_proposition") {
      userMessage = `Voici les réponses :\n\n1. Ce qu'elle fait : "${input.what}"\n2. Pourquoi elle et pas quelqu'un d'autre : "${input.why_her}"`;
    } else if (section === "tone_style") {
      userMessage = `Voici ses choix :\n\nArchétype de marque : ${input.archetype}\nCurseurs :\n- Décontracté ↔ Pro : ${input.casual_pro}/100\n- Doux ↔ Punchy : ${input.soft_punchy}/100\n- Discret ↔ Affirmé : ${input.discreet_bold}/100\n\nCe qui l'énerve dans son secteur : "${input.frustration}"`;
    } else if (section === "content_strategy") {
      userMessage = `Voici le branding complet de l'utilisatrice :\n\n${branding_context || "Aucun contexte fourni."}`;
    } else if (section === "offers") {
      const offersText = (input.offers || []).map((o: any, i: number) =>
        `Offre ${i + 1} :\n- Nom : ${o.name}\n- Description : ${o.description}\n- Pour qui / combien : ${o.target_price}`
      ).join("\n\n");
      userMessage = `Voici les offres de l'utilisatrice :\n\n${offersText}`;
    }

    const model = getModelForAction("content");
    const result = await callAnthropicSimple({
      model,
      system: `${BASE_SYSTEM_RULES}\n\n${ANTI_SLOP}\n\n${sectionPrompt}\n\nRéponds UNIQUEMENT avec un JSON valide, sans markdown, sans commentaire.`,
      messages: [{ role: "user", content: userMessage }],
      temperature: 0.7,
      max_tokens: 2000,
    });

    // Parse JSON from response
    let parsed;
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Format de réponse invalide");
      }
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("branding-structure-ai error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
