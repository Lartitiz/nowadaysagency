// Assemblage du contexte de marque de creative-flow pour une requête :
// actualité, branding, vocabulaire métier, voix, éléments personnels,
// COMMON_PREFIX (préfixe de TOUS les prompts), QUESTIONS_PREFIX, calendrier et
// objectif. Déplacé À L'IDENTIQUE depuis le handler d'index.ts (fiche 3, lot D,
// 14/10/2026) : garder l'ordre exact des concaténations, COMMON_PREFIX entre
// dans tous les prompts et dans le cache Anthropic. Aucune lecture en base ici :
// getUserContext et l'historique des briefs restent dans le handler, cette
// fonction ne reçoit que `ctx`. Figé par handler_contract_test.ts et
// handler_contract_more_test.ts (marque remplie). Voir docs/creation-contenu/CARTE.md.

import { CONTENT_CLARITY_RULES } from "../_shared/content-clarity.ts";
import { CORE_PRINCIPLES, ANTI_SLOP, EMBEDDED_EDUCATION } from "../_shared/copywriting-prompts.ts";
import { BASE_SYSTEM_RULES } from "../_shared/base-prompts.ts";
import { formatContextForAI, CONTEXT_PRESETS, buildProfileBlock, buildPreGenFallback, buildBrandGuardText, type getUserContext } from "../_shared/user-context.ts";
import { parseAudienceAddress } from "../_shared/audience-address.ts";
import { livedCaseFromCreativeBody } from "../_shared/lived-case.ts";

export function buildRequestContext(params: {
  body: any;
  ctx: Awaited<ReturnType<typeof getUserContext>>;
  step: string;
}) {
  const { body, ctx, step } = params;
  const { profile, preGenAnswers, calendarContext, objective, news_context: newsContext } = body;

  // Reusable newsjacking block — injected into prompts when present.
  // Kept separate from `context` to avoid blowing the 8000-char cap on subjects.
  const newsContextBlock = (typeof newsContext === "string" && newsContext.trim().length > 0)
    ? `\n\n══════════════════════════════════════\nCONTEXTE ACTUALITÉ (NEWSJACKING)\n══════════════════════════════════════\n${newsContext.trim()}\n\nCONSIGNE NEWSJACKING : ce contenu rebondit sur cette actualité. Le HOOK / ACCROCHE doit partir de l'actualité elle-même (c'est elle qui capte l'attention car elle est dans l'air du temps). Ensuite seulement, fais le pont vers l'expertise, le vécu ou le positionnement de l'utilisatrice. L'actu n'est pas un prétexte en arrière-plan : c'est le point d'entrée visible du contenu.\n\nRÈGLE SPECTATEUR ZÉRO CONTEXTE (obligatoire) : pars du principe que la personne qui regarde ou lit n'a PAS suivi cette actualité. Juste après le hook, RACONTE les faits en 1-2 phrases simples et concrètes (qui a fait quoi, où, quand) avant toute opinion ou analyse. INTERDIT de désigner l'actu par allusion (« cette histoire de… », « cette affaire », « ce qui se passe en ce moment ») tant que les faits n'ont pas été racontés dans le contenu lui-même. Test décisif : quelqu'un qui n'a lu aucun article sur le sujet doit comprendre de quoi on parle dès les 10 premières secondes d'un reel, la slide 2 d'un carrousel, ou les 2 premières phrases d'un post.\n`
    : "";

  const profileBlock = profile ? buildProfileBlock(profile) : "";
  // « Ton cas d'abord » (04/10/2026) : quand la personne a donné son propre cas,
  // son histoire de marque n'est pas jointe à la rédaction (elle racontait le
  // parcours de la marque à la place du récit fourni).
  const caseForStory = livedCaseFromCreativeBody(body);
  const ownCaseGeneration = step === "generate" && (caseForStory.provided || caseForStory.mode === "news_feeling");
  const brandingContext = formatContextForAI(ctx, ownCaseGeneration ? { ...CONTEXT_PRESETS.content, includeStory: false } : CONTEXT_PRESETS.content);
  // Champs de marque bruts (combat, mission, ton…) : le redac-gate s'en sert
  // pour détecter une recopie quasi mot pour mot (audit slop 18/08). Aucune
  // requête supplémentaire — ctx.tone est déjà fetché par getUserContext().
  const brandGuardText = buildBrandGuardText(ctx);
  // Tu ou vous réglé dans la fiche de marque (null = pas de réglage : rien ne change).
  const audienceAddress = parseAudienceAddress(ctx?.tone?.tone_register);

  // Extract vocabulary keywords from branding (offers names, target name, key expressions)
  // → forces the AI to use the user's actual vocabulary in questions
  const brandVocab: string[] = [];
  if (ctx?.profile?.activite) brandVocab.push(`activité: ${ctx.profile.activite}`);
  if (ctx?.profile?.cible) brandVocab.push(`cible: ${ctx.profile.cible}`);
  if (ctx?.tone?.key_expressions) {
    const keyExp = typeof ctx.tone.key_expressions === "string" ? ctx.tone.key_expressions : "";
    if (keyExp) brandVocab.push(`expressions clés: ${keyExp.slice(0, 200)}`);
  }
  // ctx.tone = ligne brand_profile (dont `offer`), fallback profiles.offre — même priorité que formatContextForAI
  const offerDesc = typeof ctx?.tone?.offer === "string" && ctx.tone.offer
    ? ctx.tone.offer
    : (typeof ctx?.profile?.offre === "string" ? ctx.profile.offre : "");
  if (offerDesc) brandVocab.push(`offre: ${offerDesc.slice(0, 150)}`);
  const offerNames = (Array.isArray(ctx?.offers) ? ctx.offers : []).map((o: { name?: string }) => o?.name).filter(Boolean);
  if (offerNames.length > 0) brandVocab.push(`noms des offres: ${offerNames.slice(0, 4).join(", ")}`);
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
  let effectivePreGen = preGenAnswers ?? body.pre_gen_answers;
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
    if (effectivePreGen.conviction) pl.push(fromBranding
      ? `- Conviction issue du branding (repère de fond seulement si pertinent pour CE sujet, à reformuler ; présence non obligatoire) : "${effectivePreGen.conviction}"`
      : `- Conviction/phrase clé fournie pour CE contenu (conserve son sens et ses mots lorsqu’ils fonctionnent, sans insertion forcée) : "${effectivePreGen.conviction}"`);
    if (pl.length) {
      preGenBlock = `\nL'UTILISATRICE A PARTAGÉ CES ÉLÉMENTS PERSONNELS :\n${pl.join("\n")}\n\nINTÈGRE CES ÉLÉMENTS dans le contenu généré :\n- L'anecdote doit apparaître naturellement (en accroche ou en illustration)\n- L'émotion visée guide le ton et la structure\n- La conviction éclaire le propos si elle est pertinente ; ne récite pas une conviction de marque sans lien avec le sujet\n- Ne change PAS le sens de ce qu'elle a dit, juste la structure\n`;
    }
  }
  if (!effectivePreGen && step === "generate") {
    // Le conseil d'incarnation vit dans un CHAMP dédié (personal_tip), jamais
    // dans le contenu : dans content il partait tel quel dans un copier-coller
    // ou une publication (vu à l'audit rédactionnel du 10/07).
    preGenBlock = `\nL'utilisatrice n'a pas fourni d'éléments personnels.\nGénère le contenu normalement. INTERDIT d'écrire un conseil, une note de coaching ou une mention de l'IA DANS le contenu lui-même.\nRenvoie À LA PLACE, dans le champ JSON "personal_tip" prévu par le format de réponse, exactement : "💡 Ajoute une anecdote perso pour que ça sonne vraiment toi. L'IA structure, toi tu incarnes."\n`;
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
  const COMMON_PREFIX = CONTENT_CLARITY_RULES + "\n\n" + BASE_SYSTEM_RULES + "\n\n" + incarnationBlock + "\n\n" + `Si une section VOIX PERSONNELLE est présente dans le contexte, c'est ta PRIORITÉ ABSOLUE :\n- Reproduis fidèlement le style décrit\n- Réutilise les expressions signature naturellement dans le texte\n- RESPECTE les expressions interdites : ne les utilise JAMAIS\n- Imite les patterns de ton et de structure\n- Le contenu doit sonner comme s'il avait été écrit par l'utilisatrice elle-même, pas par une IA\n\n` + CORE_PRINCIPLES + "\n\n" + EMBEDDED_EDUCATION + "\n\n" + ANTI_SLOP + "\n\n" + fullContext;

  // QUESTIONS_PREFIX : version allégée pour les steps `questions` et `follow-up`.
  // On retire CORE_PRINCIPLES / EMBEDDED_EDUCATION / ANTI_SLOP / bloc voix :
  // ces règles concernent la RÉDACTION du contenu final, pas la formulation de questions.
  // On garde : règles de base, incarnation (qui elle est), branding/profil (pour personnaliser).
  // Objectif : passer de ~10 500 tokens à ~3 000-4 000 tokens d'input.
  const QUESTIONS_PREFIX = BASE_SYSTEM_RULES + "\n\n" + incarnationBlock + "\n\n" + fullContext;

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

  return { newsContextBlock, brandingContext, brandGuardText, audienceAddress, brandVocabBlock, preGenBlock, fullContext, activity, COMMON_PREFIX, QUESTIONS_PREFIX, calendarBlock, effectiveObjective, objectiveBlock };
}
