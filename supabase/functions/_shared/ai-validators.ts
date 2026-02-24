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

export function safeParseAIResponse<T>(
  raw: string,
  schema: z.ZodSchema<T>
): T | null {
  // 1. Try direct JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 2. Try extracting from ```json ... ``` block
    const match = raw.match(/```json\s*([\s\S]*?)```/);
    if (match?.[1]) {
      try {
        parsed = JSON.parse(match[1].trim());
      } catch {
        console.error("[ai-validator] Failed to parse JSON from code block");
        return null;
      }
    } else {
      console.error("[ai-validator] Failed to parse JSON from raw response");
      return null;
    }
  }

  // 3. Validate with Zod
  const result = schema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  console.error(
    "[ai-validator] Zod validation failed:",
    JSON.stringify(result.error.issues, null, 2)
  );
  return null;
}
