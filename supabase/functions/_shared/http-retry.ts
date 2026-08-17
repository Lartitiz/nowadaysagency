// Shared HTTP retry helper for edge functions calling third-party image APIs
// (Photoroom, OpenAI images, Recraft). Distinct from _shared/anthropic.ts,
// which handles retries for Claude calls only.

/**
 * How a thrown network/timeout error decides whether attempt 0 gets retried:
 * - "timeout-or-type-error" : retry on AbortSignal timeout OR fetch TypeError (network drop)
 * - "type-error-only"       : retry on TypeError only, NEVER on timeout (used when the
 *                              upstream timeout is already very long — doubling it would
 *                              blow the edge function's own time budget)
 * - "always"                : retry on any thrown error
 */
export type NetworkErrorRetryMode = "timeout-or-type-error" | "type-error-only" | "always";

export interface FetchWithRetryOptions {
  /** Total attempts, including the first. Default 2 (= 1 retry). */
  maxAttempts?: number;
  /** Delay between attempts. Default 2000ms. */
  retryDelayMs?: number;
  /** If set, a 5xx response only triggers a retry while elapsed time stays under this budget. */
  maxElapsedMsFor5xxRetry?: number;
  /** Default "timeout-or-type-error". */
  networkErrorRetryMode?: NetworkErrorRetryMode;
  /** lastError message used when the failure was a timeout. Default "timeout". */
  timeoutLabel?: string;
}

export interface FetchWithRetryResult {
  /** null when every attempt threw (network error/timeout with no retry left). */
  response: Response | null;
  retried: boolean;
  lastError: string | null;
  elapsedMs: number;
}

function shouldRetryNetworkError(
  mode: NetworkErrorRetryMode,
  isTimeout: boolean,
  e: unknown
): boolean {
  const isTypeError = e instanceof Error && e.name === "TypeError";
  if (mode === "always") return true;
  if (mode === "type-error-only") return !isTimeout && isTypeError;
  return isTimeout || isTypeError; // "timeout-or-type-error"
}

/**
 * Runs `doFetch` with a single configurable retry pass: retries once on a 5xx
 * response and on transient network errors/timeouts, per `options`. On a 5xx
 * response the body is drained before retrying to avoid a resource leak.
 * 4xx responses and non-retryable errors are returned/surfaced immediately.
 */
export async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  options: FetchWithRetryOptions = {}
): Promise<FetchWithRetryResult> {
  const maxAttempts = options.maxAttempts ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  const mode = options.networkErrorRetryMode ?? "timeout-or-type-error";
  const timeoutLabel = options.timeoutLabel ?? "timeout";

  let response: Response | null = null;
  let retried = false;
  let lastError: string | null = null;
  const t0 = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      response = await doFetch();
      if (response.ok) break;

      const canRetry5xx =
        response.status >= 500 &&
        attempt < maxAttempts - 1 &&
        (options.maxElapsedMsFor5xxRetry === undefined ||
          Date.now() - t0 < options.maxElapsedMsFor5xxRetry);

      if (canRetry5xx) {
        await response.text().catch(() => "");
        retried = true;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      break;
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      lastError = isTimeout ? timeoutLabel : e instanceof Error ? e.message : "fetch error";

      if (attempt < maxAttempts - 1 && shouldRetryNetworkError(mode, isTimeout, e)) {
        retried = true;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      response = null;
      break;
    }
  }

  return { response, retried, lastError, elapsedMs: Date.now() - t0 };
}
