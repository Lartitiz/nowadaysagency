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
          } else if (event.type === "status" && event.stage && options.onStatus) {
            try { options.onStatus(event.stage, event); } catch { /* le callback UI ne doit jamais casser le flux */ }
          }
          // heartbeat → ignore
        } catch { /* ignore partial JSON */ }
      }
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
            message: errJson.message || errJson.error || "Erreur de génération.",
            code: isLimit ? "RATE_LIMIT" : "SERVER_ERROR",
            isRateLimit: isLimit,
          },
        };
      }
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
