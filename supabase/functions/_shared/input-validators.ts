import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/* ─── Shared Input Validation Schemas ─── */

/** Max text length for AI prompts to prevent token abuse */
const MAX_TEXT = 5000;
const MAX_SHORT_TEXT = 500;

/** Validate and parse request body with a Zod schema. Throws 400 on failure. */
export function validateInput<T>(raw: unknown, schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ValidationError(`Données invalides: ${issues}`);
  }
  return result.data;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/* ─── Reusable field schemas ─── */

export const uuidField = z.string().uuid();
export const optionalUuid = z.string().uuid().optional().nullable();
export const shortText = z.string().max(MAX_SHORT_TEXT);
export const longText = z.string().max(MAX_TEXT);
export const urlField = z.string().url().max(2048);
export const optionalUrl = z.string().url().max(2048).optional().nullable().or(z.literal(""));

/* ─── generate-content ─── */

export const GenerateContentSchema = z.object({
  type: z.enum(["suggest", "ideas", "bio", "bio-audit", "bio-generator", "launch-ideas", "launch-plan", "raw", "playground"]),
  format: shortText.optional().nullable(),
  sujet: shortText.optional().nullable(),
  profile: z.record(z.unknown()).optional().nullable(),
  canal: z.enum(["instagram", "linkedin", "blog", "pinterest"]).optional().nullable(),
  objectif: z.enum(["visibilite", "confiance", "vente", "credibilite"]).optional().nullable(),
  structure: shortText.optional().nullable(),
  accroche: shortText.optional().nullable(),
  angle: shortText.optional().nullable(),
  prompt: longText.optional().nullable(),
  playground_prompt: longText.optional().nullable(),
  workspace_id: optionalUuid,
  // bio-related fields
  bioText: longText.optional().nullable(),
  brandingContext: z.record(z.unknown()).optional().nullable(),
  differentiation: z.record(z.unknown()).optional().nullable(),
  ctaInfo: z.record(z.unknown()).optional().nullable(),
  structureChoice: shortText.optional().nullable(),
}).passthrough();

/* ─── create-checkout ─── */

export const CreateCheckoutSchema = z.object({
  priceId: z.string().regex(/^price_[a-zA-Z0-9]+$/, "Format de priceId invalide"),
  mode: z.enum(["subscription", "payment"]).optional(),
  successUrl: optionalUrl,
  cancelUrl: optionalUrl,
});

/* ─── assistant-chat ─── */

export const AssistantChatSchema = z.object({
  message: z.string().max(3000).optional(),
  conversation_history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(MAX_TEXT),
  })).max(20).optional(),
  confirmed_actions: z.array(z.record(z.unknown())).max(10).optional(),
  undo: z.boolean().optional(),
  workspace_id: optionalUuid,
});

/* ─── audit-branding ─── */

export const AuditBrandingSchema = z.object({
  site_url: optionalUrl,
  instagram_username: z.string().max(100).optional().nullable(),
  linkedin_url: optionalUrl,
  document_text: z.string().max(100000).optional().nullable(),
  free_text: z.string().max(10000).optional().nullable(),
  workspace_id: optionalUuid,
  social_links: z.array(z.object({
    type: z.string().max(50),
    url: z.string().url().max(2048),
  })).max(10).optional(),
});

/* ─── engagement-insight ─── */

export const EngagementInsightSchema = z.object({
  currentWeek: z.record(z.unknown()),
  history: z.array(z.record(z.unknown())).max(52).optional().nullable(),
});

/* ─── inspire-ai ─── */

export const InspireAiSchema = z.object({
  source_text: z.string().max(10000).optional().nullable(),
  source_type: z.string().max(50).optional(),
  images: z.array(z.unknown()).max(10).optional(),
  context: z.string().max(1000).optional().nullable(),
  workspace_id: optionalUuid,
});
