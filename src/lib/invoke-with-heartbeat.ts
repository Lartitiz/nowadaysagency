import { supabase } from "@/integrations/supabase/client";
import type { InvokeError } from "./invoke-with-timeout";

/**
 * Variante de `invokeWithTimeout` qui demande au serveur d'envoyer des
 * heartbeats SSE pendant la génération. Ça empêche la connexion d'être
 * coupée par un proxy après ~60s d'inactivité.
 *
 * Côté serveur, la fonction doit savoir répondre en `text/event-stream`
 * et finir par un event `{ type: "done", full: "<json string>" }`.
 * Si le serveur répond en JSON classique (rétrocompat), on parse aussi.
 *
 * Retourne `{ data, error }` exactement comme `invokeWithTimeout` pour
 * être substituable sans changer le code appelant.
 */
export async function invokeWithHeartbeat(
  functionName: string,
  options: { body?: any } = {},
  timeoutMs = 180000,
): Promise<{ data: any; error: InvokeError | null }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      return {
        data: null,
        error: { message: "Ta session a expiré. Reconnecte-toi pour continuer.", code: "AUTH", isAuth: true },
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": publishableKey,
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(options.body ?? {}),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === "AbortError") {
        return {
          data: null,
          error: { message: "La génération prend plus de temps que prévu. Réessaie.", code: "TIMEOUT", isTimeout: true },
        };
      }
      return {
        data: null,
        error: { message: "Connexion perdue. Vérifie ta connexion et réessaie.", code: "NETWORK", isNetwork: true, originalError: err },
      };
    }

    const contentType = resp.headers.get("Content-Type") || "";

    // Fallback: server returned plain JSON (no SSE wrapping).
    if (contentType.includes("application/json")) {
      clearTimeout(timer);
      let json: any = null;
      try { json = await resp.json(); } catch { /* ignore */ }
      if (resp.status === 429) {
        return { data: json, error: { message: json?.message || "Limite atteinte.", code: "RATE_LIMIT", isRateLimit: true } };
      }
      if (!resp.ok) {
        return { data: json, error: { message: json?.message || json?.error || "Erreur serveur.", code: "SERVER_ERROR" } };
      }
      if (json?.error) {
        return { data: json, error: { message: json.message || json.error, code: "GENERATION_ERROR" } };
      }
      return { data: json, error: null };
    }

    if (!resp.ok || !resp.body) {
      clearTimeout(timer);
      return {
        data: null,
        error: { message: `Erreur serveur (${resp.status}).`, code: "SERVER_ERROR" },
      };
    }

    // Read SSE stream until `done` or `error`.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalText = "";
    let sseError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "done") {
            finalText = event.full || "";
          } else if (event.type === "error") {
            sseError = event.error || "Erreur de génération.";
          }
          // heartbeat / status → ignore
        } catch { /* ignore partial JSON */ }
      }
    }

    clearTimeout(timer);

    if (sseError) {
      return { data: null, error: { message: sseError, code: "SERVER_ERROR" } };
    }

    if (!finalText) {
      return { data: null, error: { message: "Réponse vide du serveur.", code: "SERVER_ERROR" } };
    }

    let parsed: any = null;
    try { parsed = JSON.parse(finalText); } catch {
      // Server might have sent raw text — wrap it.
      parsed = { content: finalText };
    }

    if (parsed?.error) {
      const isLimit = parsed.error === "limit_reached";
      return {
        data: parsed,
        error: { message: parsed.message || parsed.error, code: isLimit ? "RATE_LIMIT" : "GENERATION_ERROR", isRateLimit: isLimit },
      };
    }

    return { data: parsed, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: { message: err?.message || "Erreur inattendue.", code: "UNKNOWN", originalError: err },
    };
  }
}
