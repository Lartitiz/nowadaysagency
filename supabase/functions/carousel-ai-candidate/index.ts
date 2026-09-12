import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

/** Acceptance is complete: this route cannot invoke a model or debit a quota. */
export function handleRetiredRequest(req: Request): Response {
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: "candidate_retired", message: "Cette route temporaire de recette est désactivée." }), { status: 410, headers });
}

if (import.meta.main) serve(handleRetiredRequest);
