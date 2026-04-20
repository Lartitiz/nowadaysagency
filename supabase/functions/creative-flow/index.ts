import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES, ANTI_SLOP, CHAIN_OF_THOUGHT, ETHICAL_GUARDRAILS, ANTI_BIAS, PREGEN_INJECTION_RULES, EDITORIAL_ANGLES_REFERENCE, VISUAL_ANALOGIES, LINKEDIN_TEMPLATES, ANTI_BROETRY_LINKEDIN, EMBEDDED_EDUCATION } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildProfileBlock, buildPreGenFallback } from "../_shared/user-context.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { streamAnthropicSSE, createClientSSEStream } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";

// buildBrandingContext replaced by shared getUserContext + formatContextForAI

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    if (isDemoUser(user.id)) {
      return new Response(JSON.stringify({ error: "Demo mode: this feature is simulated" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);

    // Check plan limits
    const usageCheck = await checkQuota(user.id, "content");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    validateInput(body, z.object({
      step: z.string().max(50),
      contentType: z.string().max(100).optional().nullable(),
      context: z.string().max(5000).optional().nullable(),
      adjustment: z.string().max(2000).optional().nullable(),
      sourceText: z.string().max(10000).optional().nullable(),
      targetFormat: z.string().max(100).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
      objective: z.string().max(50).optional().nullable(),
      editorialFormat: z.string().max(100).optional().nullable(),
      editorialFormatLabel: z.string().max(200).optional().nullable(),
      photo_mode: z.boolean().optional(),
      photo_description: z.string().max(2000).optional().nullable(),
      photos: z.array(z.object({ base64: z.string(), mimeType: z.string().optional() })).max(1).optional(),
      recent_briefs_context: z.string().max(4000).optional().nullable(),
    }).passthrough());
    const { step, contentType, context, profile, angle, answers, followUpAnswers, content: currentContent, adjustment, calendarContext, preGenAnswers, sourceText, formats, targetFormat, workspace_id, deepResearch, objective, editorialFormat, editorialFormatLabel, variation, previousContent, pinterest_link, pinterest_board, recent_briefs_context: recentBriefsFromBody } = body;

    // Determine channel from contentType for persona selection
    const channelFromType = contentType?.includes("linkedin") ? "linkedin" : contentType?.includes("instagram") || contentType?.includes("carousel") || contentType?.includes("reel") || contentType?.includes("stories") ? "instagram" : undefined;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const ctx = await getUserContext(supabase, user.id, workspace_id, channelFromType);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    // Recent briefs context — fetched server-side as fallback if not provided.
    // Used by `questions` step to avoid repeating angles already covered.
    let recentBriefsContext = recentBriefsFromBody || "";
    if (!recentBriefsContext && (step === "questions" || step === "follow-up")) {
      recentBriefsContext = await getRecentBriefsContext(supabase, user.id, workspace_id, 3);
    }

    // Extract vocabulary keywords from branding (offers names, target name, key expressions)
    // → forces the AI to use the user's actual vocabulary in questions
    const brandVocab: string[] = [];
    if (ctx?.profile?.activite) brandVocab.push(`activité: ${ctx.profile.activite}`);
    if (ctx?.profile?.cible) brandVocab.push(`cible: ${ctx.profile.cible}`);
    if (ctx?.tone?.key_expressions) {
      const keyExp = typeof ctx.tone.key_expressions === "string" ? ctx.tone.key_expressions : "";
      if (keyExp) brandVocab.push(`expressions clés: ${keyExp.slice(0, 200)}`);
    }
    if (ctx?.brand_profile?.offer) {
      const off = typeof ctx.brand_profile.offer === "string" ? ctx.brand_profile.offer : "";
      if (off) brandVocab.push(`offre: ${off.slice(0, 150)}`);
    }
    const brandVocabBlock = brandVocab.length > 0
      ? `\n\nVOCABULAIRE MÉTIER DE L'UTILISATRICE (à RÉUTILISER dans les questions) :\n${brandVocab.map(v => `- ${v}`).join("\n")}\n\nRÈGLE : au moins 2 questions sur 3 doivent réutiliser un mot/concept de ce vocabulaire (nom de l'offre, terme de la cible, expression clé). Les questions doivent montrer que tu connais SON univers, pas un univers générique.\n`
      : "";

    // Voice profile — already fetched by getUserContext() with correct workspace owner resolution.
    // Do NOT re-fetch with user.id (that would use the coach's voice instead of the client's).
    let voiceBlock = "";
    if (ctx.voice) {
      const v = ctx.voice;
      const vl: string[] = ["PROFIL DE VOIX DE L'UTILISATRICE :"];
      if (v.structure_patterns?.length) vl.push(`- Structure : ${(Array.isArray(v.structure_patterns) ? v.structure_patterns : []).join(", ")}`);
      if (v.tone_patterns?.length) vl.push(`- Ton : ${(Array.isArray(v.tone_patterns) ? v.tone_patterns : []).join(", ")}`);
      if (v.signature_expressions?.length) vl.push(`- Expressions signature à utiliser : ${(Array.isArray(v.signature_expressions) ? v.signature_expressions : []).join(", ")}`);
      if (v.banned_expressions?.length) vl.push(`- Expressions interdites (NE JAMAIS UTILISER) : ${(Array.isArray(v.banned_expressions) ? v.banned_expressions : []).join(", ")}`);
      if (v.voice_summary) vl.push(`- Style résumé : ${v.voice_summary}`);
      vl.push("UTILISE ce profil de voix pour TOUT le contenu généré.");
      vl.push("PRIORITÉ VOIX : reproduis ce style. Réutilise les expressions signature. Respecte les expressions interdites. Le résultat doit sonner comme si l'utilisatrice l'avait écrit elle-même.");
      voiceBlock = "\n" + vl.join("\n") + "\n";
    }

    // Pre-generation personal answers (with branding fallback)
    let effectivePreGen = preGenAnswers;
    if (!effectivePreGen && step === "generate") {
      effectivePreGen = buildPreGenFallback(ctx);
    }
    let preGenBlock = "";
    if (effectivePreGen) {
      const fromBranding = (effectivePreGen as any)._fromBranding;
      const sourceNote = fromBranding ? " (éléments tirés du branding, pas du coaching direct)" : "";
      const pl: string[] = [];
      if (effectivePreGen.anecdote) pl.push(`- Anecdote${sourceNote} (UTILISE ses mots exacts, garde le côté brut et authentique) : "${effectivePreGen.anecdote}"`);
      if (effectivePreGen.emotion) pl.push(`- Énergie/émotion visée${sourceNote} (guide le ton de TOUT le contenu) : ${effectivePreGen.emotion}`);
      if (effectivePreGen.conviction) pl.push(`- Conviction/phrase clé${sourceNote} (doit apparaître TEXTUELLEMENT dans le contenu, c'est SA voix) : "${effectivePreGen.conviction}"`);
      if (pl.length) {
        preGenBlock = `\nL'UTILISATRICE A PARTAGÉ CES ÉLÉMENTS PERSONNELS :\n${pl.join("\n")}\n\nINTÈGRE CES ÉLÉMENTS dans le contenu généré :\n- L'anecdote doit apparaître naturellement (en accroche ou en illustration)\n- L'émotion visée guide le ton et la structure\n- La conviction doit être présente, formulée dans le style de l'utilisatrice\n- Ne change PAS le sens de ce qu'elle a dit, juste la structure\n`;
      }
    }
    if (!effectivePreGen && step === "generate") {
      preGenBlock = `\nL'utilisatrice n'a pas fourni d'éléments personnels.\nGénère le contenu normalement mais AJOUTE en fin :\n"💡 Ajoute une anecdote perso pour que ça sonne vraiment toi. L'IA structure, toi tu incarnes."\n`;
    }

    const fullContext = profileBlock + (brandingContext ? `\n${brandingContext}` : "") + voiceBlock;

    // Build incarnation block from user context
    const activity = ctx?.profile?.activite || profile?.activite || "";
    const target = ctx?.profile?.cible || profile?.cible || "";
    const tone = ctx?.tone?.tone_description || ctx?.tone?.voice_description || "";
    const incarnationBlock = `
Tu n'écris PAS comme une IA qui a reçu un brief.
Tu écris comme cette personne parlerait si elle avait trouvé les mots justes.

Son activité : ${activity || "(non renseignée)"}. Sa cible : ${target || "(non renseignée)"}. Son ton naturel : ${tone || "(non renseigné)"}.

Si un profil de voix est disponible, c'est TA voix pour ce contenu. Utilise SES tics de langage, SES tournures, SES expressions favorites. Le contenu doit sonner comme elle, pas comme "un post bien écrit par une IA".
`;

    // COMMON_PREFIX: identical for ALL steps → maximizes Anthropic prompt caching
    const COMMON_PREFIX = BASE_SYSTEM_RULES + "\n\n" + incarnationBlock + "\n\n" + `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :\n- Reproduis fidèlement le style décrit\n- Réutilise les expressions signature naturellement dans le texte\n- RESPECTE les expressions interdites : ne les utilise JAMAIS\n- Imite les patterns de ton et de structure\n- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA\n\n` + CORE_PRINCIPLES + "\n\n" + EMBEDDED_EDUCATION + "\n\n" + ANTI_SLOP + "\n\n" + ETHICAL_GUARDRAILS + "\n\n" + fullContext;

    // Build calendar context block
    let calendarBlock = "";
    if (calendarContext) {
      const cl: string[] = [];
      if (calendarContext.postDate) cl.push(`- Date de publication prévue : ${calendarContext.postDate}`);
      if (calendarContext.theme) cl.push(`- Thème/sujet : "${calendarContext.theme}"`);
      if (calendarContext.notes) cl.push(`- Notes de l'utilisatrice : "${calendarContext.notes}"`);
      if (calendarContext.angleSuggestion) cl.push(`- Angle suggéré : "${calendarContext.angleSuggestion}"`);
      if (calendarContext.launchId) {
        cl.push(`\nCONTEXTE LANCEMENT :`);
        if (calendarContext.contentType) cl.push(`- Type de contenu : ${calendarContext.contentTypeEmoji || ""} ${calendarContext.contentType}`);
        if (calendarContext.category) cl.push(`- Catégorie : ${calendarContext.category}`);
        if (calendarContext.chapter) cl.push(`- Chapitre narratif : ${calendarContext.chapter}. ${calendarContext.chapterLabel || ""}`);
        if (calendarContext.audiencePhase) cl.push(`- Phase mentale de l'audience : ${calendarContext.audiencePhase}`);
        if (calendarContext.objective) cl.push(`- Objectif de ce contenu : "${calendarContext.objective}"`);
      }
      if (cl.length) calendarBlock = `\nCONTEXTE DU POST (depuis le calendrier) :\n${cl.join("\n")}\n`;
    }

    // Build objective block (from direct param or calendar context)
    const effectiveObjective = objective || calendarContext?.objective || null;
    let objectiveBlock = "";
    if (effectiveObjective) {
      const objectiveGuidance: Record<string, string> = {
        "visibilite": "OBJECTIF : VISIBILITÉ (reach, découverte)\n- Le contenu doit être PARTAGEABLE : l'audience doit vouloir l'envoyer à quelqu'un\n- Privilégie les prises de position, les accroches polarisantes, les constats qui font réagir\n- L'appel à l'action doit encourager le partage, le save, ou le tag\n- Pas de CTA commercial. Pas de mention d'offre.",
        "engagement": "OBJECTIF : ENGAGEMENT (lien, communauté)\n- Le contenu doit créer de la CONNEXION : l'audience doit se reconnaître et vouloir répondre\n- Privilégie les questions ouvertes, le storytelling personnel, les moments de vulnérabilité\n- L'appel à l'action doit inviter au commentaire, au partage d'expérience, au dialogue\n- La mention d'offre est possible en toute fin, mais secondaire.",
        "vente": "OBJECTIF : VENTE (conversion)\n- Le contenu doit créer le DÉCLIC : l'audience doit comprendre pourquoi elle a besoin d'aide maintenant\n- Privilégie les avant/après, les études de cas, les transformations concrètes, les témoignages\n- Montre le coût de l'inaction (rester seule, continuer à galérer)\n- L'appel à l'action doit mener vers l'offre : appel découverte, lien en bio, inscription\n- Le CTA est direct mais pas agressif : invitation, pas injonction.",
        "credibilite": "OBJECTIF : CRÉDIBILITÉ (autorité, expertise)\n- Le contenu doit démontrer la MAÎTRISE : l'audience doit se dire \"elle sait de quoi elle parle\"\n- Privilégie les décryptages, les analyses, les données chiffrées, les références\n- Mentionne l'expérience, les clients, les résultats concrets\n- L'appel à l'action peut inviter à approfondir (newsletter, article, échange).",
      };
      const key = Object.keys(objectiveGuidance).find(k =>
        k === effectiveObjective || k === effectiveObjective.toLowerCase()
      );
      objectiveBlock = `\n${key ? objectiveGuidance[key] : `OBJECTIF DU CONTENU : ${effectiveObjective}\nAdapte le ton, la structure et le CTA pour atteindre cet objectif.`}\n`;
    }

    let systemPrompt = "";
    let userPrompt: string | null = "";

    // ── Format detection (outer scope — used by generate + streaming) ──
    const angleFormat = angle?.format_livraison?.toLowerCase() || "";
    const formatHint = angleFormat || contentType?.toLowerCase() || "";
    const isCarousel = formatHint.includes("carrousel") || formatHint.includes("carousel");
    const isReel = formatHint.includes("reel") || formatHint.includes("script");
    const isStories = formatHint.includes("stories") || formatHint.includes("story");
    const isLinkedIn = formatHint.includes("linkedin") || contentType === "post_linkedin";
    const isPinterest = formatHint.includes("pinterest") || contentType === "post_pinterest";
    const isNewsletter = formatHint.includes("newsletter") || formatHint.includes("email") || contentType === "post_newsletter";
    const isCaption = !isCarousel && !isReel && !isStories && !isLinkedIn && !isPinterest && !isNewsletter;
    const isPhotoMode = body.photo_mode === true;

    // Format labels (used by recycle, declared here for broader scope)
    const formatLabels: Record<string, string> = {
      carrousel: "Carrousel Instagram (8 slides)",
      reel: "Script Reel (30-60 sec)",
      stories: "Séquence Stories (5 stories)",
      linkedin: "Post LinkedIn",
      newsletter: "Email / Newsletter",
    };

    if (step === "angles") {
      const editorialCtx = editorialFormatLabel
        ? `\nFORMAT ÉDITORIAL CHOISI : "${editorialFormatLabel}"\nL'utilisatrice a choisi ce format parmi les 13 angles éditoriaux. Les 3 angles proposés doivent être des VARIATIONS de "${editorialFormatLabel}", pas des formats complètement différents.\nChaque angle prend un POINT D'ENTRÉE différent dans le sujet, mais tous suivent la logique de "${editorialFormatLabel}".\nExemple : si elle a choisi "Mythe à déconstruire", les 3 angles déconstruisent le même sujet mais avec 3 approches différentes (données vs vécu vs comparaison).\n`
        : "";

      systemPrompt = `${COMMON_PREFIX}

${FRAMEWORK_SELECTION}

${EDITORIAL_ANGLES_REFERENCE}
${editorialCtx}
CANAL : ${contentType}
SUJET : ${context}
${effectiveObjective ? `OBJECTIF : ${effectiveObjective}` : ""}
${calendarBlock}

Propose exactement 3 angles éditoriaux DIFFÉRENTS.

Pour chaque angle :
1. TITRE : 2-5 mots, évocateur (pas "Option 1")
2. PITCH : 2-3 phrases qui expliquent l'approche et pourquoi ça fonctionne
3. STRUCTURE : le squelette du contenu en 4-5 étapes${editorialFormatLabel ? ` (basé sur la structure de "${editorialFormatLabel}" dans les angles éditoriaux de référence)` : " (utilise les structures par format si le format est connu)"}
4. TON : l'énergie et le registre émotionnel de cet angle
5. FORMAT_LIVRAISON : le format de sortie recommandé pour cet angle (carrousel, reel, stories, caption longue, LinkedIn, newsletter)

RÈGLES :
${editorialFormatLabel ? `- Les 3 angles sont des VARIATIONS de "${editorialFormatLabel}", PAS des formats différents` : "- Les 3 angles doivent être VRAIMENT différents (pas 3 variations du même)"}
- Chaque angle est basé sur un framework narratif DIFFÉRENT, traduit en angle créatif lisible
- Un angle peut être surprenant ou inattendu
- Pense à des angles que l'utilisatrice n'aurait pas trouvés seule
${effectiveObjective ? `- Les 3 angles doivent servir l'objectif "${effectiveObjective}". Un angle "visibilité" privilégie les accroches polarisantes, un angle "vente" les preuves et témoignages.` : ""}
- Reste cohérent avec son ton & style
- Ne rédige RIEN. Pas d'exemple de phrases. Juste la direction.

Réponds UNIQUEMENT en JSON :
{
  "angles": [
    {
      "title": "...",
      "pitch": "...",
      "structure": ["étape 1", "étape 2", "étape 3", "étape 4"],
      "tone": "...",
      "format_livraison": "carrousel | reel | stories | caption | linkedin | newsletter"
    }
  ]
}`;
      userPrompt = `Propose-moi 3 angles éditoriaux pour : ${context}`;

    } else if (step === "questions") {
      const channelLabel = contentType === "linkedin" ? "LinkedIn" : contentType === "newsletter" ? "Newsletter" : "Instagram";
      const channelGuidance = contentType === "linkedin"
        ? "Questions orientées PRO : demande des situations professionnelles, des apprentissages business, des résultats concrets, des prises de position assumées."
        : contentType === "newsletter"
        ? "Questions orientées PROFONDEUR : demande des réflexions de fond, des convictions, des retours d'expérience détaillés."
        : "Questions orientées ÉMOTION : demande des moments vécus, des ressentis, des transformations personnelles, des coulisses.";

      systemPrompt = `${COMMON_PREFIX}
${brandingContext ? `\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n` : ""}
L'utilisatrice a choisi cet angle pour son contenu :
- Sujet : ${context}
- Canal : ${channelLabel}
${editorialFormatLabel ? `- Format éditorial : ${editorialFormatLabel}` : ""}
- Angle : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}
${angle.format_livraison ? `- Format de livraison recommandé : ${angle.format_livraison}` : ""}
${calendarBlock}${objectiveBlock}

Pose exactement 3 questions pour récupérer SA matière première. Ces questions doivent extraire des éléments PERSONNELS (anecdotes, opinions, observations, process, convictions) qui rendront le contenu unique et impossible à reproduire par une IA seule.

RÈGLES :
1. LIS ATTENTIVEMENT LE SUJET ci-dessus. Les 3 questions doivent être directement liées à CE sujet spécifique, pas à l'angle en général.
2. AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND : pourquoi elle pense ça, pourquoi c'est important pour elle, quelle conviction personnelle se cache derrière ce sujet.
3. ${channelGuidance}
4. Questions OUVERTES (pas oui/non).
5. VARIÉTÉ DE TYPES DE QUESTIONS OBLIGATOIRE — les 3 questions doivent utiliser des TYPES DIFFÉRENTS parmi :
   - ANECDOTE : "Raconte un moment précis où…" (une scène concrète vécue)
   - OPINION TRANCHÉE : "C'est quoi ta position sur… ?" / "Tu penses quoi de… ?"
   - PROCESS / MÉTHODE : "Comment tu fais concrètement quand… ?" / "C'est quoi ta méthode pour… ?"
   - OBSERVATION : "Qu'est-ce que tu observes chez… ?" / "Qu'est-ce qui te frappe quand… ?"
   - CONVICTION : "C'est quoi le truc que tu répètes toujours à ce sujet ?" / "Pourquoi t'es convaincue que… ?"
   ⚠️ INTERDIT de faire 3 questions "Raconte-moi une fois où…". Maximum 1 question anecdote sur les 3.
6. Le ton des questions est chaleureux et curieux (comme une amie qui s'intéresse vraiment).
7. Chaque question a un placeholder qui donne un mini-exemple de réponse SPÉCIFIQUE au sujet.
8. ORIENTÉES vers l'objectif : si "vente" → demande des résultats, process, transformations. Si "engagement" → demande des anecdotes, émotions. Si "visibilité" → demande des opinions clivantes, observations décalées. Si "crédibilité" → demande des méthodes, des preuves, des observations terrain.

INTERDIT — NE FAIS JAMAIS ÇA :
- Questions génériques type "Qu'est-ce qui te passionne dans ton métier ?", "Quel est ton parcours ?", "Qu'est-ce qui te différencie ?"
- Questions de coaching de vie déconnectées du sujet
- Questions trop larges qui pourraient s'appliquer à N'IMPORTE QUEL sujet
- 3 questions qui commencent toutes par "Raconte-moi" ou "Il y a eu un moment où"
- Chaque question DOIT mentionner le sujet ou un aspect concret du sujet

EXEMPLES (pour le sujet "Pourquoi je ne fais plus de remises") :
❌ MAUVAIS MIX :
1. "Raconte-moi un moment où tu as dû défendre ta valeur."
2. "Raconte-moi une fois où une cliente t'a demandé une remise."
3. "Raconte-moi comment tu as changé ta relation à l'argent."
(= 3x le même type "raconte-moi" → monotone)

✅ BON MIX :
1. (anecdote) "La dernière fois qu'on t'a demandé une remise, tu as répondu quoi exactement ?"
2. (opinion) "C'est quoi le truc qui t'agace le plus dans la culture du 'prix cassé' ?"
3. (process) "Concrètement, comment tu présentes tes tarifs maintenant pour éviter la négociation ?"

Réponds UNIQUEMENT en JSON :
{
  "questions": [
    {
      "question": "...",
      "placeholder": "..."
    }
  ]
}`;
      userPrompt = `Pose-moi des questions pour créer mon contenu${angle ? ` avec l'angle "${angle.title}"` : ""}.`;

    } else if (step === "follow-up") {
      const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
      systemPrompt = `${COMMON_PREFIX}

L'utilisatrice a répondu à ces questions :
${answersBlock}

Lis ses réponses. Identifie le détail le plus intéressant, le plus singulier, ou le plus émotionnel. Pose 1-2 questions de suivi pour creuser CE détail spécifique.

Le but : aller chercher le truc que personne d'autre ne pourrait dire. L'anecdote, le ressenti, la conviction qui rend ce contenu UNIQUE.

Réponds UNIQUEMENT en JSON :
{
  "follow_up_questions": [
    {
      "question": "...",
      "placeholder": "...",
      "why": "..."
    }
  ]
}`;
      userPrompt = "Pose-moi des questions d'approfondissement basées sur mes réponses.";

    } else if (step === "generate") {
      const answersBlock = answers?.length
        ? answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";
      const followUpBlock = followUpAnswers?.length
        ? "\n\nQUESTIONS D'APPROFONDISSEMENT :\n" + followUpAnswers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";

      // Format variables (isLinkedIn, isCarousel, etc.) are defined in outer scope

      // Build format-specific depth instructions
      let depthMandate = "";
      if (isCarousel) {
        depthMandate = `FORMAT : CARROUSEL INSTAGRAM (8 slides minimum)

══ AVANT D'ÉCRIRE : LE CARROUSEL N'EST PAS UNE LISTE ══

Le piège n°1 des carrousels IA : transformer un sujet en "5 conseils" ou "7 erreurs" où chaque slide est un tip numéroté. Ce format est mort. L'algorithme le catégorise comme générique, le lecteur le scrolle.

Un bon carrousel raconte un MOUVEMENT : situation → tension → compréhension → ouverture.
Chaque slide fait AVANCER ce mouvement. Pas "Conseil 1... Conseil 2..." mais "Voilà ce qui se passe... Voilà pourquoi... Voilà ce que ça change...".

AVANT DE RÉDIGER, identifie :

1. QUEL EST L'ARC NARRATIF ?
   - Récit d'expérience → situation de départ → ce qui s'est passé → ce que ça a révélé
   - Déconstruction → croyance répandue → pourquoi elle existe → pourquoi elle est fausse → ce qui est vrai
   - Coulisses/process → le résultat visible → ce qu'on ne voit pas derrière → les choix et les galères → la leçon
   - Prise de position → constat terrain → pourquoi ça pose problème → ce que ça devrait être → invitation

2. QUEL EST LE HOOK VISUEL (Slide 1) ?
   Pas un titre ("5 erreurs de..."). Une PHRASE qui crée une tension, une curiosité, un décalage.
   ❌ "5 erreurs de communication à éviter"
   ❌ "Comment créer du contenu qui engage"
   ✅ "J'ai perdu ma meilleure cliente en mars."
   ✅ "Tout le monde te dit de poster tous les jours. C'est probablement le pire conseil."
   ✅ "Ce que j'aurais aimé savoir avant de lancer mon premier carrousel."

3. OÙ EST LA PROFONDEUR ?
   Au moins 2 slides doivent contenir un DÉTAIL CONCRET : un chiffre, un cas client, une phrase entendue, un avant/après mesurable. C'est ce qui fait la différence entre un carrousel "tips qu'on a déjà lus 100 fois" et un carrousel "elle sait de quoi elle parle".

══ RÈGLES DE RÉDACTION ══

STRUCTURE DES SLIDES :
- Slide 1 (hook) : 1-2 phrases max, 12 mots max. Crée la tension. PAS de titre listicle.
- Slides 2-7 : chacune a un RÔLE dans l'arc narratif (pas un numéro de conseil).
  Chaque slide = 2-4 phrases qui DÉVELOPPENT le point. Pas un header + une ligne.
- Slide finale : punchline mémorable qui OUVRE (pas qui résume) + CTA léger.
- TOTAL : 1500-3000 caractères de contenu textuel (slides + caption).

SLIDE DE PROFONDEUR (obligatoire) :
Au moins 1 slide doit être un "zoom" : UN point creusé avec un exemple terrain, un cas réel, ou une analyse fine.

INTERDITS :
- Numéroter les conseils ("Conseil 1", "Erreur n°2", "Astuce 3")
- Slides d'une seule phrase ou d'un seul mot
- Toutes les slides de la même longueur (varier le rythme)
- Slide qui reformule la précédente
- Punchlines isolées style broetry

Formate le contenu avec des marqueurs clairs :
📌 SLIDE 1 : [contenu]
📌 SLIDE 2 : [contenu]
etc.
Après les slides, ajoute :
📝 CAPTION : [hook différent de slide 1 + corps + CTA + hashtags]`;
       } else if (isReel) {
        depthMandate = `FORMAT : SCRIPT REEL (30-60 secondes)

══ AVANT D'ÉCRIRE : UN REEL = UNE SEULE IDÉE ══

Le reel n'est pas un carrousel raccourci ni un post filmé. C'est UNE idée 
percutante, développée à l'oral, en 30-60 secondes.

AVANT DE SCRIPTER, identifie :

1. QUEL EST LE SEUL POINT que le spectateur retient ?
   Si tu ne peux pas le résumer en 1 phrase, le reel est trop dispersé.
   Pas "5 conseils pour..." mais "le truc que personne ne dit sur [sujet]".

2. QUELLE SITUATION CONCRÈTE illustre ce point ?
   Un reel qui RACONTE une scène (un moment, un échange, un avant/après) 
   fonctionne 10x mieux qu'un reel qui EXPLIQUE un concept.

3. QUEL EST LE HOOK DES 3 PREMIÈRES SECONDES ?
   Le spectateur décide en 1-3 secondes de rester ou scroller. Le hook 
   doit créer une TENSION immédiate.
   ❌ "Aujourd'hui je vais te parler de..."
   ❌ "3 erreurs à éviter sur Instagram"
   ✅ "Arrête de poster tous les jours." (affirmation choc)
   ✅ "Ma cliente avait 10K abonnés et zéro client." (fait concret)
   ✅ "'C'est trop cher.' En vrai, c'est pas le prix le problème." (objection retournée)

4. QUEL EST LE MOUVEMENT NARRATIF ?
   Avant d'écrire, identifie le déplacement :
   situation → déplacement de perspective → nouvelle compréhension.
   Au moins UN moment dans le corps doit créer un déplacement :
   nouvelle info, contre-pied, zoom sur un détail inattendu.
   Ce n'est PAS un "retournement" dramatique obligatoire, c'est un CHANGEMENT
   de regard sur le sujet.

5. À QUI CE REEL DONNE ENVIE D'ÊTRE ENVOYÉ EN DM, ET POURQUOI ?
   Les sends en DM sont le signal algorithmique LE PLUS FORT pour atteindre
   les non-abonnés sur Instagram. Un Reel qui ne donne envie d'être envoyé
   à personne reste invisible.
   
   Avant d'écrire, identifie EXPLICITEMENT :
   - QUI : à quelle personne précise (pas "ma communauté", pas "les femmes
     entrepreneures") quelqu'un aurait envie d'envoyer ce Reel ?
     Exemple : "à une amie qui vient de lancer son freelance et galère
     à fixer ses prix", "au copain qui doute toujours de sa légitimité".
   - POURQUOI : quelle est la qualité INTRINSÈQUE qui déclenche le partage ?
     Trois leviers possibles (en choisir UN dominant) :
     • RECONNAISSANCE — "C'est exactement ce qu'elle vit en ce moment"
       (situation ultra-spécifique, scène vécue qui résonne)
     • VALIDATION — "Ça va lui faire du bien d'entendre ça"
       (un ressenti non-dit nommé, une permission donnée, une vérité libératrice)
     • CONTRE-INTUITION DÉBATTABLE — "Tiens, ça va la faire réagir"
       (prise de position qui bouscule un consensus, info qui mérite discussion)
   
   ❌ MAUVAIS critère send-worthy :
   - "Ce Reel sera utile à beaucoup de gens" (trop large = personne envoie)
   - "Mes abonnées vont aimer" (aimer ≠ envoyer)
   - "Il y a un CTA 'partage ce reel'" (le CTA explicite ne fonctionne pas seul)
   
   ✅ BON critère send-worthy :
   - "Toute personne qui a déjà baissé son prix par culpabilité va vouloir
     l'envoyer à une amie qui fait pareil" → reconnaissance + validation
   - "Quiconque pense que poster tous les jours est obligatoire va vouloir
     en débattre avec son binôme de travail" → contre-intuition débattable
   
   IMPORTANT : la qualité send-worthy doit être INTRINSÈQUE au contenu,
   pas un CTA explicite "partage ce reel". Le viewer envoie parce que le
   contenu lui-même mérite d'être partagé, pas parce qu'on le lui demande.

══ RÈGLES DE SCRIPT ══

STRUCTURE :
- Hook (0-3s) : texte à l'écran + ce que tu dis. 1 phrase max. TENSION.
  PRÉFÉRENCE FORTE : commencer par "Je" ou "Ma/Mon" (vécu personnel).
  Le hook doit ancrer le spectateur dans une expérience, pas dans un concept.
  ❌ "Une com' complète en une minute" → ✅ "J'ai créé une com' complète en une minute"
- Corps (3-45s) : développe avec une SCÈNE CONCRÈTE. Raconte, ne liste pas.
  Chaque section du corps = 2-4 phrases COMPLÈTES de texte parlé.
  PAS de one-liners enchaînés. Le corps raconte UNE scène, pas 3 micro-conseils.
- CTA (45-60s) : fermeture naturelle. Question ou invitation.

OVERLAY — 3 RÔLES POSSIBLES (choisir 1 par section) :
- ANCRAGE : mot-clé ou concept qui reste à l'écran (ex: "POSITIONNEMENT")
- CONTREPOINT : info que le texte parlé ne dit PAS (un chiffre, un fait complémentaire)
- PUNCHLINE : chute visuelle, phrase d'impact différente du texte parlé
INTERDIT : overlay qui résume ou condense le texte parlé. L'overlay COMPLÈTE, il ne RÉPÈTE PAS.
3-8 mots max par overlay.

══ RÈGLE SPÉCIALE FRAME 1 (overlay du hook 0-3s) ══

50% des viewers regardent en MUTE. L'overlay de la frame 1 doit fonctionner SEUL,
sans le son. Un viewer qui ne voit QUE ce texte doit comprendre la promesse du Reel
et avoir envie de rester pour la suite.

L'overlay frame 1 n'est PAS un mot-clé décoratif. C'est un MINI-HOOK lisible seul.
Il doit contenir : soit une promesse concrète, soit une situation reconnaissable,
soit une affirmation contre-intuitive. JAMAIS juste un thème.

❌ MAUVAIS overlay frame 1 (mot-clé seul, sans contexte) :
- "POSITIONNEMENT"
- "Stratégie Instagram"
- "Mes conseils"
- "Astuce du jour"
→ Le viewer en mute ne sait pas pourquoi rester. Il scroll.

✅ BON overlay frame 1 (autoporteur, donne envie de rester) :
- "10K abonnés. Zéro client."
- "Pourquoi j'ai supprimé tous mes posts."
- "Ta cliente ne lit pas tes carrousels."
- "Le truc que personne ne te dit sur le pricing."
→ Le viewer en mute comprend l'enjeu et reste pour comprendre.

Cette règle s'applique UNIQUEMENT à l'overlay de la section 0-3s (hook).
Les overlays des sections suivantes peuvent rester en mode ancrage/contrepoint/punchline classique.

FORMAT DE SORTIE :
- Indique le timing, le texte parlé, le texte overlay (+ son rôle : ancrage/contrepoint/punchline), 
  les cuts visuels et le cadrage pour chaque section.
- TOTAL : 150-300 mots de texte parlé (rythme parlé = ~150 mots/minute).

══ EXEMPLE QUALITÉ ══

❌ SCRIPT GÉNÉRIQUE (listicle filmé) :
Hook: "3 erreurs sur Instagram"
Corps: "Erreur 1 : pas de stratégie. Erreur 2 : pas de régularité. Erreur 3 : pas de CTA."
→ Zéro scène, zéro tension, zéro déplacement. C'est un post lu à voix haute.

✅ SCRIPT QUI RACONTE (scène + déplacement) :
Hook: "Ma cliente avait 10K abonnés et zéro client."
Corps: "Je lui ai demandé : 'Tu postes pour qui ?'. Silence.
Elle postait 5 fois par semaine. Des tips, des infographies, des reels tendance.
Mais son audience idéale, elle scroll pas des tips. Elle cherche quelqu'un 
qui comprend SON problème. On a tout arrêté. 2 posts par semaine. 
Chaque post = une situation que sa cliente vit."
CTA: "Résultat 3 mois plus tard : 4 appels découverte par semaine."
→ Une scène, un déplacement narratif, un résultat concret.

INTERDITS :
- Script qui LISTE des conseils au lieu de RACONTER
- Hook descriptif ("Aujourd'hui on va parler de...")
- Hook impersonnel sans sujet humain ("Une stratégie simple", "3 étapes pour...")
- Texte overlay qui répète mot pour mot le texte parlé
- Script qu'on ne peut pas dire à voix haute naturellement
- One-liners enchaînés sans lien narratif`;

        // ── Calibrage durée Reel selon l'objectif (algo Instagram 2026) ──
        // Reach (visibilité) = format court 15-25s pour maximiser completion rate
        // Nurture (engagement, vente, crédibilité) = format long 45-75s pour storytelling
        if (effectiveObjective === "visibilite") {
          depthMandate += `

══ CALIBRAGE DURÉE — OBJECTIF VISIBILITÉ (REACH) ══

Pour ce Reel, l'objectif est d'atteindre des NON-ABONNÉS. L'algo Instagram pousse
vers les non-followers les Reels avec un FORT COMPLETION RATE (% de viewers qui
regardent jusqu'au bout). Donc : court = mieux.

CONTRAINTES SPÉCIFIQUES :
- DURÉE CIBLE : 15-25 secondes (PAS 30-60s comme le format standard).
- TEXTE PARLÉ : 40-80 mots maximum (PAS 150-300 mots).
- STRUCTURE RAMASSÉE :
  • Hook (0-3s) : 1 phrase ultra-directe, overlay autoporteur.
  • Corps (3-18s) : UNE seule scène ou UN seul déplacement de perspective.
    Pas de mise en contexte longue. On entre direct dans le vif.
  • CTA (18-25s) : 1 phrase de chute. Question courte ou affirmation finale.
- AUCUNE digression. Aucune nuance. UNE idée, UN angle, UN punch.
- Le viewer doit pouvoir tout consommer en moins de 25 secondes.

Privilégier la structure REEL FACE CAM ramassée OU REEL HOOK LOOP court.
Éviter REEL VOIX OFF + B-ROLL (trop long pour ce format).`;
        } else if (effectiveObjective === "engagement" || effectiveObjective === "vente" || effectiveObjective === "credibilite") {
          depthMandate += `

══ CALIBRAGE DURÉE — OBJECTIF ${effectiveObjective.toUpperCase()} (NURTURE) ══

Pour ce Reel, l'objectif est de NOURRIR la relation avec l'audience existante
(abonnés, prospects chauds). L'algo autorise et récompense les Reels plus longs
quand la rétention tient. On peut développer la scène et le récit.

CONTRAINTES SPÉCIFIQUES :
- DURÉE CIBLE : 45-75 secondes (storytelling assumé).
- TEXTE PARLÉ : 110-190 mots (rythme parlé naturel ~150 mots/min).
- STRUCTURE NARRATIVE DÉVELOPPÉE :
  • Hook (0-3s) : ouvre une boucle de curiosité forte.
  • Corps (3-60s) : développe la SCÈNE COMPLÈTE — contexte, déclic, déplacement,
    résolution. Le viewer doit ressentir une progression émotionnelle.
  • CTA (60-75s) : invitation cohérente avec l'objectif (dialogue / offre / approfondissement).
- ATTENTION : ne JAMAIS dépasser 90 secondes (au-delà = pénalité de distribution).
- Si le sujet ne porte pas 60s de contenu dense, RACCOURCIR plutôt que diluer.

Toutes les structures Reel sont possibles (FACE CAM, VOIX OFF + B-ROLL, HOOK LOOP).`;
        }
        // Si effectiveObjective est null ou autre valeur → format standard 30-60s du depth mandate de base.

      } else if (isStories) {
        depthMandate = `FORMAT : SÉQUENCE STORIES (5-7 stories)

══ AVANT D'ÉCRIRE : LES STORIES, C'EST UN MESSAGE VOCAL ÉCRIT ══

Les stories sont le format LE PLUS INTIME d'Instagram. Le spectateur les regarde généralement seul, souvent dans un moment d'attente, et il peut sortir à tout moment. C'est exactement comme un message vocal d'une amie qui te raconte un truc en marchant.

AVANT DE RÉDIGER, identifie :

1. QU'EST-CE QUE TU NE DIRAIS À PERSONNE D'AUTRE QU'À UNE AMIE PROCHE ?
   Les bonnes stories partagent un truc qu'on ne mettrait jamais dans un post : un doute, une réaction sur le vif, une observation banale qu'on trouve drôle, un échange qui nous a marqué·e.
   ❌ "Voici 5 conseils pour..." (c'est un post, pas une story)
   ✅ "Bon, je viens de finir un appel client et il faut que je vous raconte un truc" (intimité)

2. QUELLE EST LA VRAIE QUESTION QUE TU TE POSES ?
   La meilleure interaction (sondage/question) ne sert PAS à animer la communauté. Elle sert à apprendre quelque chose que TU veux savoir.
   ❌ "Quel est votre format préféré ? A) Carrousel B) Reel" (sondage générique pour likes)
   ✅ "Vous faites comment quand un client vous demande de baisser vos prix ?" (vraie question)

3. OÙ EST LA TENSION ENTRE LES STORIES ?
   Une bonne séquence n'est pas 5 stories indépendantes. C'est UN fil narratif qui donne envie de taper pour voir la suite. Chaque story laisse une mini-tension.

══ RÈGLES DE RÉDACTION ══

STRUCTURE NARRATIVE :
- Story 1 : amorce qui crée la curiosité. Pas de contexte, direct dans le vif. "Bon, faut que je vous raconte" / "OK, je viens de comprendre un truc"
- Stories 2-4 : développement avec ton naturel, comme si tu parlais à voix haute. Chaque story = 1 écran, 2-4 lignes MAX + indication visuelle.
- Story 4 ou 5 : INTERACTION (sondage, question, quiz) qui révèle quelque chose. Pas une animation creuse.
- Story finale : conclusion qui ouvre, pas qui ferme. Question, invitation, ou cliff-hanger pour la prochaine séquence.

POUR CHAQUE STORY, INDIQUE :
- Le TEXTE affiché (court, comme une bulle de pensée)
- Le TYPE : texte seul, photo+texte, vidéo, sondage, quiz, question ouverte
- L'AMBIANCE visuelle si pertinent (selfie cuisine, photo bureau, capture d'écran...)

INTERDITS :
- Stories qui sonnent comme un mini-post (formel, structuré, "voici X conseils")
- Sondages génériques pour faire "interactif"
- Conclusion qui résume au lieu d'ouvrir
- Stories trop longues (la lecture doit prendre 3-5 secondes max par story)
- Ton "marketing" : c'est une amie, pas une experte qui vend`;
      } else if (isLinkedIn) {
        // Inject enriched LinkedIn template if a matching editorial format was chosen
        const linkedinTemplateContent = editorialFormat && (LINKEDIN_TEMPLATES as any)[editorialFormat]
          ? (LINKEDIN_TEMPLATES as any)[editorialFormat]
          : "";

        depthMandate = `${ANTI_BROETRY_LINKEDIN}

FORMAT : POST LINKEDIN (1300-2000 caractères)

══ ÉTAPE 1 : AVANT D'ÉCRIRE, IDENTIFIE CES 3 ÉLÉMENTS ══

Avant de rédiger une seule ligne, tu DOIS répondre mentalement à ces 3 questions :

1. QUELLE CONVICTION ou ÉMOTION porte ce post ?

   Chaque bon post LinkedIn est porté par un ressort émotionnel : fierté d'un aboutissement, indignation face à un constat, enthousiasme pour une découverte, gratitude envers un parcours, frustration face à une norme...

   → Si tu ne trouves pas l'émotion, le post sera un communiqué. Cherche : qu'est-ce qui ANIME l'auteur·ice sur ce sujet ?

2. QUEL DÉTAIL CONCRET ancre le post dans le réel ?

   Un chiffre précis, une date, un lieu, une phrase entendue, une durée, un nom d'outil, un avant/après mesurable. C'est le détail qui fait que le lecteur se dit "c'est du vécu" et pas "c'est du ChatGPT".

   → Si le sujet ne contient pas de détail, INVENTE-EN PAS. Pose la question dans les réponses de l'utilisatrice, ou ancre dans le contexte branding.

3. QUEL EST LE MOUVEMENT NARRATIF ?

   Un post LinkedIn n'est pas une fiche info. C'est un MOUVEMENT qui embarque :

   - Annonce/événement → ne PAS décrire l'événement. Raconter le CHEMIN qui y mène ou la CONVICTION derrière.

   - Partage d'expertise → ne PAS lister des conseils. Partir d'un CONSTAT TERRAIN et creuser le POURQUOI.

   - Milestone/bilan → ne PAS énumérer les accomplissements. Choisir UN fil rouge émotionnel (ce qui n'a pas changé, ce qui a été le plus dur, ce qu'on referait).

   - Collaboration/rencontre → ne PAS présenter les personnes. Raconter ce que cette rencontre a PROVOQUÉ ou RÉVÉLÉ.

${linkedinTemplateContent ? `STRUCTURE ÉDITORIALE CHOISIE :\n${linkedinTemplateContent}\n\nSuis cette structure pour organiser le post.` : ""}

══ ÉTAPE 2 : ÉCRITURE ══

ACCROCHE (< 210 caractères) :

- Un FAIT CONCRET ou une ÉMOTION SINCÈRE. Jamais une promesse marketing, un teaser, ou un slogan.

- Exemples de patterns qui marchent : "Ça y est, [fait concret] !" / "Il y a [durée], [situation de départ]. Aujourd'hui, [contraste]." / "Quand [situation concrète], [réaction ou constat]."

- Exemples de patterns INTERDITS : "[Sujet] n'aura plus de secrets pour vous !" / "Je voulais partager avec vous..." / "Et si on parlait de [sujet] ?"

CORPS :

- LinkedIn = conversation entre pro. Le ton est direct, chaleureux, engagé. L'oral est OK : "en vrai", "le truc c'est que", "bon", "franchement".

- 2-3 paragraphes de prose fluide. UNE idée creusée, pas 5 survolées.

- Chaque paragraphe apporte du NOUVEAU. Si tu reformules le paragraphe précédent, coupe.

- Le rythme vient du CONTRASTE (longue phrase qui déroule → courte qui claque), pas de rafales.

- PRENDS POSITION. Un bon post LinkedIn dit avec quoi l'auteur·ice n'est PAS d'accord, ce qui l'étonne, ce qui le/la dérange. Pas de "chacun son avis".

FIN :

- Question PRÉCISE liée au sujet, ou rien du tout si le texte se suffit.

- La dernière phrase apporte du NOUVEAU ou laisse une tension ouverte.

- JAMAIS de résumé, JAMAIS de crescendo rhétorique.

FORMAT :

- 0-2 emojis max, jamais en puces

- 0-2 hashtags niche en fin

- Écriture inclusive avec point médian

- Pas de tirets cadratin (—), utiliser : ou ;

- DENSE : 1300-2000 caractères. Zéro remplissage.

══ INTERDITS ABSOLUS ══

- Storytelling fabriqué ("Et là, tout a basculé", "Le déclic ?", "Ce jour-là j'ai compris")

- Phrases courtes en rafale pour l'effet dramatique

- Listes à puces inspirationnelles

- Promesses marketing en accroche

- "Et vous, qu'en pensez-vous ?" comme CTA

- Flex déguisé en humilité

- Étirer une idée de 3 phrases sur 8 paragraphes

- Post qui DÉCRIT un sujet sans PRENDRE POSITION dessus`;
      } else if (isPinterest) {
        const pinterestContext = (pinterest_link || pinterest_board)
          ? `\nDÉTAILS DE L'ÉPINGLE :\n${pinterest_link ? `- Lien de destination : ${pinterest_link}` : "- Pas de lien fourni"}\n${pinterest_board ? `- Tableau de destination : "${pinterest_board}"` : ""}\n${pinterest_link ? `\nLa description doit donner envie de cliquer sur ce lien. Mentionne ce que la personne va trouver en cliquant.` : ""}\n`
          : "";

        depthMandate = `FORMAT : ÉPINGLE PINTEREST (titre + description)

Pinterest est un MOTEUR DE RECHERCHE VISUEL, pas un réseau social. Le contenu est optimisé pour la RECHERCHE.
${pinterestContext}

TITRE (max 100 caractères) :
- Mot-clé principal dans les 3 premiers mots
- Descriptif et utile, pas accrocheur clickbait
- "Idées décoration salon bohème" > "Vous n'allez pas croire cette déco"
- "Comment [verbe] [complément]" fonctionne très bien
- Penser : qu'est-ce que ma cible taperait dans la barre de recherche Pinterest ?

DESCRIPTION (100-200 mots, 2-3 paragraphes) :
- Décrire CE QUE la personne va trouver en cliquant sur le lien
- Intégrer les mots-clés naturellement dans le texte (pas de keyword stuffing)
- Ton clair, utile, descriptif. Moins de personnalité qu'Instagram.
- PAS de hashtags (inutiles sur Pinterest)
- Inclure un appel à l'action doux en fin ("Découvre le guide complet", "Retrouve toutes les étapes sur le site", "Enregistre cette épingle pour plus tard")
- Écriture inclusive avec point médian

TU NE FAIS JAMAIS :
- Hashtags (ça ne sert à rien sur Pinterest)
- Titres clickbait ou accrocheurs style Instagram ("Vous n'allez pas croire...")
- Jargon marketing (funnel, lead magnet, ROI)
- Ton trop personnel ou émotionnel (c'est du SEO, pas du storytelling)
- Tiret cadratin (—)

STRUCTURE DE RÉPONSE :
📌 TITRE : [titre SEO optimisé, max 100 caractères]

📝 DESCRIPTION :
[paragraphe 1 : ce que la personne va trouver/apprendre]
[paragraphe 2 : détails, bénéfices concrets]
[paragraphe 3 : appel à l'action doux]`;
      } else if (isNewsletter) {
        depthMandate = `FORMAT : NEWSLETTER / EMAIL (1500-3000 caractères)

══ AVANT D'ÉCRIRE : LA NEWSLETTER N'EST PAS UN POST RALLONGÉ ══

La newsletter est le format le plus INTIME. Le lecteur a donné son email : 
il a dit "oui, je veux t'entendre". C'est une conversation privée, 
pas un broadcast.

AVANT DE RÉDIGER, identifie :

1. QUELLE EST L'HISTOIRE PERSONNELLE qui porte ce sujet ?
   Chaque bonne newsletter part d'un VÉCU : un moment de la semaine, 
   une conversation, une lecture, un échec, une découverte. 
   Pas "je vais te parler de [sujet]" mais "il m'est arrivé un truc 
   cette semaine et ça m'a fait réaliser quelque chose sur [sujet]".

2. QUEL EST L'INSIGHT que le lecteur ne trouvera nulle part ailleurs ?
   La newsletter ne résume pas un article ou un post. Elle offre une 
   RÉFLEXION qui n'existe que dans ta tête. Le "comment je vois les choses" 
   que personne d'autre ne peut écrire.

3. OÙ EST LE MOMENT "AH, JE N'AVAIS JAMAIS VU ÇA COMME ÇA" ?
   Si le lecteur peut refermer l'email en se disant "oui, je savais déjà", 
   la newsletter a échoué. Il doit y avoir UN point qui déplace le regard.

══ RÈGLES DE RÉDACTION ══

OBJET D'EMAIL :
- Max 50 caractères. Accrocheur mais pas clickbait.
- Le meilleur test : "est-ce que j'ouvrirais cet email entre 2 réunions ?"
- Patterns qui marchent : question courte, constat décalé, confession
- ❌ "Ma newsletter #12" / "Les news du mois"
- ✅ "J'ai failli tout annuler" / "Le conseil que je regrette d'avoir suivi"

INTRO (2-3 phrases) :
- Direct dans le vif. Pas de "Bonjour, j'espère que tu vas bien".
- Commencer par le VÉCU : la scène, le moment, la phrase entendue.
- ❌ "Aujourd'hui je voulais te parler de..."
- ✅ "Mardi, une cliente m'a renvoyé son brouillon avec ce commentaire : '...'"

CORPS :
- Développe en profondeur. C'est le format France Culture de la com.
- Apartés personnels en italique ou entre parenthèses.
- Au moins 2 exemples concrets ou anecdotes.
- Des nuances, des "oui mais", des zones grises. La newsletter n'est pas 
  un cours : c'est une réflexion partagée.

CONCLUSION :
- JAMAIS de résumé ("Pour résumer, retiens que...").
- Une ouverture : question qui reste, tension non résolue, invitation.
- ✅ "Je n'ai pas la réponse. Mais je crois que la question mérite qu'on s'y arrête."
- ❌ "En résumé, les 3 points à retenir sont..."

CTA : doux, en lien avec le sujet. Pas de vente agressive.

LONGUEUR : vise 2000+ caractères. La profondeur justifie la longueur ici.`;
      } else if (isPhotoMode) {
        depthMandate = `FORMAT : LÉGENDE PHOTO INSTAGRAM (400-800 caractères)

══ AVANT D'ÉCRIRE : LA LÉGENDE EST LE HORS-CHAMP DE LA PHOTO ══

La légende ne décrit JAMAIS la photo. La photo se suffit visuellement. La légende raconte ce que la photo NE PEUT PAS montrer : le contexte invisible, l'émotion derrière le geste, ce qui s'est passé juste avant ou juste après.

${body.photo_description ? `PHOTO DÉCRITE PAR L'UTILISATRICE : "${body.photo_description}"` : ""}

AVANT DE RÉDIGER, identifie :

1. QU'EST-CE QUE LA PHOTO NE MONTRE PAS ?
   La photo montre une scène. Mais qu'est-ce qu'il y a AUTOUR ? L'odeur du café, la fatigue dans les jambes, la conversation qui vient de finir, l'heure qu'il était, ce qu'on pensait à ce moment-là.
   ❌ "Voici mon bureau du matin avec mon café" (description de ce qu'on voit)
   ✅ "C'était la 3e tasse. Et j'avais toujours pas commencé à écrire." (le hors-champ)

2. QUELLE ÉMOTION SPÉCIFIQUE est associée à ce moment ?
   Pas "j'aime mon métier" (générique). Une émotion PRÉCISE et NOMMABLE : la fierté qui surprend, l'agacement qui retombe, la fatigue heureuse, le doute qui s'installe.

3. QUELLE EST LA PHRASE QUI DÉPLACE LE REGARD ?
   La meilleure légende fait dire au lecteur "tiens, c'est vrai, j'avais jamais vu ça comme ça". Ce n'est pas une morale, c'est un angle inattendu sur quelque chose de banal.

══ RÈGLES DE RÉDACTION ══

ACCROCHE :
- Fait ÉCHO à l'image sans la décrire
- Court, ancré dans un détail concret
- ❌ "Voici un moment de mon quotidien"
- ✅ "Il était 23h. La cliente n'avait toujours pas répondu."

CORPS :
- Développe ce que la photo NE DIT PAS
- Ton SENSORIEL : texture, lumière, chaleur, poids, odeur, son
- 2-4 phrases qui avancent. Chaque phrase apporte du nouveau.
- 1 imperfection humaine (aparté, autocorrection, mot familier)

FIN :
- CTA doux : invitation, question, ou rien si la phrase finale se suffit
- JAMAIS de vente agressive ni de promesse marketing

FORMAT :
- 400-800 caractères. La photo fait la moitié du travail.
- 5-10 hashtags niche en fin

INTERDITS :
- Décrire ce qu'on voit (la photo le fait)
- "Voici / Voilà / Aujourd'hui je vous partage" en accroche
- Ton "fiche produit" ou "présentation"
- Légende qui pourrait fonctionner avec n'importe quelle autre photo`;
      } else {
        depthMandate = `FORMAT : CAPTION INSTAGRAM

══ AVANT D'ÉCRIRE : LA CAPTION EST UNE CONVERSATION ══

Une bonne caption Instagram ne ressemble pas à un mini-article. C'est un moment de conversation entre la créatrice et son audience. Le ton, la structure, le rythme doivent donner l'impression que la personne s'est posée et a écrit comme elle parlerait.

AVANT DE RÉDIGER, identifie :

1. QU'EST-CE QUE TU AS À DIRE QUE PERSONNE D'AUTRE NE DIRAIT ?
   Une caption qui dit "il faut être authentique" pourrait être écrite par n'importe qui. Une caption qui dit "j'ai mis 3 ans à comprendre que l'authenticité ne s'apprend pas en suivant des conseils" porte une voix.

2. QUEL EST LE MOMENT CONCRET qui ancre ce que tu veux dire ?
   Pas "en général" mais "la semaine dernière", "hier", "il y a 2 ans", "ce matin". Le concret rend la voix crédible.

3. QUELLE TENSION OU QUELLE NUANCE ouvre la fin ?
   La meilleure caption laisse une question, un "et si", un doute productif. Pas une morale, pas un résumé, pas un CTA générique.

${effectiveObjective === "visibilite" || effectiveObjective === "visibilité" ? `
══ OBJECTIF : VISIBILITÉ ══
LONGUEUR : 300-600 caractères. Court, percutant. L'idée doit claquer en quelques phrases.
Le hook fait tout le travail. Le corps développe UNE seule idée. Pas de remplissage.
Privilégie une prise de position ou un constat décalé qui donne envie de partager.
` : effectiveObjective === "engagement" ? `
══ OBJECTIF : ENGAGEMENT ══
LONGUEUR : 400-800 caractères. Assez pour raconter, pas assez pour perdre l'attention.
Le hook crée la connexion. Le corps partage du vécu ou pose une question qui touche. La fin invite au dialogue (question précise, pas générique).
` : effectiveObjective === "vente" || effectiveObjective === "conversion" ? `
══ OBJECTIF : VENTE ══
LONGUEUR : 600-1200 caractères. Assez pour dérouler la preuve et l'invitation.
Le hook nomme un problème concret. Le corps montre la transformation par un cas réel (pas d'argumentaire abstrait). La fin ouvre la porte sans forcer.
` : `
══ LONGUEUR ══
600-1200 caractères. Adapte au sujet : si l'idée tient en 600 caractères, ne l'étire pas.
`}
══ RÈGLES DE RÉDACTION ══

ACCROCHE (les 125 premiers caractères) :
- C'est la phrase la plus importante. C'est ce qui décide si on clique "voir plus".
- Un FAIT CONCRET, une ÉMOTION, ou une SITUATION précise. Jamais une promesse.
- Patterns qui marchent : "Il y a [durée], [situation]. Aujourd'hui..." / "Quand [situation concrète]..." / "J'ai [action concrète]."
- Patterns INTERDITS : "Aujourd'hui je voulais te parler de..." / "Tu fais sûrement cette erreur..." / "[Sujet] n'aura plus de secrets pour toi"

CORPS :
- Développe UNE idée en profondeur. Pas 3 idées survolées.
- Au moins 1 exemple concret, 1 anecdote ou 1 chiffre.
- Apartés entre parenthèses *(comme ça)* ou en italique pour la respiration humaine.
- Bucket brigades naturelles : "Sauf que", "Le truc c'est que", "En vrai", "Bon"
- 1 imperfection humaine par caption : autocorrection, parenthèse, mot familier

FIN :
- Question PRÉCISE liée au sujet (pas "Et toi, qu'en penses-tu ?")
- OU invitation au dialogue spécifique
- OU phrase qui ouvre une tension (pas qui résume)
- NE PAS étirer pour atteindre une longueur cible. Si c'est dit en 400 caractères, c'est 400.

INTERDITS :
- Caption qui décrit un sujet sans prendre position
- Conclusion qui résume ce qui a été dit
- Liste de conseils numérotés
- Ton "experte qui explique" sans incarnation`;
      }

      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${isLinkedIn || isPinterest || isNewsletter ? "" : FORMAT_STRUCTURES}

${isLinkedIn || isPinterest ? "" : WRITING_RESOURCES}

${isLinkedIn || isPinterest || isNewsletter ? "" : VISUAL_ANALOGIES}

${angle ? `ANGLE CHOISI :
- Titre : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}` : "Pas d'angle spécifique choisi. Choisis le meilleur angle pour le sujet."}

SUJET DE L'UTILISATRICE :
"""
${context}
"""
Le contenu DOIT parler de ce sujet. Les réponses aux questions ci-dessous enrichissent le sujet mais ne le remplacent pas.

CANAL : ${contentType || "Post Instagram"}
${editorialFormatLabel ? `FORMAT ÉDITORIAL : ${editorialFormatLabel}` : ""}
${angle?.format_livraison ? `FORMAT DE LIVRAISON : ${angle.format_livraison}` : ""}

${depthMandate}

RÉPONSES DE L'UTILISATRICE :
${answersBlock}
${followUpBlock}
${calendarBlock}${objectiveBlock}
${preGenBlock}

RÈGLE ANTI-FABRICATION :
N'invente JAMAIS une anecdote, un cas client ou un chiffre que l'utilisatrice n'a pas écrit.
Pas de vécu fourni → angle expert : décryptage, constat décalé, prise de position.

${PREGEN_INJECTION_RULES}

═══════════════════════════════════════════════════
PROFONDEUR (RÈGLE ABSOLUE)
═══════════════════════════════════════════════════

Tu ne fais JAMAIS de contenu de surface. Chaque contenu doit donner au lecteur quelque chose qu'il ne savait pas, qu'il n'avait pas vu comme ça, ou qu'il n'aurait pas formulé aussi bien.

Profondeur = au moins UN de ces éléments dans chaque contenu :
1. Un EXEMPLE CONCRET (pas "par exemple, imagine que..." mais une vraie situation, un vrai cas, un vrai chiffre)
2. Un MÉCANISME EXPLIQUÉ (le "pourquoi" derrière le "quoi" : pourquoi ça marche, pourquoi on se trompe, pourquoi c'est contre-intuitif)
3. Une NUANCE qui surprend (le "oui, mais" ou le "sauf que" qui empêche le contenu d'être un conseil générique)
4. Un LIEN INATTENDU (connecter le sujet à un domaine auquel personne n'avait pensé)

Si ton contenu pourrait être écrit par n'importe quel compte de la même niche, c'est pas assez profond. Ce qui le rend unique, c'est le point de vue, les exemples, et les nuances de l'utilisatrice.

Les gens scrollent les contenus qui DISENT des choses qu'ils savaient déjà.
Ils s'arrêtent sur les contenus qui leur font VOIR les choses autrement.

═══════════════════════════════════════════════════
SELF-CHECK (fais-le en interne avant de répondre)
═══════════════════════════════════════════════════

Avant de retourner le JSON, vérifie :
1. Est-ce que le contenu a au moins 1 exemple concret ? (pas une généralité)
2. Est-ce que l'accroche est assez forte pour stopper le scroll ?
3. Est-ce que j'ai utilisé les MOTS de l'utilisatrice (ses réponses, ses expressions) ?
4. Est-ce que le contenu dit quelque chose de SPÉCIFIQUE (qu'on ne pourrait pas copier-coller pour un autre sujet) ?
5. Est-ce que la longueur respecte le format demandé ?
6. Est-ce que le contenu passe le test du café (lisible à voix haute sans sonner robot) ?
Si une réponse est NON, RÉÉCRIS avant de retourner.

═══════════════════════════════════════════════════
DERNIÈRES VÉRIFICATIONS (À APPLIQUER APRÈS RÉDACTION)
═══════════════════════════════════════════════════

${CHAIN_OF_THOUGHT}

ANTI-SLOP FINAL — Relis ton output et vérifie :
1. Contient-il un marqueur IA banni (rafale de phrases courtes, "Et là tout a basculé", storytelling fabriqué) ? → Réécris la phrase.
2. Chaque phrase ajoute-t-elle une information NOUVELLE ? → Supprime toute redondance.
3. Pourrais-tu dire ce texte à voix haute à une amie sans que ça sonne bizarre ? → Simplifie ce qui coince.
4. Le texte fait-il la bonne longueur ? Si tu peux dire la même chose en moins de mots → Coupe.
Retourne UNIQUEMENT la version finale corrigée.

${variation && previousContent ? `
═══════════════════════════════════════════════════
MODE RÉÉCRITURE : VERSION ALTERNATIVE
═══════════════════════════════════════════════════

L'utilisatrice a déjà reçu cette version et veut AUTRE CHOSE :
"""
${previousContent.slice(0, 2000)}
"""

Tu DOIS proposer une version SIGNIFICATIVEMENT DIFFÉRENTE :
- Accroche DIFFÉRENTE : pas la même reformulée, une AUTRE approche (si la v1 commençait par une question, commence par une affirmation choc ; si la v1 était un constat, commence par une anecdote)
- Point d'entrée DIFFÉRENT dans le sujet (si la v1 partait du problème, pars de la solution ; si la v1 était éducative, sois émotionnelle)
- Le message central reste cohérent mais l'angle d'attaque change
- Ne fais PAS une variation cosmétique (mêmes idées avec d'autres mots). Fais une VRAIE alternative.
` : ""}
Rédige le contenu en suivant les INSTRUCTIONS DE RÉDACTION FINALE ci-dessus.
Le contenu doit être PRÊT À POSTER (pas un brouillon).

${isReel ? `Réponds UNIQUEMENT en JSON valide :
{
  "format_type": "le sous-format choisi (face_cam_confession, voix_off_b_roll, hook_loop, talking_head, transition_reveal, etc.)",
  "duree_cible": "durée cible (ex: 45 sec, 30 sec, 60 sec)",
  "sections": [
    {
      "timing": "0-3s",
      "label": "Hook",
      "format_visuel": "description de ce qu'on voit à l'écran (cadrage, décor, geste)",
      "texte_parle": "le texte exact dit à voix haute",
      "texte_overlay": "le texte affiché à l'écran (court, percutant, 3-8 mots max)",
      "cut": "type de transition (cut sec, zoom, swipe, etc.)",
      "tip": "conseil de tournage pour cette section (optionnel)"
    }
  ],
  "personal_tip": "un conseil personnalisé pour le tournage, lié à l'activité de l'utilisatrice",
  "pillar": "le pilier de contenu",
  "objectif": "visibilité | confiance | vente",
  "accroche": "le hook des 3 premières secondes (pour le calendrier)"
}

IMPORTANT pour les sections :
- Minimum 4 sections, maximum 7
- Chaque section a un timing réaliste qui s'enchaîne
- texte_parle : le script COMPLET dit à voix haute (phrases complètes, pas des bullet points)
- texte_overlay : COURT (3-8 mots max), le texte affiché à l'écran
- format_visuel : description concrète du plan caméra
- cut : la transition entre cette section et la suivante
- Le total du texte parlé = 150-300 mots` : `Réponds UNIQUEMENT en JSON :
{
  "content": "...",
  "accroche": "...",
  "format": "...",
  "pillar": "...",
  "objectif": "..."
}`}`;
      userPrompt = "Rédige mon contenu à partir de mes réponses et de l'angle choisi.";

    } else if (step === "adjust") {
      // Smart guidance based on adjustment type
      const adjustLower = (adjustment || "").toLowerCase();
      let adjustGuidance = "";
      if (adjustLower.includes("long")) {
        const isCarouselContent = currentContent?.includes("SLIDE") || currentContent?.includes("📌");
        adjustGuidance = isCarouselContent
          ? "AJOUTE une slide supplémentaire qui développe un point existant en profondeur. Ne rallonge pas les slides existantes."
          : "Développe l'idée principale avec un exemple concret ou une anecdote. Ne rallonge pas artificiellement avec des transitions vides.";
      } else if (adjustLower.includes("court")) {
        adjustGuidance = "Coupe les transitions faibles et les répétitions. Garde les punchlines et les exemples concrets. Ne sacrifie pas la profondeur.";
      } else if (adjustLower.includes("punchy")) {
        adjustGuidance = "Raccourcis les phrases longues. Ajoute des bucket brigades. L'accroche doit claquer plus fort.";
      } else if (adjustLower.includes("exemples") || adjustLower.includes("concret")) {
        adjustGuidance = "Remplace les conseils abstraits par des situations concrètes. Chaque point doit avoir un exemple terrain, un cas réel, ou un chiffre.";
      } else if (adjustLower.includes("storytelling") || adjustLower.includes("histoire")) {
        adjustGuidance = "Restructure autour d'une narration. Commence par un moment précis (lieu, émotion), développe la tension, puis la résolution.";
      } else if (adjustLower.includes("chiffres") || adjustLower.includes("données") || adjustLower.includes("stats")) {
        adjustGuidance = "Ajoute 2-3 données chiffrées. Si pas de chiffres exacts disponibles, indique [STAT À VÉRIFIER] pour que l'utilisatrice insère les vrais chiffres.";
      }

      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}

${editorialFormatLabel ? `FORMAT ÉDITORIAL : ${editorialFormatLabel}` : ""}
${effectiveObjective ? `OBJECTIF : ${effectiveObjective}` : ""}
${angle ? `ANGLE : ${angle.title} (${angle.tone})` : ""}

CONTENU ACTUEL :
"""
${currentContent}
"""

AJUSTEMENT DEMANDÉ : ${adjustment}
${adjustGuidance ? `\nGUIDE :\n${adjustGuidance}` : ""}

Réécris le contenu avec l'ajustement demandé. Garde la structure, les anecdotes et les mots de l'utilisatrice. Change UNIQUEMENT ce qui est lié à l'ajustement.
Ne raccourcis JAMAIS la profondeur sauf si l'ajustement demande explicitement de raccourcir.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
      userPrompt = `Ajuste le contenu : ${adjustment}`;

    } else if (step === "recycle") {
      const requestedFormats = (formats || []).map((f: string) => formatLabels[f] || f);

      // Persona and target from context
      const recycleActivity = ctx?.profile?.activite || profile?.activite || "";
      const recycleTarget = ctx?.profile?.cible || profile?.cible || "";
      const recyclePiliers = ctx?.profile?.piliers || "";

      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${CHAIN_OF_THOUGHT}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}
${objectiveBlock}
═══════════════════════════════════════════════════
MISSION : RECYCLAGE DE CONTENU
═══════════════════════════════════════════════════

Tu vas recycler un contenu existant en ${requestedFormats.length} format(s) : ${requestedFormats.join(", ")}.

ÉTAPE 1 — ANALYSE (réfléchis en interne, ne montre PAS cette étape) :

Avant de rédiger quoi que ce soit, analyse le contenu source :
1. Quel est le MESSAGE CENTRAL ? (la thèse, en 1 phrase)
2. Quelles sont les SOUS-IDÉES exploitables ? (liste 3-5 idées distinctes)
3. Quelle est l'ÉMOTION dominante ? (vulnérabilité, colère, joie, révélation, urgence)
4. Quels EXEMPLES ou ANECDOTES sont présents ?
5. Quels CHIFFRES ou PREUVES sont utilisables ?

ÉTAPE 2 — ATTRIBUTION DES ANGLES :

Chaque format DOIT prendre une sous-idée DIFFÉRENTE du contenu source.
Ce n'est pas du reformatage (dire la même chose en plus court). C'est de la dérivation (explorer une facette différente du même sujet).

Matrice d'angles par format :
- Carrousel : prend l'idée la plus PÉDAGOGIQUE. Développe-la en profondeur. Structure en progression logique (constat > bascule > solution > application).
- Reel : prend l'idée la plus PROVOCANTE ou CONTRE-INTUITIVE. Hook en 3 secondes. Oral, direct, une seule idée martelée.
- Stories : prend l'angle le plus INTIME ou PERSONNEL. Comme un message vocal à une amie. Confidences, coulisses, réactions spontanées.
- LinkedIn : prend l'angle le plus ENGAGÉ. Prise de position, conviction, question de fond. Ton direct et pro-amical. Dense (1300-2000 car.), pas de remplissage.
- Newsletter : prend l'angle le plus PROFOND. C'est le format qui a le plus de place : développe une réflexion complète avec nuances, apartés, exemples concrets.

Si 2 formats risquent de se chevaucher, force un pivot : change le point d'entrée, la question posée, ou le public visé dans le contenu.

ÉTAPE 3 — RÉDACTION :

Pour chaque format, rédige un contenu COMPLET et PRÊT À POSTER. Pas un brouillon.

${recycleActivity ? `L'utilisatrice est : ${recycleActivity}.` : ""}
${recycleTarget ? `Sa cible : ${recycleTarget}. Adapte le vocabulaire et les exemples à cette audience.` : ""}
${recyclePiliers ? `Ses piliers de contenu : ${recyclePiliers}. Le recyclage doit rester cohérent avec ces piliers.` : ""}

LONGUEURS OBLIGATOIRES :
- Carrousel : 8 slides détaillées (slide 1 = hook, slides 2-7 = développement, slide 8 = punchline + CTA). Chaque slide = 2-4 phrases. Pas de slides d'1 mot.
- Reel : script complet avec timecodes (0-3s hook, 3-15s contexte, 15-45s coeur, 45-60s CTA). Indique les cuts et le texte à l'écran.
- Stories : séquence de 5-7 stories. Chaque story = ce qui est affiché (texte, sticker, sondage) + indication visuelle. Story 4 = interaction obligatoire.
- LinkedIn : 1300-2000 caractères. Prose fluide, pas de listes à puces. Accroche dans les 210 premiers caractères. 0-2 hashtags en fin.
- Newsletter : 1500-3000 caractères. Objet d'email accrocheur. Structure : hook personnel > développement > leçon > CTA.

RÈGLE DE PROFONDEUR :
Tu ne raccourcis JAMAIS une idée pour "faire court" ou "tout faire rentrer".
Un carrousel de 8 slides qui va au bout d'UNE idée > un carrousel de 8 slides qui survole 3 idées.
Un reel de 45 secondes sur UN point percutant > un reel de 60 secondes qui liste des conseils.

RÈGLE DE VOIX :
Chaque format doit sonner comme si l'utilisatrice l'avait écrit elle-même. Si elle utilise "en vrai", "le truc c'est que", "franchement" dans le contenu source, RÉUTILISE ces expressions. L'IA structure et amplifie, elle ne réécrit pas.

SELF-CHECK FINAL (fais-le en interne avant de répondre) :
- Est-ce que chaque format a un angle VRAIMENT différent ? Si 2 formats disent la même chose en changeant juste la longueur, RÉÉCRIS.
- Est-ce que les accroches sont assez fortes pour stopper le scroll ?
- Est-ce que le contenu passe le test du café (lisible à voix haute sans sonner robot) ?
- Est-ce que j'ai utilisé des expressions de la source ou est-ce que j'ai tout réécrit en mode IA ?
- Est-ce que les longueurs sont respectées ?

Réponds UNIQUEMENT en JSON valide :
{
  "results": {
    ${(formats || []).map((f: string) => `"${f}": "contenu complet ici"`).join(",\n    ")}
  }
}`;

      // Move source text to user message instead of system prompt
      userPrompt = sourceText
        ? `Voici le contenu à recycler :\n\n"""\n${sourceText}\n"""\n\nRecycle-le en ${requestedFormats.join(", ")}. Chaque format prend un angle différent. Contenu complet et prêt à poster.`
        : `Recycle ce contenu en ${requestedFormats.join(", ")}. Chaque format prend un angle différent.`;

    } else if (step === "dictation") {
      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${WRITING_RESOURCES}

L'utilisatrice a dicté ceci en mode vocal :
"""
${sourceText}
"""

Transforme en : ${targetFormat}

RÈGLES ABSOLUES :
- Garde SES mots. Si elle dit "le truc c'est que", utilise "le truc c'est que".
- Garde SON rythme. Si elle fait des phrases longues qui déroulent, garde ça.
- Garde SES expressions. Si elle dit "franchement" ou "genre", c'est sa voix.
- NE réécris PAS dans un style "professionnel". Structure, c'est tout.
- Tu peux couper les répétitions et les hésitations.
- Tu peux réorganiser l'ordre pour plus de clarté.
- Tu DOIS garder l'énergie et la personnalité de l'oral.

Le résultat doit sonner comme si ELLE l'avait écrit, pas comme si une IA avait reformulé.

Réponds UNIQUEMENT en JSON :
{
  "content": "..."
}`;
      userPrompt = `Structure ma dictée vocale en ${targetFormat}.`;

    } else {
      return new Response(JSON.stringify({ error: "Step non reconnu" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // COMMON_PREFIX already includes BASE_SYSTEM_RULES + voice priority + CORE_PRINCIPLES + ANTI_SLOP + ETHICAL_GUARDRAILS + fullContext

    // ── Deep Research (web search via Anthropic) ──
    if (deepResearch && step === "generate") {
      // Check deep_research quota
      const drQuota = await checkQuota(user.id, "deep_research");
      if (!drQuota.allowed) {
        return new Response(
          JSON.stringify({ error: "limit_reached", message: drQuota.message, remaining: 0 }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      const theme = calendarContext?.theme || context || contentType || "contenu";
      const activite = profile?.activite || "";

      // Build targeted research prompt based on objective and editorial format
      const researchObjective = effectiveObjective || objective || "";
      const researchAngle = editorialFormatLabel || angle?.title || "";
      let researchFocus = "";
      if (researchObjective.includes("vente") || researchObjective.includes("conversion")) {
        researchFocus = "Cherche en priorité : des témoignages, des études de cas, des chiffres de transformation (avant/après), des statistiques de conversion ou de résultats clients.";
      } else if (researchObjective.includes("credibilite") || researchObjective.includes("crédibilité")) {
        researchFocus = "Cherche en priorité : des études scientifiques, des rapports sectoriels, des données chiffrées officielles, des avis d'experts reconnus.";
      } else if (researchObjective.includes("visibilite") || researchObjective.includes("visibilité")) {
        researchFocus = "Cherche en priorité : des tendances émergentes, des chiffres surprenants ou contre-intuitifs, des faits viralisables, des comparaisons frappantes.";
      } else if (researchObjective.includes("confiance") || researchObjective.includes("engagement")) {
        researchFocus = "Cherche en priorité : des histoires humaines, des situations vécues universelles, des sondages d'opinion, des verbatims ou témoignages.";
      }
      
      let researchAngleHint = "";
      if (researchAngle.toLowerCase().includes("mythe") || researchAngle.toLowerCase().includes("déconstruire")) {
        researchAngleHint = "Le contenu va déconstruire un mythe. Cherche des données qui CONTREDISENT une croyance courante sur le sujet.";
      } else if (researchAngle.toLowerCase().includes("enquête") || researchAngle.toLowerCase().includes("décryptage")) {
        researchAngleHint = "Le contenu est une enquête/décryptage. Cherche des données récentes et des tendances que peu de gens connaissent.";
      } else if (researchAngle.toLowerCase().includes("test") || researchAngle.toLowerCase().includes("grandeur nature")) {
        researchAngleHint = "Le contenu est un retour d'expérience. Cherche des benchmarks, des moyennes sectorielles, des résultats comparatifs.";
      }

      const searchResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: getModelForAction("content"),
          max_tokens: 2048,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{
            role: "user",
            content: `Recherche des données récentes sur le sujet suivant : ${theme}.
Contexte professionnel : ${activite}.
${researchFocus ? `\n${researchFocus}` : ""}
${researchAngleHint ? `\n${researchAngleHint}` : ""}

Résume les 3-5 points les plus pertinents. Pour chaque point, donne :
- Le fait ou la donnée
- La source (nom du média, de l'étude, ou de l'organisme)
- Pourquoi c'est intéressant pour du contenu social media

Privilégie les sources françaises et européennes quand elles existent.`,
          }],
        }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        // Extract all text blocks from the response
        const textParts: string[] = [];
        for (const block of (searchData.content || [])) {
          if (block.type === "text") {
            textParts.push(block.text);
          }
        }
        const researchResult = textParts.join("\n\n");

        if (researchResult.trim()) {
          systemPrompt += `\n\n--- RECHERCHE WEB ---\n${researchResult}\n--- FIN RECHERCHE ---\n\nUtilise ces données pour enrichir le contenu avec des faits concrets, des chiffres, des exemples récents. Ne cite pas les sources directement mais intègre les infos naturellement.`;
        }
      } else {
        console.error("Deep research web search failed:", searchResponse.status);
      }

      // Log deep research usage
      await logUsage(user.id, "deep_research", "web_search", undefined, "claude-sonnet-4-5-20250929", workspace_id);
    }

    // ── Streaming SSE (generate step only, no photo/deepResearch) ──
    const wantsStream = req.headers.get("Accept") === "text/event-stream";
    if (wantsStream && step === "generate" && !body.photo_mode && !deepResearch) {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      const model = getModelForAction("content");

      // LinkedIn: disable streaming, use 2-step generation + correction
      if (isLinkedIn) {
        console.log("[CORRECTION DEBUG] LinkedIn correction pass STARTED");
        const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.85, 4096);
        console.log("[CORRECTION DEBUG] First call done, rawContent length:", rawContent?.length);

        // Parse the raw content to extract the post text
        let postText = "";
        try {
          const parsed = JSON.parse(rawContent);
          postText = parsed.content || parsed.full_text || rawContent;
        } catch {
          const match = rawContent.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              postText = parsed.content || parsed.full_text || rawContent;
            } catch { postText = rawContent; }
          } else {
            postText = rawContent;
          }
        }

        // Step 2: Correction pass — short, focused prompt
        const correctionPrompt = `Tu es un éditeur LinkedIn exigeant. Tu reçois un post et tu dois le CORRIGER systématiquement. Ton job n'est PAS de juger si c'est "déjà bien" — c'est de traquer et corriger TOUS les patterns IA, même subtils.

══ TEST FONDAMENTAL (à appliquer AVANT toute correction) ══

Lis le post à voix haute mentalement. Pose-toi cette question :

"Est-ce que ce post pourrait avoir été écrit par une assistante IA bien entraînée ?"

Si la réponse est "oui, possiblement" → tu DOIS réécrire les passages qui te font hésiter.

Si la réponse est "non, c'est clairement humain" → tu peux retourner la version corrigée.

Le critère n'est pas "est-ce que c'est joli" mais "est-ce que c'est INDISTINGUABLE d'un humain".

══ CORRECTIONS OBLIGATOIRES — APPLIQUE TOUTES CELLES QUI S'APPLIQUENT ══

1. PHRASES COURTES CONSÉCUTIVES (compte-les) :
   → COMPTE les phrases consécutives de moins de 10 mots.
   → Si tu trouves 2 phrases courtes (< 10 mots) qui se suivent : FUSIONNE-LES.
   → Si tu trouves 1 phrase isolée < 10 mots seule entre 2 sauts de ligne : INTÈGRE-LA dans le paragraphe précédent ou suivant.
   → Le rythme vient de l'ALTERNANCE longue/courte, pas de la répétition courte/courte.
   ❌ "C'était brillant. Trop brillant." → ✅ "C'était brillant. Tellement brillant que ça en devenait illisible."
   ❌ "C'était beau. Vraiment." → ✅ "C'était objectivement beau, et c'est exactement là le problème."
   ❌ "Et là, j'ai compris." → ✅ "Et là, j'ai compris ce qui clochait."

2. ÉNUMÉRATIONS RYTHMIQUES PARFAITES :
   → Une énumération de 3 éléments avec une structure parallèle ("Des X, des Y, des Z" ou "X qui A, Y qui B, Z qui C") est un marqueur IA.
   → Casse la symétrie : varie les longueurs, ajoute une parenthèse, supprime un élément.
   ❌ "Des couleurs pop, une typo qui claque, un univers visuel cohérent."
   → ✅ "Les couleurs étaient pop, la typo claquait, et tout collait visuellement."
   ❌ "Des métaphores partout, des jeux de mots subtils, une structure narrative en trois actes."
   → ✅ "Plein de métaphores, des jeux de mots, une structure en trois actes : bref, du travail."

3. FORMULES MANUFACTURÉES (mots-valises copywriting) :
   → Détecte les expressions qui sonnent comme un livre de marketing.
   → Liste non-exhaustive (cherche des variantes) : "noyé dans l'esthétique", "bruit joli", "vitrine sans produit", "fondations bancales", "habiller un message", "habillage du fond", "emballage sans contenu", "décorer la maison", "le squelette du contenu", "l'ADN de la marque", "le pilier de", "le socle de", "transformer notre manière de [verbe]".
   → Si tu vois UNE de ces expressions OU UNE expression du même registre → réécris en plus brut, plus parlé.
   ❌ "Le message était noyé dans l'esthétique." → ✅ "Le message était invisible derrière le visuel."
   ❌ "transformer notre manière de consommer, de créer et de vivre" → ✅ "changer comment on consomme, comment on crée : et même comment on vit"

4. RAFALES "PAS X. PAS Y. C'EST Z." :
   → Cette structure parallèle est un marqueur IA.
   → Réécris en prose continue.
   ❌ "C'est pas sexy. C'est pas instagrammable. Ça ressemble à du travail de fond."
   → ✅ "C'est pas sexy ni instagrammable, ça ressemble plus à du travail de fond ingrat."

5. ANAPHORES (3+ phrases qui démarrent pareil) :
   → Compte les débuts de phrase. Si 3+ commencent par le même mot/groupe : RÉÉCRIS.
   ❌ "Par dire les choses. Par ne pas forcer. Par être direct·e."
   → ✅ "En disant les choses sans forcer personne à deviner. En étant direct·e."
   ❌ "Je parle de visibilité. Je parle du droit. Je parle de réhabiliter."
   → ✅ "Je parle de visibilité, du droit de prendre sa place, de réhabiliter la communication."

6. EMPILEMENT INSPIRATIONNEL (2+ phrases-valeurs sans exemple concret) :
   → Si 2 phrases consécutives expriment des valeurs abstraites sans aucun fait : remplace par UN exemple concret.
   ❌ "Les projets éthiques méritent d'être vus. Les créatrices ont le droit de prendre leur place."
   → ✅ "Une céramiste qui fait un travail incroyable mais que personne ne connaît, c'est pas un choix de discrétion. C'est un problème de visibilité."

7. ACCROCHE PROMESSE/SLOGAN :
   → Si l'accroche promet quelque chose ("X n'aura plus de secrets", "Voici comment...", "5 erreurs à éviter") : remplace par un FAIT concret ou une scène vécue.

8. CTA GÉNÉRIQUE :
   → "Et toi/vous, qu'en penses-tu/pensez-vous ?" ou variante existentielle large : remplace par une question SPÉCIFIQUE au sujet du post, ou supprime.

9. CONCLUSION QUI RÉSUME :
   → Si la dernière phrase reformule ce qui a été dit : remplace par une ouverture (question, tension, invitation) ou supprime.
   ❌ "Mais pour ça, elle doit d'abord être comprise." (résume)
   → ✅ "Et c'est cette base, peut-être, qu'on a oubliée." (ouvre)

10. GENRÉ NON INCLUSIF :
    → Pas de point médian sur les noms communs : ajoute-le.

11. REDONDANCE :
    → Si 2+ paragraphes expriment la même idée sous angles différents : garde le plus CONCRET, fusionne ou supprime les autres.

12. LONGUEUR :
    → Cible : 1300-1700 caractères. Si > 1700 : supprime le paragraphe le plus abstrait.

══ RÈGLES ABSOLUES ══

- Garde le SENS et la CONVICTION du post. Tu corriges la FORME, pas le FOND.
- N'invente pas de nouveaux faits. Garde les détails concrets de l'original.
- Le post corrigé fait entre 1300 et 1700 caractères.
- JAMAIS de tiret cadratin (—). Utilise : ou ; ou des virgules.
- Écriture inclusive avec point médian.

══ AUTO-VÉRIFICATION FINALE ══

Avant de retourner le JSON, RELIS ton output et vérifie :

□ Y a-t-il encore 2 phrases courtes consécutives ? → fusionne
□ Y a-t-il encore une formule manufacturée ? → réécris
□ La conclusion ouvre-t-elle vraiment ? → vérifie qu'elle ne résume pas
□ Le post sonne-t-il INDISTINGUABLE d'un humain ? → si non, recommence

Réponds UNIQUEMENT en JSON :
{
  "content": "le post complet corrigé",
  "accroche": "les 210 premiers caractères",
  "corrections_applied": ["liste courte des corrections faites"]
}`;
        const correctedRaw = await callAnthropicSimple(
          getModelForAction("content"),
          correctionPrompt,
          `Voici le post LinkedIn à corriger :\n\n"""\n${postText}\n"""`,
          0.3,
          4096
        );
        console.log("[CORRECTION DEBUG] Correction call done, correctedRaw length:", correctedRaw?.length);

        // Parse corrected content, fallback to original if correction fails
        let finalResult: any = null;
        try {
          finalResult = JSON.parse(correctedRaw);
        } catch {
          const match = correctedRaw.match(/\{[\s\S]*\}/);
          if (match) {
            try { finalResult = JSON.parse(match[0]); } catch { finalResult = null; }
          }
        }

        // If correction succeeded, use it; otherwise fall back to original
        console.log("[CORRECTION DEBUG] finalResult.content present:", !!finalResult?.content);
        if (finalResult?.content) {
          let originalParsed: any = {};
          try { originalParsed = JSON.parse(rawContent); } catch {
            const m = rawContent.match(/\{[\s\S]*\}/);
            if (m) try { originalParsed = JSON.parse(m[0]); } catch {}
          }

          const merged = {
            ...originalParsed,
            content: finalResult.content,
            accroche: finalResult.accroche || originalParsed.accroche,
            format: originalParsed.format || "linkedin",
            pillar: originalParsed.pillar || "",
            objectif: originalParsed.objectif || "",
          };

          await logUsage(user.id, "content", "creative_flow", undefined, undefined, workspace_id);
          return new Response(JSON.stringify(merged), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log("[CORRECTION DEBUG] FALLBACK triggered — returning uncorrected post");
        // Fallback: return original if correction failed
        let fallbackParsed: any;
        try { fallbackParsed = JSON.parse(rawContent); } catch {
          const m = rawContent.match(/\{[\s\S]*\}/);
          if (m) try { fallbackParsed = JSON.parse(m[0]); } catch { fallbackParsed = { content: rawContent }; }
          else fallbackParsed = { content: rawContent };
        }

        await logUsage(user.id, "content", "creative_flow", undefined, undefined, workspace_id);
        return new Response(JSON.stringify(fallbackParsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Carousel: disable streaming, use 2-step generation + correction
      if (isCarousel) {
        const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.85, 4096);

        // Parse the raw content
        let parsedContent: any = null;
        try {
          parsedContent = JSON.parse(rawContent);
        } catch {
          const match = rawContent.match(/\{[\s\S]*\}/);
          if (match) {
            try { parsedContent = JSON.parse(match[0]); } catch {}
          }
        }

        // Extract slides text for correction
        const slidesText = parsedContent?.content || rawContent;

        // Step 2: Correction pass for carousel
        const carouselCorrectionPrompt = `Tu es un éditeur de carrousels Instagram exigeant. Tu reçois un carrousel et tu dois le CORRIGER slide par slide.

CORRECTIONS OBLIGATOIRES — applique TOUTES celles qui s'appliquent :

1. SLIDE-TITRE (slide qui ne contient qu'1 phrase ou moins de 15 mots) :
   → Développer à 2-4 phrases. Ajouter un exemple, une nuance, un détail concret.
   → Exception : Slide 1 (hook) DOIT être courte (1-2 phrases max).

2. NUMÉROTATION DE CONSEILS ("Conseil 1", "Erreur n°2", "Étape 3", "Astuce") :
   → Supprimer la numérotation. Reformuler comme un moment dans un arc narratif.
   → "Conseil 1 : Soyez authentique" → "Ce que j'ai compris après 2 ans à copier les autres : l'authenticité n'est pas un style, c'est ce qui reste quand on arrête de performer."

3. SLIDES REDONDANTES (2 slides qui disent la même chose différemment) :
   → Fusionner en une seule slide plus dense, ou remplacer la plus faible par un nouvel angle.

4. MANQUE DE CONCRET (slide entièrement abstraite, sans exemple ni chiffre ni situation) :
   → Ajouter un détail concret : un cas, un chiffre, une phrase entendue, un avant/après.

5. SLIDE FINALE QUI RÉSUME :
   → Remplacer par une punchline qui OUVRE (question, tension non résolue, invitation) au lieu de fermer.

6. CAPTION FAIBLE (caption qui répète le contenu des slides) :
   → Le hook de la caption doit être DIFFÉRENT de la slide 1. La caption apporte un COMPLÉMENT, pas un résumé.

RÈGLES :
- Garde l'ARC NARRATIF du carrousel. Tu corriges les slides faibles, pas la structure globale.
- Chaque slide corrigée fait 2-4 phrases (sauf slide 1 : 1-2 phrases max).
- Le carrousel corrigé fait 1500-3000 caractères au total.
- Retourne le même format JSON que l'original avec les slides corrigées.

Réponds UNIQUEMENT en JSON :
{
  "content": "le carrousel complet corrigé avec les marqueurs 📌 SLIDE et 📝 CAPTION",
  "accroche": "le hook de la slide 1",
  "corrections_applied": ["liste courte des corrections faites"]
}`;

        const correctedRaw = await callAnthropicSimple(
          getModelForAction("content"),
          carouselCorrectionPrompt,
          `Voici le carrousel à corriger :\n\n"""\n${slidesText}\n"""`,
          0.3,
          4096
        );

        // Parse corrected content, fallback to original if correction fails
        let finalResult: any = null;
        try {
          finalResult = JSON.parse(correctedRaw);
        } catch {
          const match = correctedRaw.match(/\{[\s\S]*\}/);
          if (match) {
            try { finalResult = JSON.parse(match[0]); } catch { finalResult = null; }
          }
        }

        if (finalResult?.content) {
          const merged = {
            ...(parsedContent || {}),
            content: finalResult.content,
            accroche: finalResult.accroche || parsedContent?.accroche,
            format: parsedContent?.format || "carrousel",
            pillar: parsedContent?.pillar || "",
            objectif: parsedContent?.objectif || "",
          };

          await logUsage(user.id, "content", "creative_flow", undefined, undefined, workspace_id);
          return new Response(JSON.stringify(merged), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fallback: return original
        await logUsage(user.id, "content", "creative_flow", undefined, undefined, workspace_id);
        return new Response(JSON.stringify(parsedContent || { content: rawContent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Non-LinkedIn, non-Carousel: stream as usual
      const anthropicStream = await streamAnthropicSSE(
        apiKey,
        model,
        systemPrompt,
        [{ role: "user", content: userPrompt! }],
        0.85,
        4096,
      );

      return createClientSSEStream(anthropicStream, corsHeaders, async () => {
        await logUsage(user.id, "content", "creative_flow", undefined, undefined, workspace_id);
      });
    }

    // ── Call Anthropic ──
    let rawContent: string;

    // Build files array (backward compatible)
    const filesArray: any[] = body.files || (body.fileBase64 ? [{ base64: body.fileBase64, mimeType: body.fileMimeType, name: "fichier" }] : []);

    if (step === "recycle" && filesArray.length > 0) {
      // Validate total size (~20 Mo max in base64)
      let totalSize = 0;
      for (const f of filesArray) {
        totalSize += (f.base64?.length || 0);
      }
      if (totalSize > 27_000_000) { // ~20 Mo in base64
        return new Response(
          JSON.stringify({ error: "La taille totale des fichiers dépasse 20 Mo. Réduis le nombre ou la taille des fichiers." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Anthropic limit: max 5 PDFs
      let pdfCount = 0;
      let pdfWarning = "";
      const content: any[] = [];

      for (const f of filesArray.slice(0, 10)) {
        if (f.mimeType === "application/pdf") {
          pdfCount++;
          if (pdfCount > 5) {
            pdfWarning = "\n⚠️ Note : seuls les 5 premiers PDFs ont été analysés (limite technique).";
            continue;
          }
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: f.base64 },
          });
        } else if (f.mimeType?.startsWith("image/")) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: f.mimeType, data: f.base64 },
          });
        }
      }

      const requestedFormats = (formats || []).map((f: string) => formatLabels[f] || f);
      const fileNames = filesArray.map((f: any) => f.name || "fichier").join(", ");
      const textInstruction = sourceText
        ? `Voici aussi du contexte texte :\n${sourceText}\n\nRecycle le contenu de ces ${filesArray.length} fichier(s) (${fileNames}) et du texte en ${requestedFormats.join(", ")}. Synthétise les informations clés de tous les fichiers, ne traite pas chaque fichier isolément.${pdfWarning}`
        : `Analyse ces ${filesArray.length} fichier(s) (${fileNames}) et recycle leur contenu en ${requestedFormats.join(", ")}. Synthétise les informations clés de tous les fichiers.${pdfWarning}`;

      content.push({ type: "text", text: textInstruction });

      rawContent = await callAnthropic({
        model: getModelForAction("content"),
        system: systemPrompt,
        messages: [{ role: "user", content }],
        temperature: 0.8,
        max_tokens: 4096,
      });
    } else if (step === "generate" && body.photo_mode && body.photos?.[0]?.base64) {
      // Photo mode with vision: send the image to Claude
      const photoBase64 = body.photos[0].base64.replace(/^data:image\/[a-z]+;base64,/, "");
      const photoMimeType = body.photos[0].mimeType || "image/jpeg";
      const photoContent: any[] = [
        {
          type: "image",
          source: { type: "base64", media_type: photoMimeType, data: photoBase64 },
        },
        {
          type: "text",
          text: `Rédige une légende Instagram pour cette photo.${body.photo_description ? `\nDescription de l'utilisatrice : "${body.photo_description}"` : ""}\nLa légende doit COMPLÉTER l'image, pas la décrire. Ton sensoriel. 400-800 caractères.\n\nRéponds UNIQUEMENT en JSON :\n{\n  "content": "...",\n  "accroche": "...",\n  "format": "caption_photo",\n  "pillar": "...",\n  "objectif": "..."\n}`,
        },
      ];

      rawContent = await callAnthropic({
        model: getModelForAction("content"),
        system: systemPrompt,
        messages: [{ role: "user", content: photoContent }],
        temperature: 0.85,
        max_tokens: 4096,
      });
    } else {
      const maxTokens = step === "questions" ? 800 : undefined;
      rawContent = await callAnthropicSimple(getModelForAction("content"), systemPrompt, userPrompt!, 0.85, maxTokens);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = { raw: rawContent }; }
      } else {
        parsed = { raw: rawContent };
      }
    }

    await logUsage(user.id, "content", "creative_flow", undefined, undefined, workspace_id);
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    if (e instanceof ValidationError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (e?.status === 429) {
      return new Response(JSON.stringify({ error: "Trop de requêtes. Réessaie dans un moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("creative-flow error:", e);
    const userMessage = e?.message?.includes("API") || e?.message?.includes("IA")
      ? e.message
      : "L'IA a eu un blanc. Réessaie dans quelques instants.";
    return new Response(JSON.stringify({ error: userMessage }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
