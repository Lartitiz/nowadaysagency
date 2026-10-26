// Post LinkedIn (creative-flow) : brief fictif factuel, génération en deux
// temps (diffusée), photo, passe de correction. Extrait À L'IDENTIQUE
// d'index.ts au lot 3 (13/10/2026). Modifier LinkedIn = modifier CE fichier ;
// les briques communes à tous les formats sont dans ../shared.ts.
// Voir docs/creation-contenu/CARTE.md.

import { structureLossReason } from "../../_shared/text-structure-guard.ts";
import { alignLinkedInHookFields } from "../../_shared/linkedin-hook.ts";
import { authoredContentSource, testimonySourceText } from "../../_shared/editorial-voice.ts";
import { CONTENT_CLARITY_RULES, claritySourceBlock } from "../../_shared/content-clarity.ts";
import { enforceAudienceAddress, type AudienceAddress } from "../../_shared/audience-address.ts";
import { applyAudienceAddressPass } from "../../_shared/audience-address-pass.ts";
import { enforceAudienceAddressInFields, enforceAudienceAddressInJsonText } from "../../_shared/audience-address-fields.ts";
import { logUsage } from "../../_shared/plan-limiter.ts";
import { tryParseAiJson, tryParseAiObject } from "../../_shared/parse-ai-json.ts";
import { callAnthropicSimple, type UsageSink, type AnthropicModel, HAIKU_MODEL } from "../../_shared/anthropic.ts";
import { streamAnthropicSSE, createClientSSEStream, clientStillThere, type StatusEmitter } from "../../_shared/anthropic-stream.ts";
import { buildVisionGenerateBrief } from "../../_shared/vision-prompts.ts";
import { analyzeTextRedac, buildTextFixInstructions, enforceNoInventedTestimonials, enforceResearchNumberSources, fixElisionsInFields, runTextRedacGate, textRedacRawCount, textRedacViolations, hookEchoesBefore } from "../../_shared/redac-gate.ts";
import { logContentQuality } from "../../_shared/content-quality.ts";
import { CORRECTION_ABORT_MS, GENERATE_ABORT_MS, POST_ADDRESS_FIELDS, addrOpts, extractImagePayload, gateNumbers, photoVoiceRule } from "../shared.ts";

export function isExplicitlyFictionalBrief(context: string): boolean {
  return /(?:^|[^\p{L}])(?:fictif|fictive|fictifs|fictives|imaginaire|imaginaires|inventé|inventée|inventés|inventées)(?=$|[^\p{L}])/iu.test(context);
}

export function isFactualFictionalLinkedInBrief(context: string): boolean {
  return isExplicitlyFictionalBrief(context) && /(?:seuls? faits?|faits? du brief|factuel|uniquement.{0,25}faits?|n['’]ajoute|ne lui attribue|sans inventer)/i.test(context);
}

export function alignFactualLinkedInHook(parsed: { content: string; accroche?: string; format?: string }) {
  // L'aperçu joint accroche + corps. Une accroche reformulée par le modèle
  // ne peut pas être retirée du corps et s'affiche alors deux fois.
  const firstLine = parsed.content.trimStart().split("\n")[0].trim();
  parsed.accroche = firstLine.length <= 210 ? firstLine : "";
  parsed.format = "linkedin";
  return parsed;
}

// Les modèles ont continué à demander un souvenir ou une motivation personnelle
// malgré les consignes. Pour une source fictive sans photo, ces trois précisions
// facultatives évitent de mélanger la fiche de l'exemple au profil réel.
export function buildFictionalLinkedInQuestions() {
  return {
    questions: [
      {
        question: "Y a-t-il une précision à ajouter à cet exemple fictif, ou le brief contient-il déjà tout ce qu'il faut ?",
        placeholder: "Par exemple : Rien à ajouter, garde uniquement les faits du brief.",
      },
      {
        question: "Quel fait du brief veux-tu placer en premier dans le post LinkedIn ?",
        placeholder: "Par exemple : Le fait que je veux mettre en avant, avec les mots exacts du brief.",
      },
      {
        question: "Quelle formulation veux-tu pour signaler que cet exemple est fictif ?",
        placeholder: "Par exemple : « Exemple fictif » dès la première phrase.",
      },
    ],
  };
}

// Pour TOUT post LinkedIn généré (photo ou texte), on rejoue une 2ᵉ passe
// spécialisée qui chasse cascades, anaphores, formules manufacturées, CTA génériques.
// En photo_mode, on SKIP la 2ᵉ passe pour éviter le double appel Anthropic
// (vision déjà coûteuse en wall-time). Les règles anti-broetry sont déjà
// injectées AVANT les images dans le prompt photo LinkedIn (lignes 1272+).
/** Renvoie les échos d'accroche AVANT correction (undefined = garde non armée ou passe échouée). */
export async function applyLinkedInCorrectionPass(parsed: any, params: { body: any; fullContext: string; researchSource?: string; brandGuardText?: string; echoSubject?: string; previousHooks?: string[] }): Promise<number | undefined> {
  const { body, fullContext, brandGuardText, researchSource } = params;
  let echoesBefore: number | undefined;
  try {
    // Gate rédactionnel (lots 3+4) : mesures en code injectées dans la
    // passe de correction existante — retournements (1 max), formules
    // moulées, chiffres sans source (liste blanche = brief + réponses + actu).
    const { allowed: liAllowed, research } = gateNumbers([
      typeof body.context === "string" ? body.context : "",
      body.answers ? JSON.stringify(body.answers) : "",
      typeof body.news_context === "string" ? body.news_context : "",
      fullContext || "",
    ], researchSource);
    // runTextRedacGate = mesure → correction → RE-mesure → garde anti-régression
    // (la correction n'est gardée que si elle ne dégrade aucun compteur mesuré,
    // cf. échantillon live 18/08 : Haiku introduisait des retournements).
    const gate = await runTextRedacGate(parsed.content, {
      format: "linkedin",
      correction: {
        logger: (msg) => console.log(msg),
        authoredText: authoredContentSource(body),
        sourceContext: [authoredContentSource(body), fullContext, researchSource].filter(Boolean).join("\n"),
        // Édition mécanique à règles fermées → Haiku (cf. #364)
        model: HAIKU_MODEL,
        abortTimeoutMs: CORRECTION_ABORT_MS,
      },
      allowedNumbers: liAllowed,
      research,
      brandGuardText,
      echo: { previousHooks: params.previousHooks, subject: params.echoSubject },
      testimonySource: testimonySourceText(body),
    });
    parsed.content = gate.content;
    echoesBefore = gate.hookEchoesBefore;
  } catch (corrErr) {
    console.error("[creative-flow] correction-pass linkedin failed:", corrErr);
  }
  // Filet déterministe (hors try : s'applique même si la passe a échoué) :
  // élisions manquantes type « le avant/après » (vécu 21/07).
  fixElisionsInFields(parsed, ["content", "accroche"]);
  return echoesBefore;
}

// ── LinkedIn + photos : streaming vision (évite la coupure de socket
//    pendant la latence vision). On émet immédiatement les tokens dès
//    qu'Anthropic les renvoie : la socket reste vivante.
export function streamLinkedInPhotoVision(params: {
  apiKey: string;
  model: AnthropicModel;
  systemPrompt: string;
  body: any;
  contentType?: string | null;
  answers?: any[];
  context?: string | null;
  corsHeaders: Record<string, string>;
  userId: string;
  workspace_id?: string | null | undefined;
  /** Tu ou vous de la fiche de marque (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
}): Response {
  const { apiKey, model, systemPrompt, body, contentType, answers, context, corsHeaders, userId } = params;
  const workspace_id = params.workspace_id ?? undefined;
  const validPhotos = body.photos!.filter((p: any) => p?.base64).slice(0, 10);
  const isBeforeAfter = validPhotos.length === 2;
  const isSeries = validPhotos.length >= 3;
  const { formatBrief, jsonShape } = buildVisionGenerateBrief(contentType);

  const photoContent: any[] = [];
  photoContent.push({
    type: "text",
    text: `══ RÈGLES CRITIQUES À LIRE AVANT DE REGARDER LES IMAGES ══

1. ANTI-PARAPHRASE VISUELLE : tu n'as PAS le droit d'écrire "Ce [adjectif] [objet], c'est…" pour désigner ce que tu vois.
2. ANTI-CASCADE : pas de rafale de phrases courtes pour faire "punchy". Une seule pensée qui se déroule.
3. ANTI-CTA FABRIQUÉ : pas de slogan-invitation en italique ou guillemets.
4. CHIFFRES / NUMÉROS / DATES / NOMS VISIBLES : recopie EXACTEMENT.
5. VOIX : ${photoVoiceRule(params.audienceAddress, "respecte la personne grammaticale et le registre de cette marque. Si elle écrit au « je », garde ses mots ; n'impose ni « tu » ni « vous ».")}

══ MAINTENANT, REGARDE LES IMAGES ══
`,
  });
  validPhotos.forEach((p: any, idx: number) => {
    const { media_type, data } = extractImagePayload(String(p.base64), p.mimeType);
    photoContent.push({
      type: "image",
      source: { type: "base64", media_type, data },
    });
    const ctx = p.context?.trim();
    if (isBeforeAfter) {
      const label = idx === 0 ? "↑ AVANT" : "↑ APRÈS";
      photoContent.push({ type: "text", text: ctx ? `${label} — contexte : "${ctx}"` : label });
    } else if (ctx) {
      photoContent.push({ type: "text", text: `↑ Contexte sur l'image ci-dessus : "${ctx}"` });
    }
  });
  const modeInstr = isBeforeAfter
    ? `\n\n🔄 MODE AVANT / APRÈS : raconte le changement réel comme un fil unique, sans créer de déclic ni de résultat absent du brief.`
    : isSeries
    ? `\n\n📸 MODE SÉRIE (${validPhotos.length} images) : trouve le fil thématique commun. NE liste/NE numérote PAS.`
    : "";
  const answersBlockPhoto = (answers && Array.isArray(answers) && answers.length > 0)
    ? answers.map((a: any, i: number) => `Q${i + 1} : "${a.question}"\n→ "${a.answer}"`).join("\n\n")
    : "";
  const userSubjectBlock = (context && String(context).trim())
    ? `══ SUJET DÉCLARÉ PAR L'UTILISATRICE (PRIORITÉ ABSOLUE) ══\n"${String(context).trim()}"\n\nC'est CE sujet que le post doit traiter. Les photos ILLUSTRENT, elles ne dictent PAS l'angle.\n\n`
    : "";
  photoContent.push({
    type: "text",
    text: `${userSubjectBlock}${formatBrief}${body.photo_description ? `\nDescription complémentaire : "${body.photo_description}"` : ""}${answersBlockPhoto ? `\n\n══ RÉPONSES DE L'UTILISATRICE ══\n${answersBlockPhoto}` : ""}${modeInstr}\n\nRègle anti-fabrication : n'invente AUCUN détail non vérifiable. Si la matière manque, bascule sur registre RÉFLEXIF/MÉTA ancré sur LE SUJET DÉCLARÉ.\n\nRéponds UNIQUEMENT en JSON :\n${jsonShape}`,
  });

  return createClientSSEStream(
    () => streamAnthropicSSE(
      apiKey,
      model,
      systemPrompt,
      [{ role: "user", content: photoContent }],
      0.7,
      4096,
      60_000,
    ),
    corsHeaders,
    async (full, usage) => {
      await logUsage(userId, "content", "creative_flow", usage?.total_tokens, usage?.model, workspace_id);
      // Tu ou vous : contrôlé APRÈS le flux (le texte déjà affiché n'est pas
      // rejoué, seule la valeur finale `done` change), comme les autres passes.
      return await enforceAudienceAddressInJsonText(full, POST_ADDRESS_FIELDS, params.audienceAddress, addrOpts("linkedin-photo-stream"));
    },
  );
}

// LinkedIn (texte) : pas de streaming de texte (la correction doit relire
// le post complet), mais un SSE heartbeat + étapes réelles (writing →
// correcting) pour que le front affiche la vraie avancée au lieu d'une
// barre simulée — même pattern que carousel-ai. Le client streaming
// consomme déjà l'event final `done.full`.
export async function runLinkedInTwoStep(params: {
  model: AnthropicModel;
  systemPrompt: string;
  userPrompt: string;
  corsHeaders: Record<string, string>;
  userId: string;
  workspace_id?: string | null | undefined;
  body: any;
  fullContext: string;
  /** Matière de la recherche « creuser le sujet » : ses faits sourcés sont des sources. */
  researchSource?: string;
  /** Tu ou vous de la fiche de marque : contrôlé par le code après rédaction (04/10/2026). */
  audienceAddress?: AudienceAddress | null;
  /** Sujet + accroches déjà écrites dessus : garde anti-redite (#915), absente de ce chemin jusqu'au 08/10/2026. */
  echoSubject?: string;
  previousHooks?: string[];
}, emitStatus: StatusEmitter = () => {}): Promise<Response> {
  const { model, systemPrompt, userPrompt, corsHeaders, userId, body, fullContext } = params;
  const researchSource = params.researchSource || "";
  const workspace_id = params.workspace_id ?? undefined;
  if (isFactualFictionalLinkedInBrief(String(body.context || ""))) {
    const usage: UsageSink = {};
    emitStatus("writing");
    const raw = await callAnthropicSimple(model, systemPrompt, userPrompt, 0.2, 1200, usage, GENERATE_ABORT_MS);
    const parsed = tryParseAiJson<any>(raw, "creative-flow:generate:factual-fictional-linkedin");
    if (typeof parsed?.content !== "string" || !parsed.content.trim()) {
      throw new Error("Post LinkedIn fictif vide ou illisible");
    }
    await enforceAudienceAddressInFields(parsed, ["content"], params.audienceAddress, addrOpts("linkedin-fictif"));
    alignFactualLinkedInHook(parsed);
    if (clientStillThere(emitStatus, "linkedin")) await logUsage(userId, "content", "creative_flow", usage.total_tokens, usage.model, workspace_id);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  console.log("[CORRECTION DEBUG] LinkedIn correction pass STARTED");
  const genLkUsage: UsageSink = {};
  const corrLkUsage: UsageSink = {};
  emitStatus("writing");
  const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.85, 4096, genLkUsage, GENERATE_ABORT_MS);
  console.log("[CORRECTION DEBUG] First call done, rawContent length:", rawContent?.length);

  // Parse the raw content to extract the post text
  // Lecture tolérante (retours à la ligne bruts, prose autour) : sinon le JSON
  // brut devenait le texte du post (relu, corrigé et affiché tel quel).
  const rawParsed = tryParseAiObject(rawContent, "creative-flow:linkedin");
  const postText: string = rawParsed?.content || rawParsed?.full_text || rawContent;

  // Gate rédactionnel (même patron que applyLinkedInCorrectionPass /
  // runNewsletterTwoStep) : mesures en code injectées dans la passe de
  // correction déjà présente ci-dessous — retournements, formules moulées,
  // chiffres sans source (liste blanche = brief + réponses + actu + branding).
  // Ce chemin streamé (celui réellement utilisé en prod, cf. audit slop
  // 18/08 constat 2) en était totalement dépourvu.
  // Chiffres de la recherche : autorisés seulement avec leur source dans la phrase.
  const { allowed: liAllowed, research: liResearch } = gateNumbers([
    typeof body.context === "string" ? body.context : "",
    body.answers ? JSON.stringify(body.answers) : "",
    typeof body.news_context === "string" ? body.news_context : "",
    fullContext || "",
  ], researchSource);
  // Témoignages : seuls le brief, les réponses et l'actu peuvent fournir une parole rapportée.
  const liTestimonySource = testimonySourceText(body);
  const liEcho = { previousHooks: params.previousHooks, subject: params.echoSubject };
  const liAnalyze = (t: string) => analyzeTextRedac(t, liAllowed, undefined, liEcho, liResearch, liTestimonySource);
  const liRedac = liAnalyze(postText);
  // Télémétrie (content_quality_events) : ce chemin, celui des posts LinkedIn
  // réels, n'écrivait aucune ligne → invisible du bilan hebdo et des
  // accroches précédentes lues par la garde anti-redite.
  const logLinkedInQuality = async (content: unknown, repassed: boolean) => {
    if (typeof content !== "string" || !content.trim()) return;
    try {
      const violations = textRedacViolations(liAnalyze(content));
      await logContentQuality(
        userId,
        "linkedin",
        { score: Math.max(40, 100 - 10 * violations), violations, repassed, content: JSON.stringify({ content }), hookEchoesBefore: hookEchoesBefore(liRedac, liEcho) },
        genLkUsage.model,
        workspace_id,
        params.echoSubject,
      );
    } catch (e) {
      console.error("[creative-flow] log qualité linkedin ignoré (génération intacte):", (e as any)?.message || e);
    }
  };
  const liExtraInstructions = buildTextFixInstructions(liRedac);
  console.log(`[linkedin-gate] recherche=${researchSource ? "oui" : "non"}, chiffres de recherche sans source ${liRedac.unsourcedResearchNumbers?.length ?? 0}, chiffres inventés ${liRedac.fabricatedNumbers.length}, témoignages inventés ${liRedac.inventedTestimonials?.length ?? 0}, vécus inventés ${liRedac.inventedExperiences?.length ?? 0}, échos d'accroche ${liRedac.hookEchoes.length}`);

  // Step 2: Correction pass — short, focused prompt
  const correctionPrompt = `Tu es un éditeur LinkedIn exigeant. Tu reçois un post et tu corriges uniquement les défauts identifiés. Préserve les passages déjà naturels, les formulations personnelles et les nuances.

══ TEST FONDAMENTAL (à appliquer AVANT toute correction) ══

Lis le post à voix haute mentalement. Identifie les passages répétitifs, artificiels ou infidèles aux sources. Corrige ces passages uniquement ; si aucun défaut précis n'est établi, préserve le texte. Le registre, les formulations réussies et les nuances de la personne restent prioritaires.

══ CORRECTIONS OBLIGATOIRES — APPLIQUE TOUTES CELLES QUI S'APPLIQUENT ══

1. PHRASES COURTES CONSÉCUTIVES (compte-les) :
   → COMPTE les phrases consécutives de moins de 10 mots.
   → Fusionne seulement une rafale artificielle qui gêne la lecture ; deux phrases courtes utiles peuvent rester.
   → Une phrase courte isolée peut rester si elle sert le propos et la voix.
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
   → Si tu vois UNE de ces expressions OU UNE expression du même registre → réécris avec des mots précis, dans le registre de la personne.
   ❌ "Le message était noyé dans l'esthétique." → ✅ "Le message était invisible derrière le visuel."
   ❌ "transformer notre manière de consommer, de créer et de vivre" → ✅ "changer comment on consomme, comment on crée : et même comment on vit"

4. RAFALES "PAS X. PAS Y. C'EST Z." :
   → Cette structure parallèle est un marqueur IA.
   → Réécris en prose continue.
   ❌ "C'est pas sexy. C'est pas instagrammable. Ça ressemble à du travail de fond."
   → ✅ "C'est pas sexy ni instagrammable, ça ressemble plus à du travail de fond ingrat."

4bis. RETOURNEMENT PAR NÉGATION ("Ce n'est pas X. C'est Y", "Pas X. Juste Y") :
   → Corrige chaque effet préfabriqué ajouté par le modèle dès la première occurrence ; conserve les négations factuelles et les verbatims demandés.
   → Et surtout : n'en INTRODUIS JAMAIS un nouveau en réécrivant. "Réécrire en plus brut"
     ne veut PAS dire "réécrire en négation-puis-affirmation" — c'est le moule IA n°1.

5. ANAPHORES (3+ phrases qui démarrent pareil) :
   → Compte les débuts de phrase. Si 3+ commencent par le même mot/groupe : RÉÉCRIS.
   ❌ "Par dire les choses. Par ne pas forcer. Par être direct·e."
   → ✅ "En disant les choses sans forcer personne à deviner. En étant direct·e."
   ❌ "Je parle de visibilité. Je parle du droit. Je parle de réhabiliter."
   → ✅ "Je parle de visibilité, du droit de prendre sa place, de réhabiliter la communication."

6. EMPILEMENT INSPIRATIONNEL (2+ phrases-valeurs sans exemple concret) :
   → Si 2 phrases consécutives expriment des valeurs abstraites sans fait : utilise un fait déjà fourni, ou coupe la redite. N’invente pas d’exemple.

7. ACCROCHE PROMESSE/SLOGAN :
   → Si l'accroche promet quelque chose ("X n'aura plus de secrets", "Voici comment...", "5 erreurs à éviter") : remplace par un fait concret ou un vécu FOURNIS par les sources, sinon par la position de l'autrice dite franchement. Jamais une scène, une rencontre ou une parole rapportée (« une cliente me disait… ») absente des sources.

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
    → Préserve la matière utile ; coupe les redites. N'allonge pas un post pour atteindre une cible de caractères.

══ RÈGLES ABSOLUES ══

- Garde le SENS et la CONVICTION du post. Tu corriges la FORME, pas le FOND.
- Garde la prise de position assumée et les émotions courantes nommées. N'ajoute ni précaution (« sans garantie », « je n'affirme rien »), ni devoir final adressé au lecteur.
- N'invente pas de nouveaux faits. Garde les détails concrets de l'original.
- La longueur du post corrigé suit la matière réellement disponible ; aucun remplissage.
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
  // Correction = édition mécanique à règles fermées → Haiku (~2x plus
  // rapide que Sonnet), même arbitrage que le carrousel (#364).
  emitStatus("correcting");
  const correctionUserMsg = liExtraInstructions
    ? `CORRECTIONS CIBLÉES À APPLIQUER EN PRIORITÉ (mesurées par code, non négociables) :\n${liExtraInstructions}\n\nVoici le post LinkedIn à corriger :\n\n"""\n${postText}\n"""`
    : `Voici le post LinkedIn à corriger :\n\n"""\n${postText}\n"""`;
  const correctedRaw = await callAnthropicSimple(
    HAIKU_MODEL,
    correctionPrompt + CONTENT_CLARITY_RULES,
    claritySourceBlock([body.news_context, body.context, JSON.stringify(body.answers || []), JSON.stringify(body.followUpAnswers || []), researchSource].filter(Boolean).join("\n")) + correctionUserMsg,
    0.3,
    4096,
    corrLkUsage,
    CORRECTION_ABORT_MS
  );
  console.log("[CORRECTION DEBUG] Correction call done, correctedRaw length:", correctedRaw?.length);

  // Parse corrected content, fallback to original if correction fails
  const finalResult: any = tryParseAiObject(correctedRaw, "creative-flow:linkedin-correction");

  // If correction succeeded, use it; otherwise fall back to original
  console.log("[CORRECTION DEBUG] finalResult.content present:", !!finalResult?.content);
  if (finalResult?.content) {
    const originalParsed: any = rawParsed ?? {};

    // Garde anti-régression (même politique que runTextRedacGate) : la
    // correction n'est gardée que si elle ne dégrade aucun compteur mesuré —
    // l'échantillon live du 18/08 a montré Haiku INTRODUISANT des retournements
    // dans des textes qui n'en avaient pas.
    const correctedWorse =
      textRedacRawCount(liAnalyze(finalResult.content)) >
      textRedacRawCount(liRedac);
    if (correctedWorse) {
      console.log("[CORRECTION DEBUG] correction rejetée (compteurs rédactionnels dégradés), post original conservé");
    }
    // Garde de structure par le CODE (règles d'écriture inchangées) : une
    // correction qui casse une liste voulue, sa numérotation ou les
    // paragraphes est rejetée entière (« dégrader la correction, pas le texte »).
    const structureLoss = postText ? structureLossReason(postText, finalResult.content) : null;
    if (structureLoss) {
      console.warn(`[structure-guard:linkedin] correction rejetée, texte d'avant conservé : ${structureLoss}`);
    }
    const keepOriginal = correctedWorse || !!structureLoss;
    const merged = {
      ...originalParsed,
      content: keepOriginal ? (postText || finalResult.content) : finalResult.content,
      accroche: keepOriginal ? originalParsed.accroche : (finalResult.accroche || originalParsed.accroche),
      format: originalParsed.format || "linkedin",
      pillar: originalParsed.pillar || "",
      objectif: originalParsed.objectif || "",
    };
    // Chiffres de la recherche encore sans source : passe dédiée, relue par le code.
    if (typeof merged.content === "string" && liResearch) {
      const sourced = await enforceResearchNumberSources(
        merged.content,
        liAnalyze,
        liResearch,
        { logger: (m) => console.log(m), abortTimeoutMs: CORRECTION_ABORT_MS },
      );
      merged.content = sourced.content;
    }
    // Témoignage inventé encore présent : passe dédiée, relue par le code.
    if (typeof merged.content === "string") {
      merged.content = (await enforceNoInventedTestimonials(merged.content, liAnalyze, {
        logger: (m) => console.log(m), abortTimeoutMs: CORRECTION_ABORT_MS,
      })).content;
    }
    // Tu ou vous réglé dans la fiche de marque : passe courte si le post le contredit.
    if (typeof merged.content === "string") {
      merged.content = (await enforceAudienceAddress(merged.content, params.audienceAddress, {
        pass: applyAudienceAddressPass, logger: (m) => console.log(m), abortTimeoutMs: CORRECTION_ABORT_MS,
      })).content;
    }
    // Filet déterministe (même patron que applyLinkedInCorrectionPass) :
    // élisions manquantes type « le avant/après » (vécu 21/07).
    fixElisionsInFields(merged, ["content", "accroche"]);
    // L'accroche est dérivée du début exact du post (jamais l'inverse).
    alignLinkedInHookFields(merged);

    await logLinkedInQuality(merged.content, !keepOriginal);
    if (clientStillThere(emitStatus, "linkedin")) await logUsage(userId, "content", "creative_flow", ((genLkUsage.total_tokens ?? 0) + (corrLkUsage.total_tokens ?? 0)) || undefined, genLkUsage.model, workspace_id);
    return new Response(JSON.stringify(merged), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[CORRECTION DEBUG] FALLBACK triggered — returning uncorrected post");
  // Fallback: return original if correction failed
  const fallbackParsed: any = rawParsed ? { ...rawParsed } : { content: rawContent };
  if (typeof fallbackParsed.content === "string" && liResearch) {
    fallbackParsed.content = (await enforceResearchNumberSources(
      fallbackParsed.content,
      liAnalyze,
      liResearch,
      { logger: (m) => console.log(m), abortTimeoutMs: CORRECTION_ABORT_MS },
    )).content;
  }
  if (typeof fallbackParsed.content === "string") {
    fallbackParsed.content = (await enforceNoInventedTestimonials(fallbackParsed.content, liAnalyze, {
      logger: (m) => console.log(m), abortTimeoutMs: CORRECTION_ABORT_MS,
    })).content;
  }
  if (typeof fallbackParsed.content === "string") {
    fallbackParsed.content = (await enforceAudienceAddress(fallbackParsed.content, params.audienceAddress, {
      pass: applyAudienceAddressPass, logger: (m) => console.log(m), abortTimeoutMs: CORRECTION_ABORT_MS,
    })).content;
  }
  // Filet déterministe même si la passe de correction a échoué : le texte
  // brut renvoyé peut encore porter des élisions non faites.
  fixElisionsInFields(fallbackParsed, ["content", "accroche"]);
  alignLinkedInHookFields(fallbackParsed);

  await logLinkedInQuality(fallbackParsed.content, false);
  if (clientStillThere(emitStatus, "linkedin")) await logUsage(userId, "content", "creative_flow", ((genLkUsage.total_tokens ?? 0) + (corrLkUsage.total_tokens ?? 0)) || undefined, genLkUsage.model, workspace_id);
  return new Response(JSON.stringify(fallbackParsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
