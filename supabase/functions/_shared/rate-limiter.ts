/**
 * In-memory rate limiter for Edge Functions.
 *
 * Tracks requests per userId within a sliding window.
 * Resets on cold-start — acceptable as a first layer of abuse protection.
 * Does NOT replace plan-limiter (monthly quotas).
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 2 minutes
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the user can retry (only set when blocked) */
  retryAfterMs?: number;
}

/**
 * Check whether a userId is within the rate limit.
 *
 * @param userId - authenticated user id
 * @param maxRequests - max requests allowed in the window (default 20)
 * @param windowMs - sliding window in ms (default 60 000 = 1 minute)
 */
export function checkRateLimit(
  userId: string,
  maxRequests = 20,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  cleanup(windowMs);

  const cutoff = now - windowMs;
  let entry = store.get(userId);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Build a 429 Response with a user-friendly French message.
 */
export function rateLimitResponse(retryAfterMs: number, corsHeaders: Record<string, string>): Response {
  const seconds = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: `Tu envoies trop de requêtes. Réessaie dans ${seconds} seconde${seconds > 1 ? "s" : ""}.`,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(seconds),
      },
    },
  );
}
