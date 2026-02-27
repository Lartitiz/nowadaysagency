const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") || "";
  const isAllowed =
    allowedOrigin === "*" ||
    origin === allowedOrigin ||
    origin.endsWith(".lovable.app") ||
    origin.endsWith(".lovableproject.com") ||
    origin === "https://nowadays-assistant.fr" ||
    origin === "https://www.nowadays-assistant.fr";

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// Backward-compatible static export for existing functions
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
