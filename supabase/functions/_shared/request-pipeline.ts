/**
 * Shared request pipeline for AI edge functions.
 *
 * Aggregates the boilerplate every AI function repeats:
 *   1. CORS preflight
 *   2. Auth (JWT validation)
 *   3. Demo user guard
 *   4. Rate limit (in-memory sliding window)
 *   5. Plan quota (per category, monthly)
 *
 * Notes:
 * - Does NOT read req.body. Callers parse + validate (Zod) themselves
 *   and pass `workspaceId` if relevant. This keeps schema validation
 *   colocated with each function and avoids the "body already consumed"
 *   problem since req.json() can only be called once.
 * - Quota category is decided by the caller (some functions route to
 *   different categories per step). Pipeline is called AFTER that
 *   decision, not blindly upfront.
 * - logUsage() stays in the caller (logged after AI success).
 */

import { getCorsHeaders } from "./cors.ts";
import { authenticateRequest, AuthError } from "./auth.ts";
import { isDemoUser } from "./guard-demo.ts";
import { checkRateLimit, rateLimitResponse } from "./rate-limiter.ts";
import { checkQuota, quotaDeniedResponse, type QuotaResult } from "./plan-limiter.ts";

export interface PipelineOptions {
  /** Quota category. If `skipQuota` is true, ignored. */
  category?: string;
  /** Workspace id for quota scoping (optional). */
  workspaceId?: string;
  /** Override default rate limit (20 req / 60s). */
  rateLimit?: { max: number; windowMs: number };
  /** Skip quota check (for non-AI endpoints, e.g. dictation passthrough). */
  skipQuota?: boolean;
}

export type PipelineResult =
  | {
      ok: true;
      userId: string;
      supabase: any;
      corsHeaders: Record<string, string>;
      quota: QuotaResult | null;
    }
  | { ok: false; response: Response };

/**
 * Run the standard pre-handler pipeline. Returns either an early-return
 * Response (CORS preflight, 401, 403, 429) or a context object.
 *
 * Usage:
 *   const r = await runPipeline(req, { category: "content", workspaceId });
 *   if (!r.ok) return r.response;
 *   const { userId, supabase, corsHeaders, quota } = r;
 */
export async function runPipeline(
  req: Request,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const corsHeaders = getCorsHeaders(req);

  // 1. CORS preflight
  if (req.method === "OPTIONS") {
    return { ok: false, response: new Response(null, { headers: corsHeaders }) };
  }

  // 2. Auth
  let userId: string;
  let supabase: any;
  try {
    const auth = await authenticateRequest(req);
    userId = auth.userId;
    supabase = auth.supabase;
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    const message = e instanceof Error ? e.message : "Authentification requise";
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  // 3. Demo guard
  if (isDemoUser(userId)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Demo mode: this feature is simulated" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  // 4. Rate limit
  const rl = options.rateLimit
    ? checkRateLimit(userId, options.rateLimit.max, options.rateLimit.windowMs)
    : checkRateLimit(userId);
  if (!rl.allowed) {
    return { ok: false, response: rateLimitResponse(rl.retryAfterMs!, corsHeaders) };
  }

  // 5. Quota
  let quota: QuotaResult | null = null;
  if (!options.skipQuota && options.category) {
    quota = await checkQuota(userId, options.category, options.workspaceId);
    if (!quota.allowed) {
      return { ok: false, response: quotaDeniedResponse(quota, corsHeaders) };
    }
  }

  return { ok: true, userId, supabase, corsHeaders, quota };
}
