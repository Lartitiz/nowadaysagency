import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES, ANTI_SLOP, CHAIN_OF_THOUGHT, ETHICAL_GUARDRAILS, ANTI_BIAS, PREGEN_INJECTION_RULES, EDITORIAL_ANGLES_REFERENCE, VISUAL_ANALOGIES, LINKEDIN_TEMPLATES, ANTI_BROETRY_LINKEDIN, EMBEDDED_EDUCATION } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildProfileBlock, buildPreGenFallback } from "../_shared/user-context.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkQuota, logUsage } from "../_shared/plan-limiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";
import { streamAnthropicSSE, createClientSSEStream } from "../_shared/anthropic-stream.ts";
import { getRecentBriefsContext } from "../_shared/recent-briefs.ts";
import { carouselBrief, reelBrief, storiesBrief, linkedinBrief, pinterestBrief, newsletterBrief, photoCaptionBrief, captionBrief } from "../_shared/format-briefs.ts";
import { buildVisionQuestionsPrompt, buildVisionGenerateBrief } from "../_shared/vision-prompts.ts";
import { runPipeline } from "../_shared/request-pipeline.ts";
import { buildSeriesContext } from "../_shared/series-context.ts";

// buildBrandingContext replaced by shared getUserContext + formatContextForAI

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  try {
    // Parse body first to extract workspace_id
    let body: any = {};
    if (req.method !== "OPTIONS") {
      try { body = await req.json(); } catch { body = {}; }
    }

    const r = await runPipeline(req, {
      category: "content",
      workspaceId: body?.workspace_id ?? undefined,
    });
    if (!r.ok) return r.response;
    const { userId, supabase } = r;

    validateInput(body, z.object({
      step: z.string().max(50),
      contentType: z.string().max(100).optional().nullable(),
      context: z.string().max(8000).optional().nullable(),
      adjustment: z.string().max(2000).optional().nullable(),
      sourceText: z.string().max(10000).optional().nullable(),
      targetFormat: z.string().max(100).optional().nullable(),
      workspace_id: z.string().uuid().optional().nullable(),
      objective: z.string().max(50).optional().nullable(),
      editorialFormat: z.string().max(100).optional().nullable(),
      editorialFormatLabel: z.string().max(200).optional().nullable(),
      photo_mode: z.boolean().optional(),
      photo_description: z.string().max(2000).optional().nullable(),
      photos: z.array(z.object({ base64: z.string(), mimeType: z.string().optional(), context: z.string().max(200).optional() })).max(1).optional(),
      recent_briefs_context: z.string().max(6000).optional().nullable(),
      face_cam: z.string().max(50).optional().nullable(),
      time_available: z.string().max(50).optional().nullable(),
      is_launch: z.boolean().optional().nullable(),
      selected_hook: z.any().optional().nullable(),
      pre_gen_answers: z.any().optional().nullable(),
      inspiration_context: z.string().max(5000).optional().nullable(),
      editorial_angle: z.string().max(200).optional().nullable(),
      content_structure: z.string().max(5000).optional().nullable(),
      launch_context: z.any().optional().nullable(),
      price_range: z.string().max(50).optional().nullable(),
      series_id: z.string().uuid().optional().nullable(),
      episode_number: z.number().int().min(1).optional().nullable(),
    }).passthrough());
    const { step, contentType, context, profile, angle, answers, followUpAnswers, content: currentContent, adjustment, calendarContext, preGenAnswers, sourceText, formats, targetFormat, workspace_id, deepResearch, objective, editorialFormat, editorialFormatLabel, variation, previousContent, pinterest_link, pinterest_board, recent_briefs_context: recentBriefsFromBody, series_id, episode_number } = body;

    // Determine channel from contentType for persona selection
    const channelFromType = contentType?.includes("linkedin") ? "linkedin" : contentType?.includes("instagram") || contentType?.includes("carousel") || contentType?.includes("reel") || contentType?.includes("stories") ? "instagram" : undefined;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const ctx = await getUserContext(supabase, userId, workspace_id, channelFromType);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);

    // Recent briefs context — fetched server-side as fallback if not provided.
    // Used by `questions` step to avoid repeating angles already covered.
    let recentBriefsContext = recentBriefsFromBody || "";
    if (!recentBriefsContext && (step === "questions" || step === "follow-up")) {
      recentBriefsContext = await getRecentBriefsContext(supabase, userId, workspace_id, 3);
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
    // Do NOT re-fetch with userId (that would use the coach's voice instead of the client's).
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
${brandingContext ? `\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n` : ""}${brandVocabBlock}${recentBriefsContext}
L'utilisatrice a choisi cet angle pour son contenu :
- Sujet : ${context}
- Canal : ${channelLabel}
${editorialFormatLabel ? `- Format éditorial : ${editorialFormatLabel}` : ""}
- Angle : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}
${angle.format_livraison ? `- Format de livraison recommandé : ${angle.format_livraison}` : ""}
${calendarBlock}${objectiveBlock}

══ AVANT DE POSER LES QUESTIONS — RAISONNEMENT INTERNE (ne PAS afficher) ══

Réfléchis silencieusement à :
1. Qu'est-ce que je sais DÉJÀ sur l'utilisatrice grâce au branding et aux briefs précédents ?
2. Qu'est-ce qui MANQUE pour rendre ce contenu unique sur CE sujet précis ?
3. Quels angles ont DÉJÀ été couverts dans les briefs récents ? (À ÉVITER de re-demander)
4. Quel vocabulaire métier puis-je réutiliser dans les questions ?

Puis pose les 3 questions qui maximisent l'apport NOUVEAU sur ce sujet.

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
9. ${recentBriefsContext ? "MÉMOIRE DES BRIEFS PRÉCÉDENTS : si un brief récent a déjà couvert un angle (ex : déjà demandé une anecdote sur le même type de situation), CHANGE d'angle. Tu peux faire écho discrètement (\"la dernière fois tu disais X, ici c'est différent ?\") mais ne re-demande jamais la même chose." : ""}

INTERDIT — NE FAIS JAMAIS ÇA :
- Questions génériques type "Qu'est-ce qui te passionne dans ton métier ?", "Quel est ton parcours ?", "Qu'est-ce qui te différencie ?"
- Questions de coaching de vie déconnectées du sujet
- Questions trop larges qui pourraient s'appliquer à N'IMPORTE QUEL sujet
- 3 questions qui commencent toutes par "Raconte-moi" ou "Il y a eu un moment où"
- Questions interchangeables d'un user à l'autre (= sans vocabulaire métier)
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
${brandingContext ? `\nCONTEXTE BRANDING DE L'UTILISATRICE :\n${brandingContext}\n` : ""}${brandVocabBlock}
SUJET du contenu : "${context}"

L'utilisatrice a répondu à ces 3 questions initiales :
${answersBlock}

══ TON RÔLE : creuser UN détail singulier ══

Lis ses réponses comme une amie experte qui veut sortir le contenu unique.
Identifie LE détail le plus intéressant, le plus singulier, ou le plus émotionnel — celui qui mérite d'être creusé pour passer du "post correct" au "post mémorable".

Pose 1 à 2 questions de suivi MAXIMUM pour creuser CE détail spécifique.

RÈGLES :
- Cite EXPLICITEMENT le détail que tu creuses (ex : "Tu dis que ta cliente a pleuré quand tu as livré : qu'est-ce qu'elle a dit exactement ?")
- Sois PRÉCISE, pas générique. Pas "Peux-tu détailler ?" mais "Cette phrase '[citation]' — c'est arrivé dans quel contexte ?"
- Si une réponse contient un chiffre, une scène, une citation, ou une émotion forte → c'est CETTE matière qu'il faut creuser
- Si toutes les réponses sont déjà très complètes, pose 1 SEULE question (pas 2) — ne creuse pas pour creuser
- Le ${"\""}why${"\""} explique en 1 phrase pourquoi cette question rendra le contenu plus singulier

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
      userPrompt = "Pose-moi 1 ou 2 questions d'approfondissement basées sur mes réponses.";

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
      let storiesGardeFouAlerte: string | null = null;
      if (isCarousel) {
        depthMandate = carouselBrief();
      } else if (isReel) {
        depthMandate = reelBrief({
          effectiveObjective,
          face_cam: body.face_cam,
          time_available: body.time_available,
          is_launch: body.is_launch,
          selected_hook: body.selected_hook,
          pre_gen_answers: body.pre_gen_answers,
          subject: context,
          editorial_angle: body.editorial_angle,
          content_structure: body.content_structure,
          inspiration_context: body.inspiration_context,
        });
      } else if (isStories) {
        // Garde-fou : 3 séquences vente sur 7 jours (migré depuis stories-ai)
        if (effectiveObjective === "vente") {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const gardeFouCol = workspace_id ? "workspace_id" : "user_id";
          const gardeFouVal = workspace_id || userId;
          const { count } = await supabase
            .from("stories_sequences")
            .select("id", { count: "exact", head: true })
            .eq(gardeFouCol, gardeFouVal)
            .eq("objective", "vente")
            .gte("created_at", sevenDaysAgo);
          if ((count ?? 0) >= 3) {
            storiesGardeFouAlerte = "⚠️ Tes stories récentes sont très orientées vente. Reviens à de la connexion ou de l'éducation pour maintenir la confiance. Ratio sain : 80% connexion/éducation, 20% vente.";
          }
        }
        depthMandate = storiesBrief({
          objective: effectiveObjective,
          price_range: body.price_range,
          time_available: body.time_available,
          face_cam: body.face_cam,
          is_launch: body.is_launch,
          gardeFouAlerte: storiesGardeFouAlerte,
          pre_gen_answers: body.pre_gen_answers,
          subject: context,
        });
      } else if (isLinkedIn) {
        depthMandate = linkedinBrief(editorialFormat);
      } else if (isPinterest) {
        depthMandate = pinterestBrief(pinterest_link, pinterest_board);
      } else if (isNewsletter) {
        depthMandate = newsletterBrief();
      } else if (isPhotoMode) {
        depthMandate = photoCaptionBrief(body.photo_description);
      } else {
        depthMandate = captionBrief(effectiveObjective);
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

${isReel || isStories ? `` : `Réponds UNIQUEMENT en JSON :
{
  "content": "...",
  "accroche": "...",
  "format": "...",
  "pillar": "...",
  "objectif": "..."
}`}`;
      // Inject launch context for stories AND reels (preserved from stories-ai / reels-ai)
      if ((isStories || isReel) && body.launch_context) {
        const lc = body.launch_context;
        systemPrompt += `\n\nCONTEXTE LANCEMENT :\n- Phase : ${lc.phase || "?"}\n- Chapitre : ${lc.chapter_label || "?"}\n- Phase mentale audience : ${lc.audience_phase || "?"}\n- Objectif du slot : ${lc.objective || "?"}\n- Angle suggéré : ${lc.angle_suggestion || "?"}\nCONSIGNE : adapte le contenu à cette phase du lancement. Un contenu de phase "vente" n'a pas le même ton qu'un contenu de phase "teasing".`;
      }
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

    // ── Inject SERIES context (when this post belongs to a series) ──
    if (series_id && step === "generate") {
      try {
        const channelForSeries = isLinkedIn ? "linkedin" : isPinterest ? "pinterest" : isNewsletter ? "newsletter" : "instagram";
        const seriesCtx = await buildSeriesContext(supabase, series_id, episode_number, channelForSeries);
        if (seriesCtx) {
          console.log(`[creative-flow] series context injected (${contentType}): ${seriesCtx.seriesName} (ep #${seriesCtx.episodeNumber})`);
          systemPrompt += `\n\n${seriesCtx.block}`;
        }
      } catch (e) {
        console.error("[creative-flow] buildSeriesContext failed", e);
      }
    }


    // ── Deep Research (web search via Anthropic) ──
    if (deepResearch && step === "generate") {
      // Check deep_research quota
      const drQuota = await checkQuota(userId, "deep_research");
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
      await logUsage(userId, "deep_research", "web_search", undefined, "claude-sonnet-4-5-20250929", workspace_id);
    }

    // ── Streaming SSE (generate step only, no photo/deepResearch) ──
    const wantsStream = req.headers.get("Accept") === "text/event-stream";
    if (wantsStream && step === "generate" && !body.photo_mode && !deepResearch && !isStories && !isReel) {
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

          await logUsage(userId, "content", "creative_flow", undefined, undefined, workspace_id);
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

        await logUsage(userId, "content", "creative_flow", undefined, undefined, workspace_id);
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

          await logUsage(userId, "content", "creative_flow", undefined, undefined, workspace_id);
          return new Response(JSON.stringify(merged), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fallback: return original
        await logUsage(userId, "content", "creative_flow", undefined, undefined, workspace_id);
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
        await logUsage(userId, "content", "creative_flow", undefined, undefined, workspace_id);
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
    } else if (step === "questions" && body.photo_mode && body.photos?.[0]?.base64) {
      // Vision-anchored questions: let Claude SEE the photo to ask grounded questions
      const photoBase64Q = body.photos[0].base64.replace(/^data:image\/[a-z]+;base64,/, "");
      const photoMimeQ = body.photos[0].mimeType || "image/jpeg";
      const perPhotoCtxQ = body.photos[0].context?.trim();

      const visionQuestionsPrompt = buildVisionQuestionsPrompt({
        contentType,
        context,
        objective,
        photo_description: body.photo_description,
        per_photo_context: perPhotoCtxQ,
      });

      rawContent = await callAnthropic({
        model: getModelForAction("content"),
        system: systemPrompt,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: photoMimeQ, data: photoBase64Q } },
            { type: "text", text: visionQuestionsPrompt },
          ],
        }],
        temperature: 0.8,
        max_tokens: 1500,
      });
    } else if (step === "generate" && body.photo_mode && body.photos?.[0]?.base64) {
      // Photo mode with vision: send the image to Claude — format-aware prompt
      const photoBase64 = body.photos[0].base64.replace(/^data:image\/[a-z]+;base64,/, "");
      const photoMimeType = body.photos[0].mimeType || "image/jpeg";
      const perPhotoCtx = body.photos[0].context?.trim();

      const { formatBrief, jsonShape } = buildVisionGenerateBrief(contentType);

      const photoContent: any[] = [
        {
          type: "image",
          source: { type: "base64", media_type: photoMimeType, data: photoBase64 },
        },
        {
          type: "text",
          text: `${formatBrief}${perPhotoCtx ? `\nContexte précis fourni par l'utilisatrice sur cette photo : "${perPhotoCtx}" (utilise-le pour identifier les éléments visuels, pas pour le recopier).` : ""}${body.photo_description ? `\nDescription globale de l'utilisatrice : "${body.photo_description}"` : ""}\n\n⚠️ INTERDICTION ABSOLUE de recopier un exemple textuel. Génère du contenu ORIGINAL ancré dans CETTE image et CE sujet.\n\nRéponds UNIQUEMENT en JSON :\n${jsonShape}`,
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

    await logUsage(userId, "content", "creative_flow", undefined, undefined, workspace_id);
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
