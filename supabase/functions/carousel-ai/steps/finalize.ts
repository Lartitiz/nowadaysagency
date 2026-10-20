// carousel-ai : finition commune à TOUS les carrousels (texte, photo, mixte,
// récit continu) — ZONE ROUGE. Réparation de structure, juge du fil puis
// réparation locale ou globale gardée seulement si elle fait mieux, reçu de
// génération, couverture, contrôle tu / vous. Fiche 2, lot 4 de
// docs/robustesse/gros-fichiers.md : déplacé à l'identique depuis index.ts.

import { type StatusEmitter } from "../../_shared/anthropic-stream.ts";
import { type UsageSink, SONNET_MODEL } from "../../_shared/anthropic.ts";
import { carouselStructureIssues, structureRepairInstruction } from "../../_shared/carousel-length.ts";
import { tryParseAiJson } from "../../_shared/parse-ai-json.ts";
import { REPAIR_START_LIMIT_MS, type CarouselRequestContext, buildPhotoContextRecap, _deps, echoContext } from "../shared.ts";
import { countCarouselSlides } from "../../_shared/photo-slide-structure.ts";
import { type ProgressionSource, progressionJudgeCallMs, type ProgressionResult, progressionReceipt, PROGRESSION_FORMAT_RETRY_MS, progressionWarnings } from "../../_shared/carousel-progression.ts";
import { localRepairPlan, expectedLocalRepairMs, localRepairInstruction, mergeLocalRepair } from "../thread-local-repair.ts";
import { REPAIR } from "../../_shared/carousel-editorial-contract.ts";
import { analyzeCarouselRedac, numbersIn, runRedacGate } from "../../_shared/redac-gate.ts";
import { carouselEditorialFields } from "../../_shared/carousel-editorial-review.ts";
import { preservesCarouselScenario } from "../../_shared/carousel-thread.ts";
import { CAROUSEL_WRITING_VERSION } from "../writing-contract.ts";
import { CAROUSEL_WRITER_VERSION } from "../writer.ts";
import { enforceCover, coverKind, coverRewritePrompt } from "../../_shared/carousel-cover.ts";
import { type AudienceAddress, type AudienceAddressPass, enforceAudienceAddress } from "../../_shared/audience-address.ts";
import { extractCarouselTexts, reinjectCarouselTexts } from "../../_shared/correction-pass.ts";
import { progressionMaterial } from "../../_shared/carousel-editorial-snapshot.ts";
import { researchSourceWarnings } from "../research-sources.ts";

/** Temps gardé après le 2e juge du fil pour couverture, tu/vous et envoi. */
export const RECHECK_FINISH_MS = 10_000;

// ── Queue commune de génération ──
// ── Fil du carrousel (16/09/2026) ──
// Relecture du carrousel ENTIER par un juge court (_shared/carousel-thread.ts),
// puis réparation par le rédacteur quand des défauts sont nommés : slides qui
// se répètent, permutables, rubriques posées à part, sortie du cas de départ.
// `inspect` = checks structurels déterministes (texte). Sans `regenerate`
// (chemins vision : renvoyer les photos coûterait un 2e appel plein tarif), on
// mesure et on avertit seulement — les défauts restent visibles dans
// structure_warnings. Une réparation n'est gardée que si elle fait mieux.
export async function repairCarouselStructure(content: string, opts: {
  body: any;
  label: string;
  emitStatus: StatusEmitter;
  usage: UsageSink;
  startedAt: number;
  inspect?: (content: string) => string[];
  regenerate?: (
    draft: string,
    defects: string,
    sink: UsageSink,
  ) => Promise<string>;
}): Promise<{ content: string; repaired: boolean }> {
  const inspect = opts.inspect ||
    ((value: string) =>
      carouselStructureIssues(tryParseAiJson(value), opts.body));
  const issues = inspect(content);
  if (
    !issues.length || !opts.regenerate ||
    Date.now() - opts.startedAt > REPAIR_START_LIMIT_MS
  ) return { content, repaired: false };
  const sink: UsageSink = {};
  try {
    opts.emitStatus("correcting");
    const candidate = await opts.regenerate(
      content,
      "DÉFAUTS STRUCTURELS :\n" + issues.join("\n") + "\n" +
        structureRepairInstruction(issues),
      sink,
    );
    const parsed = tryParseAiJson<any>(candidate);
    const plan = opts.body.confirmed_structure || opts.body.slide_structure;
    const matchesPlan = !plan?.length ||
      (parsed?.slides?.length === plan.length &&
        plan.every((ref: any, i: number) =>
          [
            "photo_index",
            "slide_type",
            ...(opts.body.scenario_origin === "automatic" ? [] : ["role"]),
          ].every((key) =>
            ref[key] == null || parsed.slides[i]?.[key] === ref[key]
          )
        ));
    if (
      countCarouselSlides(candidate) > 0 && matchesPlan &&
      !inspect(candidate).length
    ) return { content: candidate, repaired: true };
  } catch {
    /* The original recoverable draft remains available. */
  } finally {
    for (
      const key of ["input_tokens", "output_tokens", "total_tokens"] as const
    ) opts.usage[key] = (opts.usage[key] || 0) + (sink[key] || 0);
  }
  // Réparation refusée ou en échec : le brouillon d'origine reste, et la
  // réparation du fil (finalizeCarousel) garde sa chance de passer.
  return { content, repaired: false };
}

export async function finalizeCarousel(
  content: string,
  ctx: CarouselRequestContext,
  opts: {
    usage: UsageSink;
    repaired?: boolean;
    reserveMs?: number;
    /** Détail de l'étape fil (06/10/2026) : sans lui, 108-133 s de `thread_ms` restaient indécomposables. */
    timings?: Record<string, number>;
    /** Durée mesurée de la rédaction : une réparation du fil réécrit tout le carrousel et prend à peu près autant. */
    expectedRepairMs?: number;
    regenerate?: (
      draft: string,
      defects: string,
      sink: UsageSink,
      abortTimeoutMs?: number,
    ) => Promise<string>;
  },
): Promise<string> {
  let doc: any = tryParseAiJson(content, "carousel-ai:final-progression");
  if (!doc?.slides?.length) return content;
  const { body, startedAt } = ctx;
  const sources: ProgressionSource[] = [
    {
      id: "request",
      provenance: "user",
      text: [
        body.subject,
        body.subject_details,
        body.photo_description,
        ctx.currentAuthoredText,
        body.deepening_answers ? JSON.stringify(body.deepening_answers) : "",
        body.editorial_angle,
        body.objective,
      ].filter(Boolean).join("\n"),
    },
    { id: "brand", provenance: "brand_context", text: ctx.brandingContext },
    {
      id: "photo_context",
      provenance: "user_context_and_separate_library_inferences",
      text: buildPhotoContextRecap(body.photo_contexts || body.photos),
    },
    {
      id: "photo_observations",
      provenance:
        "visual_observation_inferred_by_planner_not_verified_identity_or_history",
      text: JSON.stringify(
        // Sans numéro de photo : l'association finale se décide après le juge.
        (body.confirmed_structure || []).map((s: any) => s.photo_observation).filter(Boolean),
      ),
    },
    {
      id: "news",
      provenance: "provided_reference",
      text: typeof ctx.newsContext === "string" ? ctx.newsContext : "",
    },
    {
      // Faits de la recherche web gardés parce qu'une page trouvée porte leur
      // source (16/10/2026) : sans eux, le juge signalait comme « venu de
      // nulle part » un fait que la rédaction avait le droit de reprendre.
      id: "web_research",
      provenance: "web_search_facts_with_found_page_links",
      text: ctx.researchText
        ? [ctx.researchText.trim(), ...(ctx.researchLinks || []).map((l) => `Page de « ${l.name} » : ${l.url}`)].join("\n")
        : "",
    },
  ].filter((s) => s.text.trim());
  const remaining = () => 270_000 - (opts.reserveMs || 0) - (Date.now() - startedAt);
  const lap = async <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try { return await work(); } finally { if (opts.timings) opts.timings[key] = (opts.timings[key] || 0) + Date.now() - t0; }
  };
  // Le juge écrit une entrée par slide et par frontière : ~3 s de plus par slide
  // (31-42 s mesurées à 12-14 slides). 45 s fixes coupaient le contrôle à 18-20
  // slides, et le carrousel partait sans fil vérifié. judgeCapMs = durée
  // ATTENDUE d'un contrôle, qui fixe la réserve laissée après une réparation.
  const judgeCapMs = 45_000 + Math.max(0, doc.slides.length - 14) * 3_000;
  // 09/10/2026 (photo, 10 slides) : premier appel 33 s, rapport refusé, relance
  // de format coupée après les 12 s restantes → « Le contrôle final du fil n'a
  // pas abouti ». Chaque appel a son plafond et la relance son propre temps ;
  // remaining() borne toujours le tout, donc le pire cas ne bouge pas.
  const judgeCallMs = progressionJudgeCallMs(doc.slides.length);
  // 2e JUGE (après réparation) BORNÉ À SA RÉSERVE (20/10/2026, 15 slides) : la
  // réserve comptait judgeCapMs (48 s) mais l'appel recevait le plafond du 1er
  // juge (63 s + 45 s de relance), borné seulement par la fin du budget. Il a
  // pris les 64 s restantes (67 s le 19/10), fini « invalid », et le carrousel
  // est sorti à 275 s. Désormais il a exactement le temps réservé, relance de
  // format comprise, et laisse toujours RECHECK_FINISH_MS pour finir.
  const judge = async (value: any, key = "thread_judge_ms", capMs?: number): Promise<ProgressionResult> => {
    const budgetMs = capMs === undefined
      ? Math.min(judgeCallMs + PROGRESSION_FORMAT_RETRY_MS, remaining())
      : Math.min(capMs, remaining() - RECHECK_FINISH_MS);
    return lap(key, () =>
      budgetMs < 8_000
        ? progressionReceipt(value, "skipped", "time-budget")
        : _deps.reviewThread(value, {
          sources,
          sourceContext: JSON.stringify(sources),
          preserveStructure: true,
          abortTimeoutMs: budgetMs,
          callTimeoutMs: capMs === undefined ? judgeCallMs : budgetMs,
        }));
  };
  const ownsText = body.type === "slides" || body.user_slides?.length;
  // « Photos brutes » : les slides n'ont plus de texte (vidées après
  // l'écriture), il n'y a pas de fil à juger, réparer ni couverture à poser.
  const photosOnly = body.photos_only === true;
  if (!ownsText && !photosOnly) ctx.emitStatus("checking");
  let receipt = ownsText
    ? await progressionReceipt(doc, "skipped", "user-authored")
    : photosOnly
    ? await progressionReceipt(doc, "skipped", "pure-photo-no-text")
    : await judge(doc);
  const recordUsage = (r: ProgressionResult) => {
    for (
      const k of ["input_tokens", "output_tokens", "total_tokens"] as const
    ) opts.usage[k] = (opts.usage[k] || 0) + (r.usage?.[k] || 0);
  };
  recordUsage(receipt);
  const baseline = doc;
  const minorContinuity = receipt.verdict === "acceptable" &&
    receipt.report?.defects?.some((d: any) => d.severity === "minor" &&
      ["unclear_idea", "promise", "juxtaposition", "repetition", "rupture", "ending"].includes(d.type));
  const initialDefectCount = receipt.report?.defects?.length ?? 0;
  const wantsRepair = !ownsText && !opts.repaired && !!opts.regenerate &&
    receipt.execution_status === "completed" &&
    (receipt.verdict === "needs_repair" || minorContinuity);
  // RÉPARATION PERDUE D'AVANCE (06/10/2026) : 13 slides, rédaction 82 s, il
  // restait 35 s à la réparation → coupée (« repair-failed »), 35 s d'attente
  // pour rien. Elle réécrit tout le carrousel : on ne la lance que si son délai
  // couvre au moins la durée de la rédaction initiale. Sinon le brouillon jugé
  // reste, avec ses défauts affichés — exactement l'issue d'une réparation coupée.
  // RÉPARATION LOCALE (08/10/2026) : des défauts qui touchent peu de slides ne
  // font réécrire que ces slides et leurs voisines (thread-local-repair.ts),
  // assez court pour tenir là où la réécriture complète était sautée.
  const repairPlan = wantsRepair ? localRepairPlan(receipt.report, doc.slides.length) : null;
  const localTargets = repairPlan?.targets ?? null;
  const expectedRepairMs = localTargets
    ? expectedLocalRepairMs(opts.expectedRepairMs || 0, localTargets.length, doc.slides.length)
    : (opts.expectedRepairMs || 0);
  // Réserve après la réparation : le 2e juge (son plafond, qu'il respecte
  // désormais, cf. judge) + 10 s pour finir.
  const recheckReserveMs = judgeCapMs + RECHECK_FINISH_MS;
  const repairTimeoutMs = Math.min(120_000, remaining() - recheckReserveMs);
  const repairFits = repairTimeoutMs >= 30_000 && repairTimeoutMs >= expectedRepairMs;
  if (wantsRepair && !repairFits) {
    receipt.repair_skipped = "time-budget";
    if (opts.timings) opts.timings.thread_repair_skipped = 1;
  }
  // A single shared repair budget. No retry if a prior structural repair was attempted.
  if (wantsRepair && repairFits && opts.regenerate) {
    const sink: UsageSink = {};
    let repairReason = "candidate-failed-invariants";
    let candidateStatus: string | undefined;
    let candidateVerdict: string | null | undefined;
    try {
      ctx.emitStatus("correcting");
      const draft = JSON.stringify(doc);
      const regenerate = opts.regenerate;
      if (opts.timings && localTargets) opts.timings.thread_repair_local = localTargets.length;
      const written: any = tryParseAiJson(
        await lap("thread_repair_ms", () => regenerate(
          draft,
          REPAIR + "\nDÉFAUTS DE FIL :\n" + receipt.issues.join("\n") + "\n" +
            (localTargets ? localRepairInstruction(localTargets, doc) : "Même nombre, ordre et associations photo.") +
            " Sources :\n" + JSON.stringify(sources),
          sink,
          repairTimeoutMs,
        )),
      );
      // Slides réécrites remises à leur place : la suite contrôle le carrousel ENTIER.
      const candidate: any = localTargets ? mergeLocalRepair(doc, localTargets, written) : written;
      if (!candidate) {
        repairReason = "local-candidate-mismatch";
        throw new Error(repairReason);
      }
      // Exact photo/type/order protection; only a genuinely automatic plan may change roles/intents.
      const scenario = (v: any) =>
        (body.scenario_origin === "automatic" || (!body.scenario_origin && !body.confirmed_structure?.length))
          ? {
            ...v,
            slides: v?.slides?.map((slide: any) => ({
              ...slide,
              role: undefined,
              story_beat: undefined,
              visual_anchor: undefined,
              photo_observation: undefined,
              image_relation: undefined,
              factual_basis: undefined,
            })),
          }
          : v;
      const facts = (v: any) =>
        analyzeCarouselRedac(v, numbersIn(ctx.gateInputText), undefined, undefined, undefined, ctx.testimonySource);
      const prev = facts(doc), next = facts(candidate);
      // Une réécriture du juge final n'ajoute ni témoignage ni vécu au passé inventés.
      const invented = (a: ReturnType<typeof facts>) => (a.inventedTestimonials?.length ?? 0) + (a.inventedExperiences?.length ?? 0);
      const priorNumbers = new Set(
        prev.fabricatedNumbers.map((x) => x.split(" ")[0]),
      );
      const rawChanged = doc.slides.some((slide: any, i: number) =>
        (doc.no_overlay || slide.no_overlay) &&
        carouselEditorialFields({ slides: [candidate?.slides?.[i]] }).length > 0
      );
      const idChanged = doc.slides.some((slide: any, i: number) =>
        slide.id !== candidate?.slides?.[i]?.id
      );
      const originalText = carouselEditorialFields(doc).map((f) => f.text).join(
        "\n",
      );
      const candidateText = carouselEditorialFields(candidate).map((f) =>
        f.text
      ).join("\n");
      const allowed = numbersIn(ctx.gateInputText);
      const lostNumber = [...numbersIn(originalText)].some((n) =>
        allowed.has(n) && !numbersIn(candidateText).has(n)
      );
      const quotes = [
        ...originalText.matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"\n]{6,})"/g),
      ].map((m) => (m[1] || m[2] || m[3]).trim());
      const lostQuote = quotes.some((q) =>
        ctx.gateInputText.includes(q) && !candidateText.includes(q)
      );
      if (
        !rawChanged && !idChanged &&
        preservesCarouselScenario(scenario(doc), scenario(candidate)) &&
        !carouselStructureIssues(candidate, body).length && !lostNumber &&
        !lostQuote && !next.fabricatedNumbers.some((x) =>
          !priorNumbers.has(x.split(" ")[0])
        ) && next.durationConflicts.length <= prev.durationConflicts.length &&
        invented(next) <= invented(prev)
      ) {
        // Recompute deterministic fields only. Never mutate text after the final judge.
        const measured = await runRedacGate(JSON.stringify(candidate), {
          isLinkedIn: ctx.isLinkedIn,
          inputText: ctx.gateInputText,
          researchText: ctx.researchText,
          researchNumbersCap: ctx.researchNumbersCap,
          testimonySource: ctx.testimonySource,
          brandGuardText: ctx.brandGuardText,
          echo: echoContext(ctx),
          correction: { enabled: false },
        });
        const finalCandidate: any = tryParseAiJson(measured.content);
        const checked = await judge(finalCandidate, "thread_recheck_ms", judgeCapMs);
        recordUsage(checked);
        candidateStatus = checked.execution_status;
        candidateVerdict = checked.verdict;
        repairReason = checked.execution_status !== "completed" ? `review-${checked.execution_status}` : "candidate-not-acceptable-or-not-improved";
        if (
          checked.execution_status === "completed" &&
          checked.verdict === "acceptable" &&
          // For an already acceptable draft, retain a rewrite only when the
          // final reviewer finds strictly fewer defects overall.
          (!minorContinuity || (Array.isArray(checked.report?.defects) &&
            checked.report.defects.length < initialDefectCount))
        ) {
          doc = finalCandidate;
          receipt = checked;
          repairReason = "accepted";
          doc.editorial_review = {
            ...baseline.editorial_review,
            status: localTargets ? "superseded_by_local_repair" : "superseded_by_global_repair",
          };
        }
      }
    } catch {
      if (repairReason !== "local-candidate-mismatch") repairReason = "repair-failed";
      /* Preserve the original reviewed draft and its defects. */
    } finally {
      if (opts.timings) opts.timings.thread_repair_accepted = doc !== baseline ? 1 : 0;
      receipt.repair = { attempted: true, accepted: doc !== baseline,
        trigger: minorContinuity ? "minor_continuity" : "needs_repair",
        scope: localTargets ? "local" : "global",
        ...(repairPlan && !repairPlan.targets ? { global_reason: repairPlan.reason } : {}),
        ...(localTargets ? { slides: localTargets.map((i) => i + 1) } : {}),
        expected_ms: expectedRepairMs,
        reason:repairReason,candidate_status:candidateStatus,candidate_verdict:candidateVerdict };
      for (
        const k of ["input_tokens", "output_tokens", "total_tokens"] as const
      ) opts.usage[k] = (opts.usage[k] || 0) + (sink[k] || 0);
    }
  }
  doc.editorial_intent = doc.editorial_intent ?? body.editorial_intent;
  if (doc.narrative_draft?.repair?.reason === "final-review-pending") {
    doc.narrative_draft.review = receipt;
    doc.narrative_draft.repair = { attempted: true, accepted: true, reason: "accepted-by-final-review" };
  }
  doc.progression_review = receipt;
  doc.generation_receipt = {
    writing_version: CAROUSEL_WRITING_VERSION,
    writer_version: CAROUSEL_WRITER_VERSION,
    model: opts.usage.model ?? null,
    scenario_origin: body.scenario_origin ||
      (body.confirmed_structure?.length ? "user_validated" : "automatic"),
    source_manifest: sources.map(({ id, provenance, text }) => ({
      id,
      provenance,
      characters: text.length,
    })),
    duration_ms: Date.now() - startedAt,
  };
  doc.structure_warnings = photosOnly ? [] : [
    ...carouselStructureIssues(doc, body),
    ...(ownsText ? [] : progressionWarnings(receipt)),
  ];
  // COUVERTURE (04/10/2026) : accroche de 10 mots max + sous-titre facultatif,
  // rien d'autre ; seule la slide 1 est touchée (cf. _shared/carousel-cover.ts).
  const beforeTouches = progressionMaterial(doc);
  const coverSink: UsageSink = {};
  const cover = photosOnly ? { doc, receipt: null } : await lap("thread_cover_ms", () => enforceCover(doc, {
    kind: coverKind(body.carousel_type),
    userAuthored: !!ownsText,
    selectedHook: typeof body.selected_hook === "string" ? body.selected_hook : body.selected_hook?.text ?? null,
    sources: ctx.gateInputText,
    rewrite: remaining() < 25_000 ? undefined : async (input) => {
      const raw = await _deps.callAnthropic({
        model: SONNET_MODEL,
        system: ctx.systemPrompt,
        messages: [{ role: "user", content: coverRewritePrompt(input, ctx.audienceAddress) }],
        max_tokens: 400,
        temperature: 0.7,
        abortTimeoutMs: Math.min(20_000, remaining() - 5_000),
      }, coverSink);
      return tryParseAiJson(raw, "carousel-ai:cover");
    },
  }));
  for (const k of ["input_tokens", "output_tokens", "total_tokens"] as const) opts.usage[k] = (opts.usage[k] || 0) + (coverSink[k] || 0);
  if (cover.receipt) console.log(JSON.stringify({ event: "carousel_cover", ...cover.receipt }));
  // TU OU VOUS (04/10/2026) : contrôle par le code après rédaction ET
  // couverture ; passe courte ciblée si le texte contredit la fiche de marque.
  // Jamais sur le texte écrit par la personne.
  const finalDoc = !ownsText && ctx.audienceAddress
    ? await lap("thread_address_ms", () => enforceCarouselAudienceAddress(cover.doc, ctx.audienceAddress!, remaining() < 15_000 ? 0 : Math.min(20_000, remaining() - 5_000)))
    : cover.doc;
  // Après couverture et tu/vous : le lien suit le texte réellement livré.
  const webFacts = photosOnly || ownsText ? [] : researchSourceWarnings(finalDoc, ctx.researchLinks);
  if (webFacts.length) finalDoc.structure_warnings = [...(finalDoc.structure_warnings || []), ...webFacts];
  return JSON.stringify(await rebindReceiptsAfterFinalTouches(beforeTouches, finalDoc));
}

/**
 * Couverture et tu/vous retouchent le texte APRÈS la relecture du fil. Un reçu
 * à jour avant ces retouches le reste (comme après les schémas) : sinon l'appli
 * affichait « Tu as modifié le texte » sur un carrousel jamais touché, et les
 * pistes du relecteur (chiffre sans source…) disparaissaient (passe du 16/10/2026).
 */
export async function rebindReceiptsAfterFinalTouches(before: string, doc: any): Promise<any> {
  const after = progressionMaterial(doc);
  if (after === before) return doc;
  const out = { ...doc };
  if (doc.progression_review?.reviewed_material === before) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(after));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    out.progression_review = { ...doc.progression_review, reviewed_material: after, reviewed_text_hash: hash, touched_after_review: true };
  }
  if (doc.photo_review?.reviewed_material === before) out.photo_review = { ...doc.photo_review, reviewed_material: after };
  return out;
}

/** Contrôle tu/vous du carrousel final (textes balisés, légende comprise). `budgetMs` 0 = mesure seule. */
export async function enforceCarouselAudienceAddress(doc: any, address: AudienceAddress, budgetMs: number, pass: AudienceAddressPass = _deps.audienceAddressPass): Promise<any> {
  try {
    const block = extractCarouselTexts(doc);
    const result = await enforceAudienceAddress(block, address, {
      pass: budgetMs > 0 ? pass : async (t) => t,
      abortTimeoutMs: budgetMs || undefined,
      logger: (m) => console.log(m),
    });
    if (result.receipt) console.log(JSON.stringify({ event: "carousel_audience_address", ...result.receipt }));
    return result.receipt?.applied ? reinjectCarouselTexts(doc, result.content) : doc;
  } catch (e) {
    console.error("[carousel-ai] contrôle tu/vous ignoré (carrousel intact) :", e);
    return doc;
  }
}
