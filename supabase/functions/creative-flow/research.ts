// Recherches de creative-flow qui ajoutent des faits au prompt : « creuser le
// sujet » (skipDepthResearch, creativeDepthBlock) et recherche web
// (runDeepResearchWebSearch, crédit deep_research seulement si elle réussit).
// Déplacées À L'IDENTIQUE depuis index.ts (fiche 3, lot B, 14/10/2026), qui
// les réexporte. Le checkQuota("deep_research") reste dans le handler, juste
// avant l'appel. Les tests remplacent _deps.fetchDepthMaterial : garder
// l'accès par _deps (ne pas le déstructurer). Voir docs/creation-contenu/CARTE.md.

import { getModelForAction, forcesDisabledThinking } from "../_shared/anthropic.ts";
import { buildDepthBlock } from "../_shared/depth-research.ts";
import { logUsage } from "../_shared/plan-limiter.ts";
import { _deps } from "./shared.ts";

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

export async function creativeDepthBlock(params: { context?: string | null; newsContext?: string | null; activity?: string; livedCase?: string }): Promise<string> {
  const subject = typeof params.context === "string" ? params.context.trim() : "";
  if (!subject) return "";
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
