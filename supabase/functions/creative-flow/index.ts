import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORE_PRINCIPLES, FRAMEWORK_SELECTION, FORMAT_STRUCTURES, WRITING_RESOURCES, ANTI_SLOP, CHAIN_OF_THOUGHT, ETHICAL_GUARDRAILS, ANTI_BIAS, PREGEN_INJECTION_RULES, EDITORIAL_ANGLES_REFERENCE } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS, buildProfileBlock, buildPreGenFallback } from "../_shared/user-context.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { validateInput, ValidationError } from "../_shared/input-validators.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";
import { isDemoUser } from "../_shared/guard-demo.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction } from "../_shared/anthropic.ts";

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
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
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
    }).passthrough());
    const { step, contentType, context, profile, angle, answers, followUpAnswers, content: currentContent, adjustment, calendarContext, preGenAnswers, sourceText, formats, targetFormat, workspace_id, deepResearch, objective, editorialFormat, editorialFormatLabel, variation, previousContent } = body;

    // Determine channel from contentType for persona selection
    const channelFromType = contentType?.includes("linkedin") ? "linkedin" : contentType?.includes("instagram") || contentType?.includes("carousel") || contentType?.includes("reel") || contentType?.includes("stories") ? "instagram" : undefined;

    const profileBlock = profile ? buildProfileBlock(profile) : "";
    const ctx = await getUserContext(supabase, user.id, workspace_id, channelFromType);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.content);
    
    // Fetch voice profile (personal, always user_id)
    const { data: voiceData } = await supabase.from("voice_profile").select("*").eq("user_id", user.id).maybeSingle();
    let voiceBlock = "";
    if (voiceData) {
      const vl: string[] = ["PROFIL DE VOIX DE L'UTILISATRICE :"];
      if (voiceData.structure_patterns?.length) vl.push(`- Structure : ${(voiceData.structure_patterns as string[]).join(", ")}`);
      if (voiceData.tone_patterns?.length) vl.push(`- Ton : ${(voiceData.tone_patterns as string[]).join(", ")}`);
      if (voiceData.signature_expressions?.length) vl.push(`- Expressions signature à utiliser : ${(voiceData.signature_expressions as string[]).join(", ")}`);
      if (voiceData.banned_expressions?.length) vl.push(`- Expressions interdites (NE JAMAIS UTILISER) : ${(voiceData.banned_expressions as string[]).join(", ")}`);
      if (voiceData.voice_summary) vl.push(`- Style résumé : ${voiceData.voice_summary}`);
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
    const COMMON_PREFIX = BASE_SYSTEM_RULES + "\n\n" + incarnationBlock + "\n\n" + `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :\n- Reproduis fidèlement le style décrit\n- Réutilise les expressions signature naturellement dans le texte\n- RESPECTE les expressions interdites : ne les utilise JAMAIS\n- Imite les patterns de ton et de structure\n- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA\n\n` + CORE_PRINCIPLES + "\n\n" + ANTI_SLOP + "\n\n" + ETHICAL_GUARDRAILS + "\n\n" + fullContext;

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
      systemPrompt = `${COMMON_PREFIX}

L'utilisatrice a choisi cet angle pour son contenu :
- Canal : ${contentType}
${editorialFormatLabel ? `- Format éditorial : ${editorialFormatLabel}` : ""}
- Angle : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}
${angle.format_livraison ? `- Format de livraison recommandé : ${angle.format_livraison}` : ""}
${calendarBlock}${objectiveBlock}

Pose exactement 3 questions pour récupérer SA matière première. Ces questions doivent extraire des anecdotes, des réflexions, des émotions PERSONNELLES qui rendront le contenu unique et impossible à reproduire par une IA seule.

RÈGLES :
- Questions OUVERTES (pas oui/non)
- Questions SPÉCIFIQUES à l'angle choisi (pas génériques)
- Demande des scènes, des moments, des détails concrets
- Une question peut demander une opinion tranchée ou une conviction
- Le ton des questions est chaleureux et curieux (comme une amie qui s'intéresse vraiment)
- Chaque question a un placeholder qui donne un mini-exemple de réponse pour inspirer
- Les questions doivent être ORIENTÉES vers l'objectif : si l'objectif est "vente", demande des témoignages, des résultats, des transformations. Si c'est "engagement", demande des anecdotes, des émotions, des situations vécues.

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
      const answersBlock = answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n");
      const followUpBlock = followUpAnswers?.length
        ? "\n\nQUESTIONS D'APPROFONDISSEMENT :\n" + followUpAnswers.map((a: any, i: number) => `Q${i + 1} : "${a.question}" → "${a.answer}"`).join("\n")
        : "";

      // Determine target format for depth instructions
      // Priority: angle.format_livraison > contentType > canal detection
      const angleFormat = angle?.format_livraison?.toLowerCase() || "";
      const formatHint = angleFormat || contentType?.toLowerCase() || "";
      const isCarousel = formatHint.includes("carrousel") || formatHint.includes("carousel");
      const isReel = formatHint.includes("reel") || formatHint.includes("script");
      const isStories = formatHint.includes("stories") || formatHint.includes("story");
      const isLinkedIn = formatHint.includes("linkedin") || contentType === "post_linkedin";
      const isNewsletter = formatHint.includes("newsletter") || formatHint.includes("email") || contentType === "post_newsletter";
      const isCaption = !isCarousel && !isReel && !isStories && !isLinkedIn && !isNewsletter;

      // Build format-specific depth instructions
      let depthMandate = "";
      if (isCarousel) {
        depthMandate = `FORMAT : CARROUSEL INSTAGRAM (8 slides minimum)

PROFONDEUR PAR SLIDE :
- Chaque slide DÉVELOPPE son point. Une slide = 1 idée COMPLÈTE, pas un titre.
- Slide 1 (hook) : courte et percutante, max 12 mots.
- Slides 2-7 : chacune DOIT contenir 2-4 phrases qui développent le point. Pas juste un header et une ligne.
- Au moins 2 slides doivent contenir un EXEMPLE CONCRET, un CHIFFRE, ou une ANECDOTE. Pas que de la théorie.
- Slide finale : punchline mémorable + CTA.
- TOTAL : le carrousel complet fait 1500-3000 caractères de contenu textuel (slides + caption).

SLIDE DE PROFONDEUR (obligatoire) :
Au moins 1 slide doit être un "zoom" : tu prends UN point et tu le creuses en profondeur avec un exemple terrain, un cas réel, ou une analyse fine. C'est cette slide qui fait la différence entre un carrousel "tips génériques" et un carrousel "elle sait de quoi elle parle".

Formate le contenu avec des marqueurs clairs :
📌 SLIDE 1 : [contenu]
📌 SLIDE 2 : [contenu]
etc.
Après les slides, ajoute :
📝 CAPTION : [hook différent de slide 1 + corps + CTA + hashtags]`;
      } else if (isReel) {
        depthMandate = `FORMAT : SCRIPT REEL (30-60 secondes)

Le reel n'est pas un résumé de carrousel. C'est UNE idée percutante, développée à l'oral.

PROFONDEUR :
- Hook (0-3s) : la phrase qui fait arrêter le scroll. Texte à l'écran + ce que tu dis.
- Corps (3-45s) : développe l'idée avec des EXEMPLES CONCRETS. Pas de généralités. Raconte une scène, cite un chiffre, décris une situation.
- Chaque section doit avoir assez de matière pour être dite à voix haute, pas juste des bullet points.
- Indique les CUTS visuels et le texte à l'écran pour chaque section.
- CTA (45-60s) : fermeture avec invitation au dialogue.
- TOTAL : le script fait 150-300 mots (le rythme parlé = ~150 mots/minute).`;
      } else if (isStories) {
        depthMandate = `FORMAT : SÉQUENCE STORIES (5-7 stories)

Les stories sont le format le plus INTIME. Comme un message vocal à une amie.

PROFONDEUR :
- Story 1 : amorce qui donne envie de taper pour voir la suite. Pas de contexte, direct dans le vif.
- Stories 2-4 : développement avec ton naturel, confidentiel. Chaque story = 1 écran, 2-4 lignes MAX + indication visuelle.
- Story 4 ou 5 : INTERACTION obligatoire (sondage, question, quiz). Pas un sondage générique : un sondage qui révèle quelque chose.
- Story finale : conclusion + CTA.
- Pour chaque story, indique : le TEXTE affiché + le TYPE (texte seul, photo+texte, vidéo, sondage, quiz).`;
      } else if (isLinkedIn) {
        depthMandate = `FORMAT : POST LINKEDIN (1300-2000 caractères)

LinkedIn = profondeur analytique. Tu ne vulgarises pas : tu analyses.

PROFONDEUR :
- Accroche dans les 210 premiers caractères (zone visible avant "voir plus"). Accroche FORTE.
- Corps : développe en paragraphes courts (2-3 phrases). Utilise des données, des retours d'expérience concrets, des comparaisons.
- Au moins 1 EXEMPLE CONCRET (un cas client anonymisé, une situation terrain, un chiffre) dans le corps.
- Ton expert mais humain. 1ère personne. Pas de liste à puces sauf si nécessaire.
- CTA : question ouverte ou invitation pro. 0-2 hashtags en fin.
- TOTAL : vise 1500+ caractères. Un LinkedIn de 800 caractères, c'est une occasion ratée.`;
      } else if (isNewsletter) {
        depthMandate = `FORMAT : NEWSLETTER / EMAIL (1500-3000 caractères)

La newsletter est le format qui a le PLUS de place pour la profondeur.

PROFONDEUR :
- Objet d'email : accrocheur, max 50 caractères, pas clickbait.
- Intro : hook personnel, anecdote ou question. 2-3 phrases.
- Corps : développe l'idée en profondeur. Apartés en italique, exemples concrets, nuances. C'est le format France Culture de ta com.
- Au moins 2 exemples concrets ou anecdotes dans le corps.
- Conclusion : leçon ou ouverture (pas de résumé).
- CTA : doux, en lien avec le sujet.
- TOTAL : vise 2000+ caractères minimum.`;
      } else {
        depthMandate = `FORMAT : CAPTION INSTAGRAM (800-1500 caractères)

PROFONDEUR :
- Les 125 premiers caractères : hook (la phrase qui fait cliquer "voir plus"). C'est la phrase la plus importante.
- Corps : développe UNE idée en profondeur. Pas 3 idées survolées : 1 idée CREUSÉE.
- Au moins 1 exemple concret, 1 anecdote, ou 1 chiffre dans le corps.
- Apartés entre parenthèses *(comme ça)*, bucket brigades naturelles.
- Fin : ouverture (question ou invitation), pas un résumé.
- TOTAL : vise 1000+ caractères. Arrête de te censurer sur la longueur.`;
      }

      systemPrompt = `${COMMON_PREFIX}

${ANTI_BIAS}

${CHAIN_OF_THOUGHT}

${FORMAT_STRUCTURES}

${EDITORIAL_ANGLES_REFERENCE}

${WRITING_RESOURCES}

${angle ? `ANGLE CHOISI :
- Titre : ${angle.title}
- Structure : ${(angle.structure || []).join(" → ")}
- Ton : ${angle.tone}` : "Pas d'angle spécifique choisi. Choisis le meilleur angle pour le sujet."}

CANAL : ${contentType || "Post Instagram"}
${editorialFormatLabel ? `FORMAT ÉDITORIAL : ${editorialFormatLabel}` : ""}
${angle?.format_livraison ? `FORMAT DE LIVRAISON : ${angle.format_livraison}` : ""}

${depthMandate}

RÉPONSES DE L'UTILISATRICE :
${answersBlock}
${followUpBlock}
${calendarBlock}${objectiveBlock}
${preGenBlock}

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

Réponds UNIQUEMENT en JSON :
{
  "content": "...",
  "accroche": "...",
  "format": "...",
  "pillar": "...",
  "objectif": "..."
}`;
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
- LinkedIn : prend l'angle le plus ANALYTIQUE. Données, contexte pro, retour d'expérience structuré. Ton plus expert, 1ère personne.
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
- LinkedIn : 800-2000 caractères. Paragraphes courts. Accroche dans les 210 premiers caractères. 0-2 hashtags en fin.
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
      const { checkQuota, logUsage } = await import("../_shared/plan-limiter.ts");
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
          "anthropic-version": "2025-01-01",
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
    } else {
      rawContent = await callAnthropicSimple(getModelForAction("content"), systemPrompt, userPrompt!, 0.85);
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

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("creative-flow error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
