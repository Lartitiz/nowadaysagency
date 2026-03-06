import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTI_SLOP, CHAIN_OF_THOUGHT, DEPTH_LAYER, PREGEN_INJECTION_RULES } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildProfileBlock, buildPreGenFallback } from "../_shared/user-context.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";

const NEWSLETTER_SYSTEM_PROMPT = `
## GÉNÉRATEUR DE NEWSLETTER — FORMAT LONG INTIMISTE

Tu génères des newsletters pour des solopreneuses créatives et engagées. La newsletter est leur espace de profondeur : là où elles peuvent aller au bout de leurs idées, partager leur parcours, et créer une connexion forte avec leur communauté.

### STRUCTURE DE LA NEWSLETTER

1. OBJET DE L'EMAIL
L'objet est un hook à part entière. Il doit donner envie d'ouvrir.
Exemples : "Le jour où j'ai arrêté de courir après l'algorithme", "J'ai fait les comptes (ça pique)", "Ce que personne ne dit sur la création de contenu"
JAMAIS : "Newsletter #12", "Mes 5 conseils pour...", "📬 Les news de la semaine"

2. PREVIEW TEXT
La ligne qui apparaît après l'objet dans la boîte de réception. 40-90 caractères. Complète l'objet sans le répéter.

3. HOOK / STORYTIME (2-3 paragraphes)
Phrase qui plante le décor. Intime, sensoriel. On entre dans un moment, pas dans un sujet.
"Mardi dernier, 22h. Je ferme mon ordi après 3h à tourner un Reel qui fera 200 vues."

4. CONTEXTE ET STORYTELLING (2-3 paragraphes)
Pourquoi ce sujet, maintenant. La vulnérabilité est bienvenue : "en vrai, j'étais perdue", "j'ai mis 6 mois à comprendre ça".

5. OBSERVATIONS / ÉTAPES / ENSEIGNEMENTS (3-5 paragraphes)
Les apprentissages concrets. Exemples réels, chiffres quand c'est pertinent. Pas de bullet points : des paragraphes développés avec des transitions.

6. RÉSULTATS (1-2 paragraphes)
Sans fake. Vrais chiffres ou vraies émotions. "Depuis, je publie 2 fois par semaine et je dors mieux" vaut mieux que "j'ai triplé mon CA en 3 mois".

7. LEÇON / PRISE DE RECUL (1 paragraphe)
Phrase claire et sincère. "Finalement, j'ai compris que la régularité c'est pas poster tous les jours, c'est ne pas disparaître."

8. MESSAGE DE FOND (1 paragraphe)
En quoi cette expérience illustre une vision plus large de la com' éthique, du travail indépendant, de l'entrepreneuriat au féminin.

9. PS (optionnel)
Lien naturel vers une offre si pertinent. Jamais un CTA agressif. "PS : si ça te parle et que tu veux qu'on travaille ta stratégie ensemble, y'a ça →"

### TON

Encore plus intime qu'Instagram. C'est un email à une amie qui comprend ton métier.
Mélanger humour + vulnérabilité + enseignement concret.
Aller au bout des idées, ne JAMAIS raccourcir. C'est le format de la profondeur.
Paragraphes développés. Zéro bullet points. Zéro liste numérotée.
Apartés en italique entre parenthèses *(comme si on se parlait en vrai)*.

### FORMAT JSON DE SORTIE

Réponds UNIQUEMENT en JSON sans backticks :
{
  "subject": "objet de l'email",
  "preview_text": "texte de preview (40-90 caractères)",
  "body": "contenu complet de la newsletter en texte (avec des \\n\\n pour les sauts de paragraphe)",
  "word_count": nombre_de_mots,
  "cta_suggestion": "suggestion de CTA si pertinent, sinon null",
  "personalization_level": "high | medium | low"
}

${ANTI_SLOP}

${CHAIN_OF_THOUGHT}

${PREGEN_INJECTION_RULES}
`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    if (isDemoUser(user.id)) {
      return new Response(JSON.stringify({ error: "Demo mode: this feature is simulated" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit
    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    // Plan limits
    const usageCheck = await checkQuota(user.id, "content");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    validateInput(body, z.object({
      topic: z.string().min(1).max(2000),
      preGenAnswers: z.object({
        anecdote: z.string().max(3000).optional(),
        emotion: z.string().max(1000).optional(),
        conviction: z.string().max(1000).optional(),
      }).optional().nullable(),
      template: z.string().max(100).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
    }).passthrough());

    let { topic, preGenAnswers, template, workspace_id } = body;

    // Fetch user context + voice profile
    const ctx = await getUserContext(supabase, user.id, workspace_id);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    const { data: voiceData } = await supabase.from("voice_profile").select("*").eq("user_id", user.id).maybeSingle();
    let voiceBlock = "";
    if (voiceData) {
      const vl: string[] = ["PROFIL DE VOIX DE L'UTILISATRICE :"];
      if (voiceData.structure_patterns?.length) vl.push(`- Structure : ${(voiceData.structure_patterns as string[]).join(", ")}`);
      if (voiceData.tone_patterns?.length) vl.push(`- Ton : ${(voiceData.tone_patterns as string[]).join(", ")}`);
      if (voiceData.signature_expressions?.length) vl.push(`- Expressions signature à utiliser : ${(voiceData.signature_expressions as string[]).join(", ")}`);
      if (voiceData.vocabulary_preferences?.length) vl.push(`- Vocabulaire préféré : ${(voiceData.vocabulary_preferences as string[]).join(", ")}`);
      if (voiceData.formatting_habits?.length) vl.push(`- Habitudes de mise en forme : ${(voiceData.formatting_habits as string[]).join(", ")}`);
      if (voiceData.content_patterns?.length) vl.push(`- Patterns de contenu : ${(voiceData.content_patterns as string[]).join(", ")}`);
      voiceBlock = vl.join("\n");
    }

    // Build incarnation block
    const activity = ctx.profile?.activite || ctx.profile?.type_activite || "son activité";
    const target = ctx.profile?.cible || "sa cible";
    const tone = ctx.profile?.tons || ctx.profile?.style_communication || "son ton naturel";

    const incarnationBlock = `
Tu n'écris PAS comme une IA qui a reçu un brief.
Tu écris comme cette personne parlerait si elle avait trouvé les mots justes.
Son activité : ${activity}. Sa cible : ${target}. Son ton naturel : ${tone}.
Si un profil de voix est disponible, c'est TA voix pour ce contenu. Utilise SES tics de langage, SES tournures, SES expressions favorites. Le contenu doit sonner comme elle, pas comme "une newsletter bien écrite par une IA".`;

    // Build pre-gen block (with branding fallback)
    let effectivePreGen = preGenAnswers;
    if (!effectivePreGen || (!effectivePreGen.anecdote && !effectivePreGen.emotion && !effectivePreGen.conviction)) {
      const fallback = buildPreGenFallback(ctx);
      if (fallback) {
        effectivePreGen = {
          anecdote: fallback.anecdote,
          emotion: fallback.emotion,
          conviction: fallback.conviction,
        };
      }
    }
    let preGenBlock = "";
    if (effectivePreGen) {
      const fromBranding = !preGenAnswers && effectivePreGen;
      const sourceNote = fromBranding ? " (éléments tirés du branding, pas du coaching direct)" : "";
      const parts: string[] = [`ÉLÉMENTS D'APPROFONDISSEMENT${sourceNote} :`];
      if (effectivePreGen.anecdote) parts.push(`- Son anecdote / vécu : ${effectivePreGen.anecdote}`);
      if (effectivePreGen.emotion) parts.push(`- L'émotion qu'elle veut transmettre : ${effectivePreGen.emotion}`);
      if (effectivePreGen.conviction) parts.push(`- Sa conviction sur ce sujet : ${effectivePreGen.conviction}`);
      parts.push("\nCes éléments sont PLUS IMPORTANTS que le template. L'anecdote doit devenir le fil rouge du storytelling (sections 3-4). La conviction doit nourrir la leçon (section 7) et le message de fond (section 8).");
      preGenBlock = parts.join("\n");
    }

    const systemPrompt = `${BASE_SYSTEM_RULES}

${NEWSLETTER_SYSTEM_PROMPT}

CONTEXTE DE L'UTILISATRICE :
${brandingContext}

${voiceBlock}

${incarnationBlock}

${preGenBlock}

${template ? `FORMAT DEMANDÉ : ${template}` : ""}`;

    const userPrompt = `Génère une newsletter complète sur ce sujet : ${topic}`;

    const raw = await callAnthropicSimple(
      getModelForAction("content"),
      systemPrompt,
      userPrompt,
      0.7,
      4096
    );

    // Parse JSON response
    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("newsletter-ai JSON parse error:", parseErr, "Raw:", raw.substring(0, 500));
      return new Response(JSON.stringify({ error: "Erreur lors de la génération. Réessaie." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logUsage(user.id, "content", "newsletter");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("newsletter-ai error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
