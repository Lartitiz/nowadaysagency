// carousel-ai : proposition de plan (`structure_proposal`, gratuite, sans
// `logUsage`) et son compte rendu en base. Fiche 2, lot 3 de
// docs/robustesse/gros-fichiers.md : déplacé à l'identique depuis index.ts.

import { type HedgeReport, hedgedStructureCall, reviveStringSlides, describePlanShape, StructureDeadlineError } from "../structure-hedge.ts";
import { type CarouselRequestContext, _deps, buildPhotoContextRecap, pushPhotoWithContext, normalizeGeneratedPlanFields } from "../shared.ts";
import { carouselPlanReport } from "../../_shared/content-quality.ts";
import { COMMON, PLAN } from "../../_shared/carousel-editorial-contract.ts";
import { CONTENT_CLARITY_RULES } from "../../_shared/content-clarity.ts";
import { carouselSubstance, CAROUSEL_CONTINUITY, CAROUSEL_TITLES as SLIDE_TITLE_RULES } from "../writing-contract.ts";
import { livedCaseFromCarouselBody } from "../../_shared/lived-case.ts";
import { PHOTO_NARRATIVE_CONTRACT } from "../photo-narrative.ts";
import { carouselLengthPrompt, carouselLength } from "../../_shared/carousel-length.ts";
import { type AnthropicOptions, getModelForAction } from "../../_shared/anthropic.ts";
import { PHOTO_MISMATCH_SYSTEM_REMINDER, STRUCTURE_PROPOSAL_TOOL } from "../tools.ts";
import { tryParseAiJson } from "../../_shared/parse-ai-json.ts";
import { assignDistinctStructurePhotos } from "../../_shared/photo-slide-structure.ts";

// Compte rendu du plan, rempli par proposeStructure et gardé en base
// (content_quality_events, format carousel_plan) : nombres seulement.
export interface StructureTelemetry {
  hedge: HedgeReport | null;
  emptyPlans: number;
  offLengthPlans: number;
  requestedSlides: number | null;
  model?: string;
}

export async function handleStructureProposalRequest(reqCtx: CarouselRequestContext): Promise<Response> {
  const t: StructureTelemetry = { hedge: null, emptyPlans: 0, offLengthPlans: 0, requestedSlides: null };
  let res: Response | null = null;
  let thrown: unknown = undefined;
  try {
    res = await proposeStructure(reqCtx, t);
    return res;
  } catch (e) {
    thrown = e ?? "autre";
    throw e;
  } finally {
    await recordStructureProposal(reqCtx, t, res, thrown);
  }
}

export async function recordStructureProposal(reqCtx: CarouselRequestContext, t: StructureTelemetry, res: Response | null, thrown: unknown): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = res ? await res.clone().json().catch(() => null) : null;
    const photos = Array.isArray(reqCtx.body?.photos) ? reqCtx.body.photos.length : 0;
    const plan = carouselPlanReport({
      carouselType: reqCtx.body?.carousel_type,
      durationMs: Date.now() - reqCtx.startedAt,
      hedge: t.hedge, emptyPlans: t.emptyPlans, offLengthPlans: t.offLengthPlans,
      photos, requestedSlides: t.requestedSlides, response, thrown,
    });
    // Jamais plus de 2 s ajoutées au plan, même si la base traîne.
    await Promise.race([
      _deps.logPlan(reqCtx.userId, reqCtx.workspaceId, plan, t.model),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 2_000); }),
    ]);
  } catch (e) {
    console.error("[carousel-ai] compte rendu du plan ignoré :", (e as any)?.message || e);
  } finally {
    clearTimeout(timer);
  }
}

export async function proposeStructure(reqCtx: CarouselRequestContext, t: StructureTelemetry): Promise<Response> {
  const { body, brandingContext, newsContext, corsHeaders } = reqCtx;
  const { subject, carousel_type, objective, editorial_angle, deepening_answers, photos, photo_description } = body;
  const hasPhotos = photos && Array.isArray(photos) && photos.length > 0;
  const isPhotoMode = carousel_type === "photo";
  const isMixMode = carousel_type === "mix";

  const photoInstruction = hasPhotos && (isPhotoMode || isMixMode) ? `
MODE ${isPhotoMode ? "PHOTO" : "MIXTE"} — ${photos.length} photo(s) fournies.
${body.prefer_distinct_photos && isPhotoMode
  ? "Pour ce premier carrousel produit, crée une slide par photo disponible : chaque photo_index doit être unique. Adapte le récit à ces images sans en répéter une. Deux photos ne prouvent pas un avant/après ; ne suppose pas de lien chronologique."
  : "Le nombre de photos ne détermine ni la longueur ni le type d'histoire. Deux photos ne prouvent pas un avant/après. Préserve l'ordre choisi ; une photo peut porter plusieurs passages, sans zoom imposé. Écarte une photo seulement si elle ne sert pas le sujet."}
${isPhotoMode ? 'Chaque slide utilise slide_type:"photo_full" et un photo_index depuis 1.' : 'Répartis photo_full, photo_integrated et text_only selon les besoins du propos. Le texte approfondit ce que les photos accompagnent ; une répartition confirmée prime. photo_index depuis 1 pour les slides photo, absent pour text_only.'}
Chaque story_beat indique ce que la slide reprend et ce qu'elle ajoute. Les textes se lisent ensemble comme un récit ou une explication suivie, avec une entrée et un aboutissement. Les listes gardent un cadre commun sans causalité artificielle.
Choisis overlay_position (top_left, top_center, bottom_left, bottom_center, center) pour les slides photo_full dans une zone dégagée qui laisse visibles visage, mains, objet et détails importants. Évite center quand le sujet occupe le centre. Respecte le cadrage original.
${photo_description ? `Description complémentaire : ${photo_description}` : ""}
` : "";

  const hasNewsContextForStructure = typeof newsContext === "string" && newsContext.trim().length > 0;
  // Bloc condensé spécifique à structure_proposal : on ne réutilise PAS newsContextBlock
  // (trop lourd, orienté rédaction finale avec ANTI_FABRICATED_STORYTELLING etc.).
  // Ici on veut juste informer l'architecture narrative.
  const structureNewsContextBlock = hasNewsContextForStructure
    ? `\n\n══════════════════════════════════════\nCONTEXTE ACTUALITÉ (NEWSJACKING)\n══════════════════════════════════════\n${(newsContext as string).trim()}\n`
    : "";
  const structureNewsConsigne = hasNewsContextForStructure
    ? `\nCONSIGNE STRUCTURE — NEWSJACKING ACTIF :\n- La slide 1 (hook) DOIT partir de l'actualité ci-dessus, pas d'une description des photos.\n- Au moins une slide de corps doit exploiter un fait précis de l'actu (chiffre, nom, citation, mécanisme évoqué).\n- Les photos illustrent et incarnent ce propos ; elles ne le remplacent pas.\n- Pense "article + photos", pas "photos seules".\n`
    : "";

  const structureSystemPrompt = `${COMMON}
${PLAN}
${CONTENT_CLARITY_RULES}
${carouselSubstance(livedCaseFromCarouselBody(body).mode)}
${CAROUSEL_CONTINUITY}
${PHOTO_NARRATIVE_CONTRACT}

Tu es une stratège éditoriale spécialisée en carrousels Instagram et LinkedIn.

Sources pour les références du plan : request = sujet/réponses explicites ; brand = contexte de marque (vérifier le degré de certitude) ; photo_observations = uniquement ce qui est visible, pas une identité ou une histoire prouvée.
MISSION : Propose une structure narrative optimale pour un carrousel. Tu ne génères PAS le contenu des slides — uniquement leur architecture.

RÈGLES :
- Chaque slide a une fonction précise adaptée au sujet (présentation, explication, étape, argument, exemple, nuance…). Aucun problème, transformation, bascule ou CTA obligatoire.
- Justifie chaque position par son lien avec ce qui précède et son apport à l'ensemble, en 1 phrase max.
- Propose des titres spécifiques en français (voir RÈGLES TITRES ci-dessous), sans scène inventée.
- Sois concise et actionnable, pas théorique
${carouselLengthPrompt(body)}
${photoInstruction}

${SLIDE_TITLE_RULES}

CONTEXTE BRANDING :
${brandingContext}
${structureNewsContextBlock}${structureNewsConsigne}


Retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après, pas de backticks), avec cette structure exacte :
{
  "editorial_intent": {"mode":"explication", "idea":"Proposition précise à développer, distincte du thème ou du parcours des photos", "reader_takeaway":"Ce que le développement permettra de comprendre", "basis_source_ids":["brand"], "inferred":true},
  "strategic_rationale": "2-3 phrases expliquant la logique narrative globale",
  "narrative_thread": "Intention et progression retenues ; promesse tenue de la couverture ; aboutissement. Cite les faits disponibles qui fondent ce choix. Le récit peut venir de l’histoire de marque et être accompagné indirectement par les photos.",
  "slides": [
    {
      "slide_number": 1,
      "role": "hook",
      "title_suggestion": "titre court proposé",
      "strategic_note": "pourquoi cette slide à cette position",
      "contribution": "Ce que cette page apporte au propos",
      "inherits": "Élément précis repris ou promesse de couverture",
      "develops": "Avancée du raisonnement, pas nouveau motif ou objet",
      "source_ids": ["brand"],
      "image_role": "Ce que la photo accompagne, sans dicter le texte",
      "story_beat": "Ce que cette slide fait comprendre ou raconte avec la matière fournie, et comment elle poursuit la précédente, en 1 phrase. Une étape du propos, sans émotion, événement ou bascule inventés ; une description de photo seule ne suffit pas."${hasPhotos ? `,
      "photo_index": 1,
      "slide_type": "photo_full",
      "overlay_position": "bottom_left",
      "visual_anchor": "Détail visible à préserver dans le cadrage ; ne dicte pas le texte.",
      "photo_observation": "Ce qui est visible et ce qui reste ambigu, sans histoire supposée.",
      "image_relation": "Ce que cette image accompagne dans le récit, même indirectement.",
      "factual_basis": "Faits et sources disponibles pour ce passage ; observation ou interprétation quand ce n’est pas un fait confirmé."` : ""}
    }
  ],
  "total_slides": 7,
  "carousel_type": "${carousel_type || "auto"}"
}

RAPPEL CRITIQUE sur les nouveaux champs :
- "narrative_thread" = LE récit que le pass d'écriture exécutera. C'est la colonne vertébrale.
- "story_beat" (par slide) = ce que la slide RACONTE dans ce récit, pas ce que la photo MONTRE. Une intention narrative.
- "photo_observation", "image_relation" et "factual_basis" conservent séparément ce qui est vu, ce que l’image accompagne et les sources utilisables. Le rédacteur ne reverra pas les pixels.
- story_beat sert le narrative_thread ; visual_anchor sert la composition. Une histoire de marque peut continuer sur une photo sans lien littéral avec sa phrase.`;

  const structureUserPrompt = `Sujet du carrousel : "${subject || "non précisé"}"
${hasNewsContextForStructure ? `Actualité de référence : "${(newsContext as string).split("\n")[0]?.slice(0, 120) || ""}…" — cette actu doit ancrer la structure proposée.` : ""}
${carousel_type ? `Type de carrousel : ${carousel_type}` : "Choisis le type le plus pertinent."}
${objective ? `Objectif : ${objective}` : ""}
${editorial_angle ? `Angle éditorial souhaité : ${editorial_angle}` : ""}
${deepening_answers ? `Réponses de personnalisation : ${JSON.stringify(deepening_answers)}` : ""}
${hasPhotos ? `Nombre de photos : ${photos.length}` : ""}
Propose la structure optimale.`;

  let callOptions: AnthropicOptions;
  if (hasPhotos) {
    const messageContent: any[] = [];
    const photoCtxRecap = buildPhotoContextRecap(photos);
    messageContent.push({
      type: "text",
      text: structureUserPrompt + photoCtxRecap + "\n\nVoici les photos à analyser :",
    });
    // Photos avec contexte par photo s'il existe (l'ordre = ordre d'envoi front)
    photos.slice(0, 10).forEach((photo: any, idx: number) => {
      pushPhotoWithContext(messageContent, photo, idx);
    });
    messageContent.push({
      type: "text",
      text: "Choisis une proposition éditoriale étayée, construis sa progression, puis assigne les photos à ces étapes. Une visite des photos ne tient pas lieu de propos.",
    });
    callOptions = {
      model: getModelForAction("content"),
      system: structureSystemPrompt + PHOTO_MISMATCH_SYSTEM_REMINDER,
      messages: [{ role: "user", content: messageContent }],
      // Evidence fields add material per slide; avoid truncating the scenario.
      max_tokens: 8192,
      tool: STRUCTURE_PROPOSAL_TOOL,
    };
  } else {
    callOptions = {
      model: getModelForAction("content"),
      system: structureSystemPrompt,
      messages: [{ role: "user", content: structureUserPrompt }],
      // Evidence fields add material per slide; avoid truncating the scenario.
      max_tokens: 8192,
      tool: STRUCTURE_PROPOSAL_TOOL,
    };
  }
  t.model = callOptions.model;

  // PAS de logUsage — cet appel est gratuit.
  // Appel lent : un second appel identique part en parallèle (structure-hedge.ts).
  // Un plan vide ou illisible sans motif (vu en ligne le 10/10 après 72 s)
  // compte comme un échec : le second appel le rattrape.
  const hasSlides = (r: any) => Array.isArray(r?.slides) && r.slides.length > 0;
  const hasMismatch = (r: any) => typeof r?.photo_mismatch?.reason === "string" && r.photo_mismatch.reason.trim().length > 0;
  let emptyPlans = 0;
  let structureResult: any;
  const qaHedgeAfter = Number(body.qa_structure_hedge_after_ms);
  // Longueur choisie : le plan validé fixe ensuite la longueur du carrousel
  // (carouselLength donne la priorité à la structure confirmée). Un plan à 7
  // slides pour 10 demandées (vu en ligne le 11/10) en donnerait 7 sans le
  // dire : on redemande, et on garde le plan le plus proche si aucun ne tombe juste.
  const exactSlides = carouselLength(body).exact;
  t.requestedSlides = exactSlides ?? null;
  let offLengthPlan: any = null;
  const keepClosest = (plan: any) => {
    if (!offLengthPlan || Math.abs(plan.slides.length - exactSlides!) < Math.abs(offLengthPlan.slides.length - exactSlides!)) offLengthPlan = plan;
  };
  try {
    structureResult = await hedgedStructureCall(async (n, signal) => {
      const content = await _deps.callAnthropic({ ...callOptions, signal });
      const parsed: any = reviveStringSlides(tryParseAiJson(content, "carousel-ai:structure_proposal"));
      if (!parsed || (!hasSlides(parsed) && !(hasPhotos && hasMismatch(parsed)))) {
        emptyPlans++;
        t.emptyPlans = emptyPlans;
        // Cause des plans vides inconnue (1 sur 12 le 10/10) : forme de la réponse, jamais le texte.
        console.warn(JSON.stringify({ type: "carousel_structure_empty", call: n, ...describePlanShape(parsed, content) }));
        throw new Error(parsed ? "structure_vide" : "structure_illisible");
      }
      if (exactSlides && hasSlides(parsed) && parsed.slides.length !== exactSlides) {
        keepClosest(parsed);
        t.offLengthPlans++;
        console.warn(JSON.stringify({ type: "carousel_structure_length", call: n, slides: parsed.slides.length, requested: exactSlides }));
        throw new Error("structure_longueur");
      }
      return parsed;
    }, {
      elapsedMs: Date.now() - reqCtx.startedAt,
      ...(Number.isFinite(qaHedgeAfter) && qaHedgeAfter > 0 ? { hedgeAfterMs: qaHedgeAfter } : {}),
      onReport: (report) => (t.hedge = report, console.log(JSON.stringify({ type: "carousel_structure_proposal", ...report, empty_plans: emptyPlans, ...(offLengthPlan ? { off_length_slides: offLengthPlan.slides.length, requested_slides: exactSlides } : {}), photos: hasPhotos ? photos.length : 0 }))),
    });
  } catch (err) {
    const reason = (err as Error)?.message;
    if (offLengthPlan) {
      // Aucun plan à la bonne longueur : le plus proche plutôt que rien.
      structureResult = offLengthPlan;
    } else if (err instanceof StructureDeadlineError) {
      return new Response(JSON.stringify({
        error: "structure_timeout",
        message: "La proposition de structure a pris trop de temps. Aucun crédit n'a été décompté.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else if (reason === "structure_vide") structureResult = { slides: [] };
    else if (reason === "structure_illisible") structureResult = null;
    else throw err;
  }

  // Refus structuré : mêmes symptômes possibles que sur la génération (l'IA
  // voit les photos en vision) — sans ce chemin, un photo_mismatch partait
  // en « Impossible de parser » + repli sur une génération directe qui
  // re-refusait. Appel gratuit : rien à dé-débiter, mais le message doit
  // être actionnable. Le front (CreerUnifie) affiche message et renvoie au
  // choix des photos.
  if (hasPhotos && !(Array.isArray(structureResult?.slides) && structureResult.slides.length > 0)) {
    const mismatchReason = typeof structureResult?.photo_mismatch?.reason === "string"
      ? structureResult.photo_mismatch.reason.trim()
      : "";
    if (mismatchReason) {
      const plural = photos.length > 1;
      console.warn(`[carousel-ai] structure_proposal: photo_mismatch — ${mismatchReason}`);
      return new Response(JSON.stringify({
        error: "photo_mismatch",
        message: `${plural ? "Tes photos ne semblent pas correspondre" : "Ta photo ne semble pas correspondre"} à ton idée : ${mismatchReason}${/[.!?…]$/.test(mismatchReason) ? "" : "."} Change de photo${plural ? "s" : ""} ou passe en carrousel « Texte design » pour garder ton idée telle quelle. Aucun crédit n'a été décompté.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!structureResult) {
    return new Response(JSON.stringify({ error: "Impossible de parser la structure proposée" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 0 slide SANS raison de mismatch : erreur explicite plutôt qu'une
  // structure vide renvoyée en « succès » (le front auto-valide en mode
  // photo et enchaînerait une génération sur du vide).
  if (!(Array.isArray(structureResult.slides) && structureResult.slides.length > 0)) {
    console.warn("[carousel-ai] structure_proposal: 0 slide sans photo_mismatch");
    return new Response(JSON.stringify({
      error: "structure_vide",
      message: "La proposition de structure est revenue vide. Réessaie — aucun crédit n'a été décompté.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  structureResult.slides.forEach(normalizeGeneratedPlanFields);
  // Carrousel photo : toutes les slides sont des slides photo (consigne du
  // prompt, que le modèle ne suit pas toujours).
  if (isPhotoMode) for (const sl of structureResult.slides) if (sl && typeof sl === "object") sl.slide_type = "photo_full";
  const result = body.prefer_distinct_photos && isPhotoMode && hasPhotos
    ? assignDistinctStructurePhotos(structureResult, photos.length)
    : structureResult;
  return new Response(JSON.stringify({ result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
