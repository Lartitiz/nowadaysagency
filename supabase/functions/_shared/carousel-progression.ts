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

export const PROGRESSION_VERSION = "final-progression-v1";
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
  const text = carouselEditorialFields(doc).map((f) => f.text).join("\n");
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
  if (
    report.defects.some((d: any) =>
      !Array.isArray(d.slide_ids) || !d.slide_ids.length ||
      !d.slide_ids.every((id: string) => ids.includes(id)) ||
      !["major", "minor"].includes(d.severity) || !kinds.includes(d.type) ||
      !str(d.excerpt) || !text.includes(d.excerpt) || !str(d.reason) ||
      !str(d.repair)
    )
  ) return "defect-evidence";
  const major = report.defects.some((d: any) => d.severity === "major");
  if (
    report.verdict === "acceptable" &&
    (major || report.boundaries.some((b: any) => b.kind === "rupture"))
  ) return "contradictory-verdict";
  if (report.verdict === "needs_repair" && !report.defects.length) {
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
  const input = JSON.stringify({
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
  try {
    const raw = await (opts.call || callAnthropic)({
      model: getModelForAction("carousel"),
      system: COMMON + "\n\n" + JUDGE,
      messages: [{ role: "user", content: input }],
      tool: GLOBAL_REVIEW_TOOL,
      max_tokens: Math.min(8192, 2048 + doc.slides.length * 400),
      abortTimeoutMs: opts.abortTimeoutMs ?? 45_000,
      keepDashes: true,
    }, usage);
    let report: any;
    try {
      report = JSON.parse(raw);
    } catch {
      return {
        ...receipt,
        execution_status: "invalid",
        reason: "invalid-json",
        usage,
      };
    }
    const error = validateProgressionReport(report, doc, opts.sources);
    if (error) {
      // Record shape only: diagnose provider schema drift without persisting
      // unvalidated prose or any private source material in public projections.
      const shape = (value: unknown) => Array.isArray(value)
        ? { type: "array", length: value.length, item_types: [...new Set(value.map((v) => typeof v))] }
        : { type: value === null ? "null" : typeof value, ...(typeof value === "string" ? { length: value.trim().length } : {}) };
      return { ...receipt, execution_status: "invalid", reason: error, usage,
        validation_details: Object.fromEntries(Object.entries(report ?? {}).map(([key, value]) => [key, shape(value)])),
      };
    }
    const issues = report.defects.map((d: any) =>
      `${
        d.slide_ids.map((id: string) => `slide ${Number(id.split(".")[1]) + 1}`)
          .join(", ")
      } : ${d.reason} ${d.repair}`
    );
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
