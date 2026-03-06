import { AuthError } from "./auth.ts";
import { getCorsHeaders } from "./cors.ts";

/**
 * Sanitized error response handler for edge functions.
 * Logs full error server-side but returns generic message to client.
 */
export function handleError(
  error: unknown,
  req: Request,
  functionName: string,
  extra?: Record<string, unknown>
): Response {
  const corsHeaders = getCorsHeaders(req);
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  // Auth errors are already user-friendly
  if (error instanceof AuthError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers,
    });
  }

  // Log full error server-side for debugging
  console.error(`${functionName} error:`, error);

  // Return generic message to client
  return new Response(
    JSON.stringify({ error: "Erreur interne du serveur", ...extra }),
    { status: 500, headers }
  );
}
