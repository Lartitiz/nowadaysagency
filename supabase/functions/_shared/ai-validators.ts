import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/* ─── Schemas ─── */

export const ContentResponseSchema = z.object({
  accroche: z.string(),
  corps: z.string(),
  cta: z.string(),
  hashtags: z.array(z.string()).optional(),
});

export const AuditResponseSchema = z.object({
  score_global: z.number().min(0).max(100),
  sections: z.array(
    z.object({
      nom: z.string(),
      score: z.number(),
      diagnostic: z.string(),
      recommandations: z.array(z.string()),
    })
  ),
});

export const CoachingResponseSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      pourquoi: z.string().optional(),
    })
  ),
});

/* ─── Utility ─── */

export function validateRequiredFields(data: Record<string, unknown>, required: string[]): string | null {
  for (const field of required) {
    const value = data[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      return `Le champ "${field}" est requis.`;
    }
  }
  return null;
}
