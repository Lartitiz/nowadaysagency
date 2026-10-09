import {
  type AnthropicOptions,
  callAnthropic,
  getModelForAction,
  type UsageSink,
} from "./anthropic.ts";
import { carouselEditorialFields } from "./carousel-editorial-review.ts";
import {
  COMMON,
  GLOBAL_REVIEW_TOOL,
  JUDGE,
} from "./carousel-editorial-contract.ts";
import { progressionMaterial } from "./carousel-editorial-snapshot.ts";

export const PROGRESSION_VERSION = "final-progression-v7-development";
export interface ProgressionSource {
  id: string;
  provenance: string;
  text: string;
}
export interface ProgressionResult {
  version: string;
  execution_status: "completed" | "invalid" | "unavailable" | "skipped";
  verdict: "acceptable" | "needs_repair" | "insufficient_evidence" | null;
  issues: string[];
  reviewed_text_hash: string;
  // Generated text only. Enables synchronous invalidation in editors/autosave;
  // no private branding, request, API credentials or image bytes in this receipt.
  reviewed_material: string;
  report?: Record<string, any>;
  validation_details?: Record<string, unknown>;
  format_retry?: { attempted: boolean; initial_reason: string };
  /** Réparation voulue mais non lancée : son délai n'aurait pas couvert une réécriture complète. */
  repair_skipped?: "time-budget";
  /** scope local = seules `slides` (numéros à partir de 1) réécrites ; expected_ms = durée prévue pour décider du lancement. */
  repair?: { attempted: true; accepted: boolean; trigger: "needs_repair" | "minor_continuity"; scope?: "local" | "global"; global_reason?: string; slides?: number[]; expected_ms?: number; reason?: string; candidate_status?: string; candidate_verdict?: string | null };
  reason?: string;
  usage?: UsageSink;
}

export async function progressionReceipt(
  doc: any,
  status: ProgressionResult["execution_status"],
  reason?: string,
): Promise<ProgressionResult> {
  const material = progressionMaterial(doc);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  return {
    version: PROGRESSION_VERSION,
    execution_status: status,
    verdict: null,
    issues: [],
    reviewed_material: material,
    reviewed_text_hash: Array.from(
      new Uint8Array(digest),
      (b) => b.toString(16).padStart(2, "0"),
    ).join(""),
    ...(reason ? { reason } : {}),
  };
}

/** Completeness, references and evidence are enforced independently of model prose. */
export function validateProgressionReport(
  report: any,
  doc: any,
  sources: ProgressionSource[],
): string | null {
  const ids = (doc.slides || []).map((_: unknown, i: number) => `slides.${i}`);
  const sourceIds = new Set(sources.map((s) => s.id));
  const canonicalQuote = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const fields = carouselEditorialFields(doc);
  const str = (s: unknown) => typeof s === "string" && !!s.trim();
  if (
    !report || !str(report.idea_read) || !str(report.conclusion) ||
    !Array.isArray(report.limits) ||
    !report.limits.every((s: unknown) => typeof s === "string")
  ) return "missing-summary";
  const trajectory = report.trajectory;
  const slideFields = fields.filter((f) => f.id.startsWith("slides."));
  if (!trajectory || typeof trajectory !== "object") return "missing-trajectory";
  if (!["developed_idea", "requested_series", "visual_only", "descriptive_catalogue"].includes(trajectory.kind)) return "trajectory-kind";
  for (const key of ["starting_point", "landing", "reason"]) if (!str(trajectory[key])) return `trajectory-${key}:nonempty-string-required`;
  if (!Array.isArray(trajectory.field_ids) || (slideFields.length > 0 && !trajectory.field_ids.length) ||
    !trajectory.field_ids.every((id: string) => slideFields.some((f) => f.id === id))) return "trajectory-evidence";
  if (!Array.isArray(trajectory.request_source_ids) ||
    !trajectory.request_source_ids.every((id: string) => sources.some((s) => s.id === id && s.provenance === "user")) ||
    (trajectory.kind === "requested_series" && !trajectory.request_source_ids.length)) return "trajectory-request";
  if (trajectory.kind === "visual_only" && slideFields.length) return "trajectory-visual-text";
  if (
    !["acceptable", "needs_repair", "insufficient_evidence"].includes(
      report.verdict,
    )
  ) return "invalid-verdict";
  if (!Array.isArray(report.slides) || report.slides.length !== ids.length) {
    return "slide-coverage";
  }
  if (
    report.slides.some((s: any, i: number) =>
      s.id !== ids[i] || !str(s.contribution) || !Array.isArray(s.source_ids) ||
      !s.source_ids.every((id: unknown) =>
        typeof id === "string" && sourceIds.has(id)
      )
    )
  ) return "slide-reference";
  if (
    !Array.isArray(report.boundaries) ||
    report.boundaries.length !== Math.max(0, ids.length - 1)
  ) return "boundary-coverage";
  for (const [i, b] of report.boundaries.entries()) {
    if (!b || b.from !== ids[i] || b.to !== ids[i + 1]) return `boundary-reference:${i}:pair`;
    for (const key of ["inherits", "advances"]) if (!str(b[key])) return `boundary-reference:${i}:${key}:nonempty-string-required`;
    if (!["progression", "common_criterion", "visual_pause", "rupture"].includes(b.kind)) return `boundary-reference:${i}:kind`;
  }
  for (const [i, boundary] of report.boundaries.entries()) {
    for (const side of ["from", "to"] as const) {
      const available = fields.filter((f) => f.id.startsWith(boundary[side] + "."));
      const references = boundary[`${side}_field_ids`];
      if (!Array.isArray(references) || (available.length > 0 && !references.length) ||
        !references.every((id: string) => available.some((f) => f.id === id))) return `boundary-evidence:${i}:${side}`;
    }
  }
  if (!Array.isArray(report.defects)) return "missing-defects";
  const kinds = [
    "unclear_idea",
    "promise",
    "juxtaposition",
    "repetition",
    "rupture",
    "ending",
    "unsupported",
    "voice",
    "omission",
    "raw_photo_text",
  ];
  for (const [i, d] of report.defects.entries()) {
    if (!d || !Array.isArray(d.slide_ids) || !d.slide_ids.length ||
      !d.slide_ids.every((id: string) => ids.includes(id))) return `defect-slide-reference:${i}`;
    if (!["major", "minor"].includes(d.severity) || !kinds.includes(d.type)) return `defect-classification:${i}`;
    const localFields = fields.filter((f) => d.slide_ids.some((id: string) => f.id.startsWith(id + ".")) || f.id.startsWith("caption."));
    if (d.field_ids !== undefined && (!Array.isArray(d.field_ids) || !d.field_ids.length ||
      !d.field_ids.every((id: string) => localFields.some((f) => f.id === id)))) return `defect-field-reference:${i}`;
    if (!str(d.excerpt) || !localFields.some((f) => canonicalQuote(f.text).includes(canonicalQuote(d.excerpt)))) return `defect-excerpt:${i}`;
    if (!str(d.reason) || !str(d.repair)) return `defect-explanation:${i}`;
  }
  const major = report.defects.some((d: any) => d.severity === "major");
  if (
    report.verdict === "acceptable" &&
    (major || trajectory.kind === "descriptive_catalogue" || report.boundaries.some((b: any) => b.kind === "rupture"))
  ) return "contradictory-verdict";
  if (report.verdict === "needs_repair" && !report.defects.length &&
    trajectory.kind !== "descriptive_catalogue" &&
    !report.boundaries.some((b: any) => b.kind === "rupture")) {
    return "unexplained-repair";
  }
  if (report.verdict === "insufficient_evidence" && !report.limits.length) {
    return "unexplained-limit";
  }
  return null;
}

/** Projection envoyée au juge : texte, ordre, types et no_text, sans photo posée. */
export function withoutPhotoAssignments(material: string): any {
  const m = JSON.parse(material);
  return { ...m, slides: (m.slides || []).map(({ photo: _photo, ...slide }: any) => slide) };
}

// Remarques sur le CHOIX des photos (même photo sur plusieurs slides, photo
// réutilisée, choix ou association d'image) : décidé après le juge, donc hors
// de son ressort. Les motifs restent étroits pour ne pas toucher un défaut de
// texte qui cite une photo (« cette photo montre… » non étayé, texte sur photo brute).
const PHOTO_CHOICE = /\b(?:m[eê]mes?|identiques?)\s+(?:photos?|images?|visuels?)\b|\b(?:photos?|images?|visuels?)\s+(?:identiques?|r[ée]p[ée]t[ée]e?s?|r[ée]utilis[ée]e?s?|dupliqu[ée]e?s?|en double|reprises?)\b|\br[ée]p[ée]tition\s+(?:de\s+la\s+|des\s+|d['’]une\s+|de\s+l['’])?(?:photos?|images?|visuels?)\b|\b(?:choix|attribution|association|r[ée]partition)\s+(?:de\s+la\s+|des\s+|d['’]une\s+|de\s+l['’])?(?:photos?|images?|visuels?)\b|\b(?:photos?|images?)\s+(?:n°\s*)?\d+\s+(?:est\s+)?(?:r[ée]utilis|r[ée]p[ée]t|revient|r[ée]appara)/i;

export function isPhotoChoiceDefect(defect: any): boolean {
  if (!defect || defect.type === "raw_photo_text") return false;
  return PHOTO_CHOICE.test(`${defect.reason ?? ""} ${defect.repair ?? ""}`);
}

// Durée d'UN appel du juge : il écrit une entrée par slide et par frontière.
// Mesuré en ligne : 31-42 s à 12-14 slides, 33 s puis plus de 35 s à 10 slides
// en photo (09/10/2026, « Anthropic fetch timeout après 35000ms »). 60 s
// jusqu'à 14 slides, +3 s par slide au-delà.
export const progressionJudgeCallMs = (slides: number): number =>
  60_000 + Math.max(0, slides - 14) * 3_000;
// Temps propre à la relance de format, en plus du premier appel : le 09/10 la
// relance n'avait que les 12 s restantes des 45 s et était coupée.
export const PROGRESSION_FORMAT_RETRY_MS = 45_000;

export async function reviewCarouselProgression(doc: any, opts: {
  sources: ProgressionSource[];
  sourceContext?: string;
  preserveStructure?: boolean;
  call?: (options: AnthropicOptions, usage?: UsageSink) => Promise<string>;
  /** Temps total du contrôle (premier appel + relance de format). */
  abortTimeoutMs?: number;
  /** Plafond de CHAQUE appel ; par défaut le temps total. */
  callTimeoutMs?: number;
}): Promise<ProgressionResult> {
  const receipt = await progressionReceipt(doc, "unavailable");
  if (!Array.isArray(doc?.slides) || !doc.slides.length) {
    return { ...receipt, execution_status: "skipped", reason: "no-slides" };
  }
  const slideIds = doc.slides.map((_: unknown, i: number) => `slides.${i}`);
  const sourceIds = opts.sources.map((source) => source.id);
  const expectedBoundaries = slideIds.slice(1).map((to: string, i: number) => ({ from: slideIds[i], to }));
  const tool: any = structuredClone(GLOBAL_REVIEW_TOOL);
  const props = tool.input_schema.properties;
  props.idea_read.minLength = 1;
  props.idea_read.description = "Une phrase non vide : idée réellement lue dans le texte.";
  props.conclusion.minLength = 1;
  props.conclusion.description = "Une phrase non vide expliquant si la conclusion est préparée. Même si aucune conclusion n'est présente, décrire ce constat.";
  props.limits.description = "Tableau de chaînes ; [] si aucune limite, jamais null ni un objet.";
  props.slides.minItems = props.slides.maxItems = slideIds.length;
  props.slides.items.properties.id.enum = slideIds;
  props.slides.items.properties.contribution.minLength = 1;
  if (sourceIds.length) props.slides.items.properties.source_ids.items.enum = sourceIds;
  else props.slides.items.properties.source_ids.maxItems = 0;
  props.boundaries.minItems = props.boundaries.maxItems = expectedBoundaries.length;
  const boundarySchema = props.boundaries.items;
  boundarySchema.required = boundarySchema.required.filter((key: string) => key !== "from" && key !== "to");
  delete boundarySchema.properties.from;
  delete boundarySchema.properties.to;
  boundarySchema.required.push("boundary_id");
  boundarySchema.properties.boundary_id = { type: "string", ...(expectedBoundaries.length ? { enum: expectedBoundaries.map((b: any) => `${b.from}->${b.to}`) } : {}) };
  for (const key of ["inherits", "advances"]) {
    boundarySchema.properties[key].minLength = 1;
    boundarySchema.properties[key].description = "Phrase non vide. Si le lien manque, décrire explicitement ce qui manque ; ne pas laisser vide et ne pas inventer de raccord.";
  }
  props.defects.items.properties.slide_ids.items.enum = slideIds;
  // Select evidence by stable IDs; copying quotations was invalidating whole reviews.
  // The program attaches the exact source text, never a model-reconstructed quote.
  const fields = carouselEditorialFields(doc);
  const rawPhotoSlideIds = new Set<string>(doc.slides.flatMap((s: any, i: number) => s?.no_overlay || doc.no_overlay ? [`slides.${i}`] : []));
  const slideFieldIds = fields.filter((f) => f.id.startsWith("slides.")).map((f) => f.id);
  const requestSourceIds = opts.sources.filter((s) => s.provenance === "user").map((s) => s.id);
  props.trajectory.properties.field_ids.items = { type: "string", ...(slideFieldIds.length ? { enum: slideFieldIds } : {}) };
  if (!slideFieldIds.length) props.trajectory.properties.field_ids.maxItems = 0;
  props.trajectory.properties.request_source_ids.items = { type: "string", ...(requestSourceIds.length ? { enum: requestSourceIds } : {}) };
  if (!requestSourceIds.length) props.trajectory.properties.request_source_ids.maxItems = 0;
  for (const side of ["from", "to"]) {
    props.boundaries.items.required.push(`${side}_field_ids`);
    props.boundaries.items.properties[`${side}_field_ids`] = { type: "array",
      items: { type: "string", ...(fields.length ? { enum: fields.map((f) => f.id) } : {}) },
      description: `Champs visibles de la slide ${side} qui portent réellement ce lien ; [] uniquement si cette slide n'a aucun texte.` };
  }
  const defectSchema = props.defects.items;
  defectSchema.required = defectSchema.required.filter((key: string) => key !== "excerpt");
  delete defectSchema.properties.excerpt;
  defectSchema.required.push("field_ids");
  defectSchema.properties.field_ids = { type: "array", minItems: 1,
    items: { type: "string", ...(fields.length ? { enum: fields.map((f) => f.id) } : {}) },
    description: "IDs des champs visibles concernés, dans les slides citées (ou caption pour un défaut de légende). Pour une omission, choisis le passage qui manque d'explication. Ne recopie pas le texte." };
  if (!fields.length) props.defects.maxItems = 0;

  const input = JSON.stringify({
    expected_slide_ids_in_order: slideIds,
    expected_boundaries_in_order: expectedBoundaries,
    expected_boundary_ids_in_order: expectedBoundaries.map((b: any) => `${b.from}->${b.to}`),
    allowed_source_ids: sourceIds,
    sources: opts.sources,
    // Do not send the writer's plan: it was filling gaps absent from the published text.
    // Ni la photo posée sur chaque slide : le juge passe AVANT matchFinalPhotos,
    // qui choisit les photos à la fin. Les numéros vus ici étaient provisoires
    // (attribués à tour de rôle) et le juge reprochait « la même photo répétée
    // sur 3 slides » (09/10/2026). Le reçu, lui, garde les photos.
    sequence: withoutPhotoAssignments(receipt.reviewed_material),
  });
  // No invisible truncation: preserve the draft and report the unperformed check.
  if (input.length > 100_000) {
    return {
      ...receipt,
      execution_status: "skipped",
      reason: "context-budget",
    };
  }
  const usage: UsageSink = {};
  const startedAt = Date.now();
  const budgetMs = opts.abortTimeoutMs ?? 45_000;
  const callMs = Math.min(opts.callTimeoutMs ?? budgetMs, budgetMs);
  let formatRetry: ProgressionResult["format_retry"];
  // Une ligne de journal par contrôle : durée réelle, issue et motif de refus
  // du validateur (jamais le texte, les sources ni la réponse du modèle).
  const logOutcome = (result: ProgressionResult, extra: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({
      type: "carousel_progression_review",
      status: result.execution_status,
      verdict: result.verdict ?? null,
      reason: result.reason ?? null,
      format_retry: result.format_retry ?? null,
      slides: doc.slides.length,
      elapsed_ms: Date.now() - startedAt,
      budget_ms: budgetMs,
      call_ms: callMs,
      ...extra,
    }));
    return result;
  };
  const invoke = async (options: AnthropicOptions) => {
    const callUsage: UsageSink = {};
    try { return await (opts.call || callAnthropic)(options, callUsage); }
    finally {
      for (const [key, value] of Object.entries(callUsage)) {
        (usage as any)[key] = typeof value === "number" ? ((usage as any)[key] || 0) + value : value;
      }
    }
  };
  try {
    const options: AnthropicOptions = {
      model: getModelForAction("carousel"),
      system: COMMON + "\n\n" + JUDGE + "\nContrat de sortie : recopie exactement les IDs attendus, dans l'ordre fourni, sans renuméroter depuis 1. source_ids utilise seulement allowed_source_ids ; [] si aucune source utile. idea_read et conclusion sont des phrases non vides. limits est toujours un tableau de chaînes, éventuellement vide. Ne remplace aucun champ du schéma par une autre forme. Pour chaque défaut, sélectionne field_ids dans sequence.fields ; le programme joindra leurs textes exacts. Ne fournis pas de citation reconstruite. Pour chaque frontière, sélectionne boundary_id dans expected_boundary_ids_in_order, dans cet ordre ; le programme fournira from et to. inherits et advances sont des phrases non vides, même si elles constatent une absence de lien. Pour chaque frontière, from_field_ids et to_field_ids référencent exclusivement les champs visibles des deux slides voisines. Décris uniquement le lien porté par ces textes. Une photo et les sources peuvent vérifier un fait, jamais fournir un raccord absent. kind=rupture signifie un raccord MANQUANT ou INCOMPRÉHENSIBLE : jamais un contraste argumentatif utile, une nuance, une transition du constat vers les preuves ou une simple variation visuelle. Toute rupture ou défaut majeur impose needs_repair ; décris précisément le lien manquant. Un verdict favorable ne peut pas annuler ce constat.",
      messages: [{ role: "user", content: input }],
      tool,
      max_tokens: Math.min(8192, 2048 + doc.slides.length * 400),
      abortTimeoutMs: callMs,
      maxRetries: 0,
      keepDashes: true,
    };
    let raw = await invoke(options);
    let report: any;
    const parseAndValidate = () => {
      try { report = JSON.parse(raw); }
      catch { report = null; return "invalid-json"; }
      // Le choix et la répétition des photos ne sont pas jugés ici (filet si le
      // modèle en parle quand même) : ni affichés, ni cause de réparation.
      if (Array.isArray(report?.defects)) {
        const before = report.defects.length;
        report.defects = report.defects.filter((defect: any) => !isPhotoChoiceDefect(defect));
        const dropped = before - report.defects.length;
        if (dropped) {
          report.dropped_photo_choice_defects = dropped;
          if (report.verdict === "needs_repair" && !report.defects.length &&
            report.trajectory?.kind !== "descriptive_catalogue" &&
            !(Array.isArray(report.boundaries) && report.boundaries.some((b: any) => b?.kind === "rupture"))) {
            report = { ...report, verdict: "acceptable", model_verdict: "needs_repair" };
          }
        }
      }
      // « Texte sur photo brute » ne vaut que pour une slide marquée no_text.
      // Vu en ligne le 08/10/2026 : en « Tes photos en fond », le juge prenait
      // le texte voulu sur chaque photo pour ce défaut et l'affichait à
      // l'utilisatrice. Le reproche est retiré des slides qui portent du texte.
      if (Array.isArray(report?.defects)) {
        const before = report.defects.length;
        report.defects = report.defects.flatMap((defect: any) => {
          if (defect?.type !== "raw_photo_text" || !Array.isArray(defect.slide_ids)) return [defect];
          const slideIds = defect.slide_ids.filter((id: string) => rawPhotoSlideIds.has(id));
          return slideIds.length ? [{ ...defect, slide_ids: slideIds }] : [];
        });
        const dropped = before - report.defects.length;
        if (dropped) {
          report.dropped_raw_photo_defects = dropped;
          if (report.verdict === "needs_repair" && !report.defects.length &&
            report.trajectory?.kind !== "descriptive_catalogue" &&
            !(Array.isArray(report.boundaries) && report.boundaries.some((b: any) => b?.kind === "rupture"))) {
            report = { ...report, verdict: "acceptable", model_verdict: "needs_repair" };
          }
        }
      }
      if (Array.isArray(report?.boundaries)) {
        report.boundaries = report.boundaries.map((boundary: any) => {
          if (boundary?.boundary_id === undefined) return boundary;
          const pair = expectedBoundaries.find((b: any) => boundary.boundary_id === `${b.from}->${b.to}`);
          // Only a known complete pair can supply its references. Never infer
          // a missing link or move a finding to a different pair of slides.
          return pair ? { ...boundary, ...pair } : { ...boundary, from: null, to: null };
        });
      }
      // A structural inconsistency must never produce approval. Keep every finding,
      // but derive the conservative verdict instead of asking the model to vote again.
      if (report?.verdict === "acceptable" && (
        report.trajectory?.kind === "descriptive_catalogue" ||
        (Array.isArray(report.defects) && report.defects.some((d: any) => d?.severity === "major")) ||
        (Array.isArray(report.boundaries) && report.boundaries.some((b: any) => b?.kind === "rupture"))
      )) report = { ...report, verdict: "needs_repair", model_verdict: "acceptable" };
      if (Array.isArray(report?.defects)) {
        report.defects = report.defects.map((defect: any) => {
          if (!Array.isArray(defect?.field_ids) || !defect.field_ids.length) return defect;
          const evidence = defect.field_ids.map((id: string) => fields.find((f) => f.id === id));
          if (evidence.some((f: any) => !f)) return defect;
          return { ...defect, excerpt: evidence[0]!.text,
            evidence: evidence.map((f: any) => ({ field_id: f.id, text: f.text })) };
        });
      }
      return validateProgressionReport(report, doc, opts.sources);
    };
    let error = parseAndValidate();
    let retryError: string | undefined;
    if (error) {
      const initialVerdict = report?.verdict;
      const remainingMs = budgetMs - (Date.now() - startedAt);
      formatRetry = { attempted: false, initial_reason: error };
      if (remainingMs >= 8_000 && input.length + raw.length < 100_000) {
        formatRetry.attempted = true;
        try {
          const retryRaw = await invoke({ ...options, abortTimeoutMs: Math.min(callMs, remainingMs),
            messages: [options.messages[0], { role: "assistant", content: raw }, {
              role: "user",
              content: `Ton rapport a été refusé par le validateur : ${error}. Corrige uniquement son format et ses références, sans réécrire le carrousel ni effacer un défaut pour obtenir acceptable. Utilise les IDs attendus et les valeurs du schéma. Pour chaque défaut, field_ids doit sélectionner les IDs exacts des champs de sequence.fields dans les slides citées, ou caption pour la légende. Le programme joint les textes exacts. Une omission se rattache au passage qui aurait besoin de l’explication. Garde une justification et une réparation non vides. Si un défaut ne peut pas être étayé, signale la limite au lieu d'inventer une preuve. Renvoie le rapport complet via le même outil.`,
            }],
          });
          raw = retryRaw;
          error = parseAndValidate();
          if (!error && ["needs_repair", "insufficient_evidence"].includes(initialVerdict) && report.verdict === "acceptable") {
            error = "format-verdict-regression";
          }
        } catch (err) {
          /* Keep the initial invalid result; never convert failure to approval. */
          retryError = String((err as any)?.message ?? err).slice(0, 160);
        }
      }
    }
    if (error) {
      // Record shape only: diagnose provider schema drift without persisting
      // unvalidated prose or any private source material in public projections.
      const shape = (value: unknown) => Array.isArray(value)
        ? { type: "array", length: value.length, item_types: [...new Set(value.map((v) => typeof v))] }
        : { type: value === null ? "null" : typeof value, ...(typeof value === "string" ? { length: value.trim().length } : {}) };
      const validationDetails = Object.fromEntries(Object.entries(report ?? {}).map(([key, value]) => [key, shape(value)]));
      return logOutcome({ ...receipt, execution_status: "invalid", reason: error, usage, format_retry: formatRetry,
        validation_details: validationDetails,
      }, { validation_details: validationDetails, ...(retryError ? { retry_error: retryError } : {}) });
    }
    const issues = report.defects.map((d: any) =>
      `${
        d.slide_ids.map((id: string) => `slide ${Number(id.split(".")[1]) + 1}`)
          .join(", ")
      } : ${d.reason} ${d.repair}`
    );
    if (report.trajectory.kind === "descriptive_catalogue") {
      issues.unshift(`Propos à reconstruire : ${report.trajectory.reason} Le texte doit développer une idée étayée de bout en bout ; relier les descriptions ne suffit pas. Conserver les faits et les invariants du scénario.`);
    }
    for (const boundary of report.boundaries.filter((b: any) => b.kind === "rupture")) {
      issues.push(`Transition slides ${Number(boundary.from.split(".")[1]) + 1} → ${Number(boundary.to.split(".")[1]) + 1} à réparer. Reprise : ${boundary.inherits}. Avancée : ${boundary.advances}. Rétablir un lien explicite sans inventer de fait ni changer le scénario.`);
    }
    if (report.verdict === "insufficient_evidence") {
      issues.push(
        "Une affirmation décisive reste à vérifier avec les sources disponibles.",
      );
    }
    return logOutcome({
      ...receipt,
      execution_status: "completed",
      verdict: report.verdict,
      report,
      issues,
      usage,
      ...(formatRetry ? { format_retry: formatRetry } : {}),
    }, { defects: report.defects.length });
  } catch (err) {
    return logOutcome({
      ...receipt,
      execution_status: "unavailable",
      reason: "provider-failure",
      usage,
    }, { error: String((err as any)?.message ?? err).slice(0, 160) });
  }
}

export function progressionWarnings(receipt: ProgressionResult): string[] {
  if (receipt.execution_status !== "completed") {
    return [
      "Le contrôle final du fil n’a pas abouti. Relis l’enchaînement des slides avant de publier.",
    ];
  }
  return receipt.issues;
}
