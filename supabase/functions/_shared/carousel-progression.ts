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

export const PROGRESSION_VERSION = "final-progression-v3";
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
  const text = canonicalQuote(carouselEditorialFields(doc).map((f) => f.text).join("\n"));
  const str = (s: unknown) => typeof s === "string" && !!s.trim();
  if (
    !report || !str(report.idea_read) || !str(report.conclusion) ||
    !Array.isArray(report.limits) ||
    !report.limits.every((s: unknown) => typeof s === "string")
  ) return "missing-summary";
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
  if (
    report.boundaries.some((b: any, i: number) =>
      b.from !== ids[i] || b.to !== ids[i + 1] || !str(b.inherits) ||
      !str(b.advances) ||
      !["progression", "common_criterion", "visual_pause", "rupture"].includes(
        b.kind,
      )
    )
  ) return "boundary-reference";
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
    if (!str(d.excerpt) || !text.includes(canonicalQuote(d.excerpt))) return `defect-excerpt:${i}`;
    if (!str(d.reason) || !str(d.repair)) return `defect-explanation:${i}`;
  }
  const major = report.defects.some((d: any) => d.severity === "major");
  if (
    report.verdict === "acceptable" &&
    (major || report.boundaries.some((b: any) => b.kind === "rupture"))
  ) return "contradictory-verdict";
  if (report.verdict === "needs_repair" && !report.defects.length &&
    !report.boundaries.some((b: any) => b.kind === "rupture")) {
    return "unexplained-repair";
  }
  if (report.verdict === "insufficient_evidence" && !report.limits.length) {
    return "unexplained-limit";
  }
  return null;
}

export async function reviewCarouselProgression(doc: any, opts: {
  sources: ProgressionSource[];
  sourceContext?: string;
  preserveStructure?: boolean;
  call?: (options: AnthropicOptions, usage?: UsageSink) => Promise<string>;
  abortTimeoutMs?: number;
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
  for (const name of ["from", "to"]) props.boundaries.items.properties[name].enum = slideIds;
  props.defects.items.properties.slide_ids.items.enum = slideIds;
  const input = JSON.stringify({
    expected_slide_ids_in_order: slideIds,
    expected_boundaries_in_order: expectedBoundaries,
    allowed_source_ids: sourceIds,
    sources: opts.sources,
    plan: doc.fil ?? null,
    editorial_intent: doc.editorial_intent ?? null,
    sequence: JSON.parse(receipt.reviewed_material),
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
  let formatRetry: ProgressionResult["format_retry"];
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
      system: COMMON + "\n\n" + JUDGE + "\nContrat de sortie : recopie exactement les IDs attendus, dans l'ordre fourni, sans renuméroter depuis 1. source_ids utilise seulement allowed_source_ids ; [] si aucune source utile. idea_read et conclusion sont des phrases non vides. limits est toujours un tableau de chaînes, éventuellement vide. Ne remplace aucun champ du schéma par une autre forme. kind=rupture signifie un raccord MANQUANT ou INCOMPRÉHENSIBLE : jamais un contraste argumentatif utile, une nuance, une transition du constat vers les preuves ou une simple variation visuelle. Toute rupture ou défaut majeur impose needs_repair ; décris précisément le lien manquant. Un verdict favorable ne peut pas annuler ce constat.",
      messages: [{ role: "user", content: input }],
      tool,
      max_tokens: Math.min(8192, 2048 + doc.slides.length * 400),
      abortTimeoutMs: budgetMs,
      maxRetries: 0,
      keepDashes: true,
    };
    let raw = await invoke(options);
    let report: any;
    const parseAndValidate = () => {
      try { report = JSON.parse(raw); }
      catch { report = null; return "invalid-json"; }
      // A structural inconsistency must never produce approval. Keep every finding,
      // but derive the conservative verdict instead of asking the model to vote again.
      if (report?.verdict === "acceptable" && (
        (Array.isArray(report.defects) && report.defects.some((d: any) => d?.severity === "major")) ||
        (Array.isArray(report.boundaries) && report.boundaries.some((b: any) => b?.kind === "rupture"))
      )) report = { ...report, verdict: "needs_repair", model_verdict: "acceptable" };
      return validateProgressionReport(report, doc, opts.sources);
    };
    let error = parseAndValidate();
    if (error) {
      const initialVerdict = report?.verdict;
      const remainingMs = budgetMs - (Date.now() - startedAt);
      formatRetry = { attempted: false, initial_reason: error };
      if (remainingMs >= 8_000 && input.length + raw.length < 100_000) {
        formatRetry.attempted = true;
        try {
          const retryRaw = await invoke({ ...options, abortTimeoutMs: remainingMs,
            messages: [options.messages[0], { role: "assistant", content: raw }, {
              role: "user",
              content: `Ton rapport a été refusé par le validateur : ${error}. Corrige uniquement son format et ses références, sans réécrire le carrousel ni effacer un défaut pour obtenir acceptable. Utilise les IDs attendus et les valeurs du schéma. Pour chaque défaut, excerpt doit copier un court passage CONTIGU et présent dans sequence.fields[].text, sans guillemets ajoutés ni points de suspension ; une omission se rattache au passage qui aurait besoin de l'explication. Cite le passage concerné et garde une justification et une réparation non vides. Si un défaut ne peut pas être étayé, signale la limite au lieu d'inventer une preuve. Renvoie le rapport complet via le même outil.`,
            }],
          });
          raw = retryRaw;
          error = parseAndValidate();
          if (!error && ["needs_repair", "insufficient_evidence"].includes(initialVerdict) && report.verdict === "acceptable") {
            error = "format-verdict-regression";
          }
        } catch { /* Keep the initial invalid result; never convert failure to approval. */ }
      }
    }
    if (error) {
      // Record shape only: diagnose provider schema drift without persisting
      // unvalidated prose or any private source material in public projections.
      const shape = (value: unknown) => Array.isArray(value)
        ? { type: "array", length: value.length, item_types: [...new Set(value.map((v) => typeof v))] }
        : { type: value === null ? "null" : typeof value, ...(typeof value === "string" ? { length: value.trim().length } : {}) };
      return { ...receipt, execution_status: "invalid", reason: error, usage, format_retry: formatRetry,
        validation_details: Object.fromEntries(Object.entries(report ?? {}).map(([key, value]) => [key, shape(value)])),
      };
    }
    const issues = report.defects.map((d: any) =>
      `${
        d.slide_ids.map((id: string) => `slide ${Number(id.split(".")[1]) + 1}`)
          .join(", ")
      } : ${d.reason} ${d.repair}`
    );
    for (const boundary of report.boundaries.filter((b: any) => b.kind === "rupture")) {
      issues.push(`Transition slides ${Number(boundary.from.split(".")[1]) + 1} → ${Number(boundary.to.split(".")[1]) + 1} à réparer. Reprise : ${boundary.inherits}. Avancée : ${boundary.advances}. Rétablir un lien explicite sans inventer de fait ni changer le scénario.`);
    }
    if (report.verdict === "insufficient_evidence") {
      issues.push(
        "Une affirmation décisive reste à vérifier avec les sources disponibles.",
      );
    }
    return {
      ...receipt,
      execution_status: "completed",
      verdict: report.verdict,
      report,
      issues,
      usage,
      ...(formatRetry ? { format_retry: formatRetry } : {}),
    };
  } catch {
    return {
      ...receipt,
      execution_status: "unavailable",
      reason: "provider-failure",
      usage,
    };
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
