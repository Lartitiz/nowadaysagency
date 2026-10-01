import { withIdeaBrief } from "@/lib/idea-brief-request";
import { supabase } from "@/integrations/supabase/client";
import type { InvokeError } from "./invoke-with-timeout";

const CONNECTION_INTERRUPTED = "La connexion au service de génération a été interrompue. Ton brouillon est conservé ; réessaie dans quelques instants.";
function serviceMessage(value: unknown, fallback = "Erreur de génération."): string {
  if (typeof value !== "string" || !value) return fallback;
  return /signal is aborted|AbortError|Failed to fetch|NetworkError|Load failed/i.test(value) ? CONNECTION_INTERRUPTED : value;
}

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
  options: {
    body?: any;
    /**
     * Callback appelé sur chaque event SSE `{ type: "status", stage, ... }`
     * émis par le serveur pendant la génération — permet d'afficher les
     * vraies étapes (rédaction, correction, lots de visuels) au lieu d'une
     * barre de progression simulée.
     */
    onStatus?: (stage: string, data?: Record<string, unknown>) => void;
  } = {},
  timeoutMs = 180000,
): Promise<{ data: any; error: InvokeError | null }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  let phase: "session" | "request" | "stream" = "session";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    let sessionTimer: ReturnType<typeof setTimeout> | undefined;
    const session = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        sessionTimer = setTimeout(() => reject(new Error("session-timeout")), 15000);
      }),
    ]).finally(() => clearTimeout(sessionTimer));
    if (session.error) throw session.error;
    const token = session.data.session?.access_token;
    if (!token) {
      return {
        data: null,
        error: { message: "Ta session a expiré. Reconnecte-toi pour continuer.", code: "AUTH", isAuth: true },
      };
    }

    phase = "request";
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);

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
        body: JSON.stringify(withIdeaBrief(functionName, options.body ?? {})),
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
      // Si on est en ligne, ce n'est pas une vraie coupure réseau — c'est l'infra qui
      // a coupé après un long traitement serveur (limite ~150 s côté Edge Functions).
      const online = typeof navigator !== "undefined" ? navigator.onLine : true;
      const message = online
        ? "Le serveur a mis trop de temps à répondre. Réessaie avec moins de photos ou un sujet plus court."
        : "Connexion perdue. Vérifie ta connexion internet et réessaie.";
      return {
        data: null,
        error: { message, code: "NETWORK", isNetwork: true, originalError: err },
      };
    }

    const contentType = resp.headers.get("Content-Type") || "";

    // Fallback: server returned plain JSON (no SSE wrapping).
    if (contentType.includes("application/json")) {
      const json = await resp.json();
      if (resp.status === 429) {
        return { data: json, error: { data: json, message: json?.message || "Limite atteinte.", code: "RATE_LIMIT", isRateLimit: true } };
      }
      if (!resp.ok) {
        return { data: json, error: { data: json, message: serviceMessage(json?.message || json?.error, "Erreur serveur."), code: "SERVER_ERROR" } };
      }
      if (json?.error) {
        return { data: json, error: { data: json, message: serviceMessage(json.message || json.error), code: "GENERATION_ERROR" } };
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
    phase = "stream";
    reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalText = "";
    let sseError: string | null = null;
    let terminal = false;

    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() + "\n" : decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "done") {
            finalText = event.full || "";
            terminal = true;
          } else if (event.type === "error") {
            sseError = event.error || "Erreur de génération.";
            terminal = true;
          } else if (event.type === "status" && event.stage && options.onStatus) {
            try { options.onStatus(event.stage, event); } catch { /* le callback UI ne doit jamais casser le flux */ }
          }
          // heartbeat → ignore
        } catch { /* ignore partial JSON */ }
      }
      // A terminal event is authoritative, even if a proxy keeps the socket open.
      if (terminal || done) break;
    }

    clearTimeout(timer);

    if (sseError) {
      // L'event SSE `error` transporte le body de la réponse serveur tel quel.
      // Si c'est du JSON (cas quota : `{ error: "limit_reached", quota, message }`),
      // on le parse pour que les appelants gardent `data.quota` / `data.error`
      // exactement comme sur le chemin JSON classique — sinon le mur de quota
      // s'ouvrirait sans les vraies infos (plan, usage) ou pas du tout.
      let errJson: any = null;
      try { errJson = JSON.parse(sseError); } catch { /* texte brut */ }
      if (errJson && typeof errJson === "object") {
        const isLimit = errJson.error === "limit_reached";
        return {
          data: errJson,
          error: {
            data: errJson,
            message: serviceMessage(errJson.message || errJson.error),
            code: isLimit ? "RATE_LIMIT" : "SERVER_ERROR",
            isRateLimit: isLimit,
          },
        };
      }
      return { data: null, error: { message: serviceMessage(sseError), code: "SERVER_ERROR" } };
    }

    if (!finalText) {
      return { data: null, error: { message: "La génération a été interrompue avant la fin (connexion coupée côté serveur). Réessaie.", code: "SERVER_ERROR" } };
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
        error: { data: parsed, message: serviceMessage(parsed.message || parsed.error), code: isLimit ? "RATE_LIMIT" : "GENERATION_ERROR", isRateLimit: isLimit },
      };
    }

    return { data: parsed, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: {
        message: phase === "session"
          ? "Impossible de vérifier ta connexion pour le moment. Recharge la page pour réessayer. Ton brouillon est conservé."
          : CONNECTION_INTERRUPTED,
        code: phase === "session" ? "SESSION_UNAVAILABLE" : "NETWORK",
        isNetwork: phase !== "session", originalError: err,
      },
    };
  } finally {
    clearTimeout(timer);
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
