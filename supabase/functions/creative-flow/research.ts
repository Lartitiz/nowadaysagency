// Recherches de creative-flow qui ajoutent des faits au prompt : « creuser le
// sujet » (skipDepthResearch, creativeDepthBlock) et recherche web
// (runDeepResearchWebSearch, crédit deep_research seulement si elle réussit).
// Déplacées À L'IDENTIQUE depuis index.ts (fiche 3, lot B, 14/10/2026), qui
// les réexporte. Le checkQuota("deep_research") reste dans le handler, juste
// avant l'appel. Les tests remplacent _deps.fetchDepthMaterial : garder
// l'accès par _deps (ne pas le déstructurer). Voir docs/creation-contenu/CARTE.md.

import { getModelForAction, forcesDisabledThinking } from "../_shared/anthropic.ts";
import { buildDepthBlock } from "../_shared/depth-research.ts";
import { isSaleListing } from "../_shared/sale-listing.ts";
import { logUsage } from "../_shared/plan-limiter.ts";
import { _deps } from "./shared.ts";
import { livedCaseFromCreativeBody } from "../_shared/lived-case.ts";

/**
 * Recherche « creuser le sujet » pour posts, reels et stories (04/10/2026, même
 * logique que le carrousel depuis #1292) : mécanisme réel, lecture sociale et faits
 * sourcés qui étayent une position. L'actu ne donne que le déclencheur, les réponses
 * le vécu. Condiment : échec silencieux, borné à 20 s (budget reel 90 s + 45 s).
 */
/** Stories sur son propre cas (« Ton cas d'abord », mode own_case) : aucune
 * recherche « creuser le sujet », donc aucun chiffre de recherche (décision de
 * Laetitia du 05/10/2026). L'actu, les autres formats et les stories sans cas
 * fourni gardent la recherche. */
export function skipDepthResearch(isStories: boolean, lived: { mode: string }): boolean {
  return isStories && lived.mode === "own_case";
}

/**
 * Faut-il lancer la recherche « creuser le sujet » pour cette demande, et avec
 * quel cas personnel ? Mêmes conditions et mêmes traces qu'avant le 27/11/2026,
 * sorties du handler pour que la recherche parte dès la marque lue (en
 * parallèle des autres lectures) au lieu d'attendre la fin de la préparation.
 */
/** Réponses assez longues pour porter le reel sans recherche (même seuil que la matière vécue). */
const REEL_ANSWER_MIN_WORDS = 8;
const answeredWords = (answers: string[]) => answers.join(" ").split(/\s+/).filter(Boolean).length;

export function planDepthResearch(p: {
  step: string; deepResearch?: unknown; isPhotoMode: boolean;
  isCaption: boolean; isLinkedIn: boolean; isReel: boolean; isStories: boolean; body: any;
  /** Comparaison avec / sans recherche : vrai seulement pour un compte de test (isQaTestAccount). */
  skipForTest?: boolean;
}): { run: boolean; livedCase?: string } {
  if (!(p.step === "generate" && !p.deepResearch && !p.isPhotoMode && (p.isCaption || p.isLinkedIn || p.isReel || p.isStories))) return { run: false };
  const lived = livedCaseFromCreativeBody(p.body);
  if (skipDepthResearch(p.isStories, lived)) {
    // Décision de Laetitia (05/10/2026) : des stories sur SON cas ne parlent
    // que d'elle, sans aucun chiffre de recherche.
    console.log(`[creative-flow] stories sur son propre cas (${lived.reasons.join(", ")}) — aucune recherche, aucun chiffre de recherche`);
    return { run: false };
  }
  // Reel où elle a répondu aux questions (décisions de Laetitia du 27/11/2026) :
  // aucune recherche. « En appui » (son cas reconnu), mesurée sur 5 reels : 3 à
  // 5 s d'attente, aucune source reprise. « En profondeur », comparée à
  // l'aveugle sur 5 sujets : 8 à 11 s d'attente en plus, les scripts sans
  // recherche gagnent 3 fois sur 5 et toutes les affirmations douteuses venaient
  // de la recherche. Gardée : reel sans réponse (non testé) et actu + ressenti.
  if (p.isReel && lived.mode !== "news_feeling" && answeredWords(lived.answers) >= REEL_ANSWER_MIN_WORDS) {
    console.log(`[creative-flow] reel avec ses réponses (${lived.provided ? "son cas" : "réponses"}) — pas de recherche`);
    return { run: false };
  }
  // Essai de comparaison (comptes de test seulement, posé par index.ts) : même demande sans recherche.
  if (p.skipForTest) {
    console.log("[creative-flow] essai sans recherche (compte de test)");
    return { run: false };
  }
  if (lived.provided) console.log(`[creative-flow] cas personnel fourni (${lived.reasons.join(", ")}) — ton cas d'abord, recherche en appui`);
  else if (lived.mode === "news_feeling") console.log(`[creative-flow] actu + ressenti fourni (${lived.reasons.join(", ")}) — son ressenti porte le contenu, recherche en profondeur`);
  return { run: true, livedCase: lived.provided ? lived.answers.join("\n") || String(p.body?.context || "") : undefined };
}

export async function creativeDepthBlock(params: { context?: string | null; newsContext?: string | null; activity?: string; livedCase?: string }): Promise<string> {
  const subject = typeof params.context === "string" ? params.context.trim() : "";
  if (!subject) return "";
  // Annonce ou mise en vente (13/11/2026, décision de Laetitia) : aucun fait du web.
  if (isSaleListing(subject)) {
    console.log("[creative-flow] annonce de vente : pas de recherche « creuser le sujet »");
    return "";
  }
  const newsAngle = typeof params.newsContext === "string" ? params.newsContext.trim().slice(0, 600) : "";
  // « Ton cas d'abord » (04/10/2026) : cas personnel fourni → vérification d'un point, au plus un fait.
  const mode = params.livedCase?.trim() ? "support" : "depth";
  const material = await _deps.fetchDepthMaterial({
    mode,
    livedCase: params.livedCase,
    subject: [subject.slice(0, 1500), newsAngle].filter(Boolean).join("\n"),
    activity: params.activity,
    model: getModelForAction("content"),
    apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
    logger: (m) => console.log(`[creative-flow] ${m}`),
    timeoutMs: 20_000,
  });
  return buildDepthBlock(material, mode);
}

/**
 * Bloc Deep Research (recherche web via l'outil Anthropic web_search), extrait
 * de serve() pour être testable directement (deno test, sans vrai serveur
 * HTTP — voir index_test.ts). Comportement inchangé : ne débite un crédit
 * `deep_research` QUE si la recherche web a réellement réussi (searchResponse.ok).
 * Renvoie le texte à ajouter au systemPrompt, "" si rien à ajouter (échec ou
 * réponse vide).
 */
export async function runDeepResearchWebSearch(params: {
  userId: string;
  workspaceId?: string;
  calendarContext?: { theme?: string } | null;
  context?: string | null;
  contentType?: string | null;
  profile?: { activite?: string } | null;
  effectiveObjective?: string | null;
  objective?: string | null;
  editorialFormatLabel?: string | null;
  angle?: { title?: string } | null;
}): Promise<string> {
  const { userId, workspaceId, calendarContext, context, contentType, profile, effectiveObjective, objective, editorialFormatLabel, angle } = params;

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

  const searchModel = getModelForAction("content");
  const searchResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: searchModel,
      // Fetch brut (hors helpers) : la garde thinking Sonnet 5 doit être posée
      // ici aussi, sinon le thinking adaptatif mange le budget de recherche.
      ...(forcesDisabledThinking(searchModel) ? { thinking: { type: "disabled" } } : {}),
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

  if (!searchResponse.ok) {
    console.error("Deep research web search failed:", searchResponse.status);
    return "";
  }

  const searchData = await searchResponse.json();
  const webSearchTokens = (searchData.usage?.input_tokens ?? 0) + (searchData.usage?.output_tokens ?? 0);
  // Extract all text blocks from the response
  const textParts: string[] = [];
  for (const block of (searchData.content || [])) {
    if (block.type === "text") {
      textParts.push(block.text);
    }
  }
  const researchResult = textParts.join("\n\n");

  // Log deep research usage only when the web search actually succeeded
  await logUsage(userId, "deep_research", "web_search", webSearchTokens || undefined, searchModel, workspaceId);

  if (!researchResult.trim()) return "";
  return `\n\n--- RECHERCHE WEB ---\n${researchResult}\n--- FIN RECHERCHE ---\n\nUtilise ces données pour étayer la position du contenu avec des faits concrets, des chiffres, des exemples récents, intégrés naturellement. Tout chiffre repris reste attaché à sa source (mention discrète : nom, année) ; jamais de chiffre sans source.`;
}
