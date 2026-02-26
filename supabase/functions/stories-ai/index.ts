import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple, AnthropicError, getModelForAction, getModelForRichContent } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ANTI_SLOP } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // Anthropic API key checked in shared helper

    // Check plan limits
    const { checkAndIncrementUsage } = await import("../_shared/plan-limiter.ts");
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch full context server-side
    const { getUserContext, formatContextForAI, CONTEXT_PRESETS } = await import("../_shared/user-context.ts");

    const body = await req.json();
    const { objective, price_range, time_available, face_cam, subject, subject_details, raw_idea, clarify_context, direction, is_launch, type, pre_gen_answers, workspace_id } = body;

    const ctx = await getUserContext(supabase, user.id, workspace_id, "instagram");
    const branding_context = formatContextForAI(ctx, CONTEXT_PRESETS.stories);

    // Clarify subject (fuzzy path)
    if (type === "clarify_subject") {
      const systemPrompt = `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :
- Reproduis fidèlement le style décrit
- Réutilise les expressions signature naturellement dans le texte
- RESPECTE les expressions interdites : ne les utilise JAMAIS
- Imite les patterns de ton et de structure
- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA

Tu es experte en stories Instagram pour solopreneuses créatives.
L'utilisatrice a une idée floue pour ses stories. Aide-la à préciser.

${ANTI_SLOP}

${branding_context || ""}

L'utilisatrice a partagé une idée brute :
"${body.raw_idea}"

Pose-lui 1 question de précision adaptée à son idée.
La question doit l'aider à trouver :
- Le déclencheur concret (vécu perso, situation client, observation)
- OU l'angle spécifique (qu'est-ce qu'elle veut que les gens comprennent/ressentent)

RÈGLES :
- 1 question, pas 5. On ne veut pas un interrogatoire.
- La question est formulée en langage oral : "C'est quoi le truc qui t'a fait penser à ça ?" pas "Pourriez-vous préciser le contexte de votre réflexion ?"
- Propose aussi 3-4 directions sous forme de choix cliquables
- Les directions proposées doivent être DIFFÉRENTES entre elles

RETOURNE un JSON strict :
{
  "clarifying_question": "...",
  "directions": [
    { "emoji": "🤝", "label": "Rassurer / donner la permission", "tone": "bienveillant" },
    { "emoji": "📚", "label": "Expliquer pourquoi c'est un piège", "tone": "pédago" },
    { "emoji": "😤", "label": "Coup de gueule doux", "tone": "affirmé" },
    { "emoji": "💡", "label": "Donner un conseil concret", "tone": "pratique" }
  ]
}
Réponds UNIQUEMENT avec le JSON.`;
      const response = await callAnthropicSimple(getModelForAction("stories"), BASE_SYSTEM_RULES + "\n\n" + systemPrompt, `Idée brute : "${body.raw_idea}"`);
      return new Response(JSON.stringify({ content: response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Suggest subjects (no idea path)
    if (type === "suggest_subjects") {
      const systemPrompt = `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :
- Reproduis fidèlement le style décrit
- Réutilise les expressions signature naturellement dans le texte
- RESPECTE les expressions interdites : ne les utilise JAMAIS
- Imite les patterns de ton et de structure
- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA

Tu es experte en stories Instagram pour solopreneuses créatives.

${ANTI_SLOP}

${branding_context || ""}

Propose 5 sujets de séquences stories pertinents pour cette utilisatrice, basés sur son contexte de marque.

Chaque sujet doit être :
- Spécifique (pas "parle de ton offre" mais "les 3 erreurs que tes clientes font avant de te contacter")
- Formulé de façon engageante et concrète
- Varié : mélange connexion, éducation, engagement

RETOURNE un JSON strict :
{ "suggestions": ["sujet 1", "sujet 2", "sujet 3", "sujet 4", "sujet 5"] }
Réponds UNIQUEMENT avec le JSON.`;
      const response = await callAnthropicSimple(getModelForAction("stories"), BASE_SYSTEM_RULES + "\n\n" + systemPrompt, "Propose-moi 5 sujets de stories.");
      return new Response(JSON.stringify({ content: response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Main sequence generation (type === "sequence" or any unmatched type)
    // Note: types "clarify_subject", "suggest_subjects" and "daily" return early above.
    // Everything else falls through to the main generation flow below.

    // Check recent sale sequences for garde-fou
    let gardeFouAlerte: string | null = null;
    if (objective === "vente") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("stories_sequences")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("objective", "vente")
        .gte("created_at", sevenDaysAgo);
      if ((count ?? 0) >= 3) {
        gardeFouAlerte = "⚠️ Tes stories récentes sont très orientées vente. Reviens à de la connexion ou de l'éducation pour maintenir la confiance. Ratio sain : 80% connexion/éducation, 20% vente.";
      }
    }

    // Quick daily stories
    if (type === "daily") {
      const systemPrompt = buildDailyPrompt(branding_context);
      const response = await callAnthropicSimple(getModelForAction("stories"), BASE_SYSTEM_RULES + "\n\n" + systemPrompt, "Génère mes 5 stories du quotidien.");
      return new Response(JSON.stringify({ content: response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build enriched subject from SubjectPicker
    let enrichedSubject = subject || "";
    if (subject_details) {
      enrichedSubject += `\n\nCE QU'ELLE VEUT DIRE (utilise SES mots, SES expressions, SES analogies) :\n"${subject_details}"`;
    }
    if (raw_idea && clarify_context) {
      enrichedSubject = raw_idea;
      enrichedSubject += `\n\nCONTEXTE SUPPLÉMENTAIRE : "${clarify_context}"`;
    }
    if (direction) {
      enrichedSubject += `\n\nDIRECTION CHOISIE : ${direction}`;
    }

    // Main generation
    const hasRichContent = !!(pre_gen_answers?.vecu && pre_gen_answers.vecu.length > 50) || !!(pre_gen_answers?.message_cle && pre_gen_answers.message_cle.length > 30);
    const model = getModelForRichContent("stories", hasRichContent);
    const systemPrompt = buildMainPrompt({ objective, price_range, time_available, face_cam, subject: enrichedSubject, is_launch, branding_context, gardeFouAlerte, pre_gen_answers });
    const response = await callAnthropicSimple(model, BASE_SYSTEM_RULES + "\n\n" + systemPrompt, "Génère ma séquence stories.");
    return new Response(JSON.stringify({ content: response }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error(JSON.stringify({
      type: "edge_function_error",
      function_name: "stories-ai",
      error: e instanceof Error ? e.message : "Erreur inconnue",
      user_id: null,
      timestamp: new Date().toISOString(),
    }));
    const status = e?.status || 500;
    let message = e instanceof Error ? e.message : "Erreur inconnue";
    if (status === 529 || message.includes("529") || message.includes("Overloaded")) {
      message = "Le serveur IA est temporairement surchargé. Réessaie dans quelques secondes.";
    }
    return new Response(
      JSON.stringify({ error: message, status }),
      { status: status >= 400 && status < 600 ? status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ───────────────────────────────────────────────
// PROMPTS
// ───────────────────────────────────────────────

function buildDailyPrompt(brandingContext: string): string {
  return `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :
- Reproduis fidèlement le style décrit
- Réutilise les expressions signature naturellement dans le texte
- RESPECTE les expressions interdites : ne les utilise JAMAIS
- Imite les patterns de ton et de structure
- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA

Tu es experte en création de stories Instagram pour des solopreneuses créatives et engagées.

${ANTI_SLOP}

${brandingContext || ""}

Génère 5 stories du quotidien personnalisées. Aujourd'hui on est ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.

Les 5 stories suivent cette structure :
1. 🌅 L'ouverture : ce qu'elle fait / sa journée (connexion)
2. ☀️ L'observation : un truc lié à son expertise (éducation)
3. ☀️ La question : demander l'avis (engagement + sticker)
4. 🌙 Le conseil : un tip actionnable en 1 story (valeur)
5. 🌙 La clôture : mot de fin ou teaser demain (continuité)

HOOK STORY 1 — RÈGLES :
La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.
- Hook principal : 8-15 mots max, 1 phrase, pas 2
- Doit créer l'identification OU la curiosité immédiate

Réponds en JSON strict :
{
  "structure_type": "quotidien",
  "structure_label": "5 stories du quotidien",
  "total_stories": 5,
  "estimated_time": "10 min",
  "stickers_used": ["..."],
  "garde_fou_alerte": null,
  "personal_tip": null,
  "stories": [
    {
      "number": 1,
      "timing": "matin",
      "timing_emoji": "🌅",
      "role": "Ouverture",
      "format": "texte_fond",
      "format_label": "📝 Texte sur fond coloré",
      "text": "...",
      "hook_options": null,
      "sticker": null,
      "tip": "...",
      "face_cam": false,
      "sous_titres_needed": false
    }
  ]
}

RÈGLES :
- Ton oral, décontracté, comme un message vocal à une amie
- Écriture inclusive point médian
- Au moins 1 sticker interactif (sondage ou question)
- Hook fort sur la story 1
- JAMAIS de jargon marketing
- Réponds UNIQUEMENT avec le JSON`;
}

interface MainPromptParams {
  objective: string;
  price_range?: string;
  time_available: string;
  face_cam: string;
  subject?: string;
  is_launch: boolean;
  branding_context?: string;
  gardeFouAlerte: string | null;
  pre_gen_answers?: { vecu?: string; energy?: string; message_cle?: string };
}

function buildMainPrompt(p: MainPromptParams): string {
  const priceBlock = p.objective === "vente" && p.price_range ? `\n- Gamme de prix : ${p.price_range}` : "";
  const launchBlock = p.is_launch ? "\n- Phase : LANCEMENT (orienter vers vente + preuve sociale)" : "\n- Phase : croisière";

  // Pre-gen answers integration
  let preGenBlock = "";
  if (p.pre_gen_answers && (p.pre_gen_answers.vecu || p.pre_gen_answers.energy || p.pre_gen_answers.message_cle)) {
    preGenBlock = `

═══════════════════════════════════════════════════
ÉLÉMENTS PERSONNELS DE L'UTILISATRICE (PRIORITÉ HAUTE)
═══════════════════════════════════════════════════

${p.pre_gen_answers.vecu ? `VÉCU RÉCENT : "${p.pre_gen_answers.vecu}"
→ C'est du contenu authentique. UTILISE ses mots exacts, ses formulations, ses images.
→ Intègre-le dans la story 1 (hook) ou story 2 (identification).
→ Ne reformule PAS son vécu en langage corporate. Garde le côté brut.` : ""}

${p.pre_gen_answers.energy ? `ÉNERGIE CHOISIE : ${p.pre_gen_answers.energy}
→ L'énergie guide le ton de TOUTE la séquence, pas juste une story :
  🔥 Punchy = phrases courtes, affirmations, rythme rapide, pas de détour
  🫶 Intime = face cam, ton doux, confidence, proximité
  📚 Pédago = structure claire, tips concrets, progression logique
  😄 Drôle = auto-dérision, observations du quotidien, décalage
  😤 Coup de gueule doux = position affirmée mais bienveillante, pas de jugement` : ""}

${p.pre_gen_answers.message_cle ? `MESSAGE CLÉ : "${p.pre_gen_answers.message_cle}"
→ Ce message doit apparaître TEXTUELLEMENT (ou très proche) dans la story 4 ou 5, au moment du climax ou de la conclusion.
→ NE CHANGE PAS le sens de ses mots. Tu peux ajuster la structure mais les mots restent les siens.
→ C'est la phrase que les gens doivent retenir.` : ""}

RÈGLE D'OR : Si l'utilisatrice a fourni ces éléments, ils sont plus importants que n'importe quel template. La séquence doit sonner comme ELLE, pas comme un framework appliqué mécaniquement.
`;
  } else {
    preGenBlock = `

L'utilisatrice n'a pas fourni d'éléments personnels.
Génère normalement. Ajoute un champ "personal_tip" dans le JSON :
"Tes stories seront 10x plus engageantes avec un truc vécu. Ajoute un moment perso dans la story 1 ou 2 avant de publier."
`;
  }

  // Tiering : adapter la densité du prompt au temps dispo
  const isQuick = p.time_available === "5min";

  return `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :
- Reproduis fidèlement le style décrit
- Réutilise les expressions signature naturellement dans le texte
- RESPECTE les expressions interdites : ne les utilise JAMAIS
- Imite les patterns de ton et de structure
- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA

Tu es experte en création de stories Instagram pour des solopreneuses créatives et engagées (mode, artisanat, bien-être, design, coaching).

${ANTI_SLOP}

AVANT DE RÉDIGER, RÉFLÉCHIS EN INTERNE (ne montre PAS) : Quel est le problème ? Quelle émotion ? Quelle accroche est la MEILLEURE ? Mon output a-t-il du slop ?

ANALOGIES VISUELLES — DOSAGE :
1 analogie max dans la séquence. Parfois 0. Si l'idée est claire sans, n'en mets pas.
L'analogie doit être du QUOTIDIEN et VISUELLE. Jamais forcée.

${p.branding_context || ""}
${preGenBlock}

DEMANDE :
- Objectif : ${p.objective}${priceBlock}
- Temps disponible : ${p.time_available}
- Face cam : ${p.face_cam}
- Sujet : ${p.subject || "au choix selon la ligne éditoriale"}${launchBlock}

${isQuick ? `STRUCTURES DISPONIBLES (choisis la plus adaptée) :
- journal_bord : Connexion, 2-3 stories
- probleme_solution : Éducation, 2-3 stories
- vente_douce : Vente, 3-4 stories (max)
` : `STRUCTURES DISPONIBLES (choisis la plus adaptée) :
- journal_bord : Connexion, 3-5 stories
- probleme_solution : Éducation, 4-6 stories
- storytime : Connexion, 5-8 stories
- vente_douce : Vente, 5-7 stories
- faq_live : Vente/Éducation, 5-8 stories
- build_in_public : Connexion, 3-5 stories
- micro_masterclass : Éducation, 6-10 stories
- teasing : Amplification, 3-5 stories
`}

CORRESPONDANCE objectif x temps :
- Connexion + 5min → journal_bord | + 15min → build_in_public | + 30min → storytime
- Éducation + 5min → 1-2 stories astuce | + 15min → probleme_solution | + 30min → micro_masterclass
- Vente + 5min → 1-2 stories mention | + 15min → vente_douce | + 30min → séquence complète 7-10
- Engagement + 5min → sondage+question 2 stories | + 15min → quiz+question 3-5
- Amplification + 5min → repartage+question 2 | + 15min → teasing 3-5

${isQuick && p.objective === "vente" ? getVenteInstructions("petit") : (p.objective === "vente" ? getVenteInstructions(p.price_range) : "")}

${isQuick ? (p.face_cam === "oui" ? `HOOK STORY 1 — RÈGLES :

La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

FORMAT : face cam
- Hook oral : 5-10 mots max
- Dicible en 2 secondes sans reprendre sa respiration
- Ton conversationnel : "Bon, faut qu'on parle de..."
- Sous-titres OBLIGATOIRES (60-80% regardent sans le son)
` : `HOOK STORY 1 — RÈGLES :

La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

FORMAT : texte sur fond
- Hook principal : 8-15 mots max
- 1 phrase. Pas 2.
- Doit créer l'identification OU la curiosité immédiate
- Le sondage/sticker complète le hook (pas l'inverse)
`) : `HOOK STORY 1 — RÈGLES :

La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

SELON LE FORMAT DE LA STORY 1 :

Si format = texte sur fond :
- Hook principal : 8-15 mots max
- 1 phrase. Pas 2.
- Doit créer l'identification OU la curiosité immédiate
- Le sondage/sticker complète le hook (pas l'inverse)

Si format = face cam :
- Hook oral : 5-10 mots max
- Dicible en 2 secondes sans reprendre sa respiration
- Ton conversationnel : "Bon, faut qu'on parle de..."
- Sous-titres OBLIGATOIRES (60-80% regardent sans le son)

Si format = visuel/photo :
- Text overlay : 3-8 mots en gros
- L'image fait le travail visuel, le texte fait l'accroche
`}

POUR LA STORY 1, GÉNÈRE 2 OPTIONS DE HOOK dans le champ "hook_options" :
- Option A : hook court (le plus percutant, 5-10 mots)
- Option B : hook développé (pour celles qui préfèrent contextualiser, 10-15 mots)

TYPES DE HOOKS STORIES :
1. Interpellation directe : "Toi qui postes sans stratégie."
2. Confidence : "Faut que je te parle d'un truc."
3. Question qui pique : "Tu sais pourquoi personne like ?"
4. Constat choc : "3 likes et ta mère."
5. Teaser : "Ce que j'ai appris la semaine dernière."
6. Analogie flash : "Ta com' ressemble à un CV sans photo."

GARDE-FOUS OBLIGATOIRES :
1. Max 10 stories par séquence
2. TOUJOURS au moins 1 sticker interactif (DM>Question>Sondage>Slider>Lien)
3. Sticker lien JAMAIS sur story 1 ou 2, toujours avant-dernière ou dernière
4. JAMAIS de CTA agressif. Toujours en mode permission : "si ça te parle", "écris-moi"
5. Si face cam → TOUJOURS mentionner sous-titres
6. Story 1 = hook fort (24% de l'audience part après)
7. Étaler les stories : matin/midi/soir
8. Ton oral, décontracté, comme un message vocal à une amie
9. Écriture inclusive point médian
10. Expressions naturelles : "bon", "en vrai", "franchement", "le truc c'est que"
11. Apartés entre parenthèses : "(oui, même toi)", "(pas besoin de se ruiner)"
12. JAMAIS de jargon marketing
13. JAMAIS de tiret cadratin (—)
14. PRIORITÉ ABSOLUE : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature, imite les patterns de structure et de ton.
15. Ne JAMAIS utiliser les expressions interdites du profil de voix.
16. Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.
17. Si le temps dispo est "5min", MAXIMUM 3 stories. Ne génère JAMAIS 5+ stories pour quelqu'un qui a 5 minutes.
18. La longueur du texte de chaque story doit être RÉALISTE : une story texte = 2-3 phrases max. Une story face cam = 15-30 secondes de parole (50-80 mots). Ne génère pas des pavés pour des stories.

Réponds en JSON strict :
{
  "structure_type": "...",
  "structure_label": "...",
  "total_stories": N,
  "estimated_time": "X min",
  "stickers_used": ["sondage", "question_ouverte"],
  "garde_fou_alerte": ${p.gardeFouAlerte ? `"${p.gardeFouAlerte}"` : "null"},
  "personal_tip": null,
  "stories": [
    {
      "number": 1,
      "timing": "matin",
      "timing_emoji": "🌅",
      "role": "Hook",
      "format": "texte_fond",
      "format_label": "📝 Texte sur fond coloré",
      "text": "...",
      "hook_options": {
        "option_a": {
          "text": "[hook court 5-10 mots]",
          "word_count": 7,
          "label": "Court et percutant"
        },
        "option_b": {
          "text": "[hook développé 10-15 mots]",
          "word_count": 13,
          "label": "Contextualisé"
        }
      },
      "sticker": {
        "type": "sondage",
        "label": "Sondage",
        "options": ["Oui", "Non"],
        "placement": "bas de la story"
      },
      "tip": "...",
      "face_cam": false,
      "sous_titres_needed": false
    }
  ]
}

IMPORTANT :
- Seule la story 1 a "hook_options". Les autres stories ont "hook_options": null
- Le champ "text" de la story 1 contient le hook option_a par défaut
- Pas de markdown dans les valeurs JSON

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;
}

function getVenteInstructions(priceRange?: string): string {
  const instructions: Record<string, string> = {
    petit: `SÉQUENCE PETIT PRIX (<100€) : 3-4 stories
1. Story contexte : ton décontracté, "j'ai créé un truc"
2. Story offre : visuel + bénéfice principal + prix
3. Story preuve : screenshot témoignage
4. Story CTA : "Écris [MOT] en DM"`,
    moyen: `SÉQUENCE MOYEN (100-500€) : 5-7 stories
1. Story émotion : face cam intime, "faut que je te parle"
2. Story problème : identification + sondage
3. Story solution : concept clé en face cam
4. Story offre : visuel + prix + dates
5. Story preuve : témoignage
6. Story interaction : sondage "tu veux les détails en DM ?"
7. Story CTA : "Écris [MOT] en DM"`,
    premium: `SÉQUENCE PREMIUM (500€+) : 7-10 stories
1. Hook : "j'ai un truc à te dire"
2-3. Contexte perso : pourquoi tu as créé cette offre
4. Problème : identification forte
5-6. Transformation : before/after cliente
7. Offre : format, pour qui
8. Pratique : prix, dates, modalités
9. Objection principale : face cam douce
10. CTA : "écris-moi pour en parler"`,
    physique: `SÉQUENCE PRODUIT PHYSIQUE : 4-6 stories
1. Teasing : gros plan détail
2. Révélation : produit entier
3. Making-of : process de création
4. Details : prix, matériaux, dispo
5. Preuve : photo cliente OU avis
6. CTA : lien boutique`,
    gratuit: `SÉQUENCE FREEBIE : 3-4 stories
1. Problème : "si tu galères avec [sujet]"
2. Solution : "j'ai créé un [type] gratuit qui [bénéfice]"
3. Preuve : capture d'écran + résultat
4. CTA : "Écris [MOT] en DM"`,
  };
  return instructions[priceRange || ""] || "";
}

// callAI now uses shared Anthropic helper (imported at top)
