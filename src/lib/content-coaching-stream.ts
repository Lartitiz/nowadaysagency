import { supabase } from "@/integrations/supabase/client";
import { reportGenerationFailure } from "@/lib/generation-telemetry";

/** Étapes envoyées par content-coaching en mode flux (une ligne JSON par événement). */
export type IdeaStreamEvent =
  | { type: "stage"; stage: "preparation" | "research" | "writing" }
  | { type: "idea"; idea: unknown; ready: number; total: number };

/** Une erreur qui garde la réponse JSON du serveur (quota, activité manquante…). */
class IdeaStreamError extends Error {
  constructor(message: string, readonly data?: unknown) { super(message); }
}

/**
 * Appelle content-coaching en flux : chaque idée arrive dès qu'elle est prête
 * (onEvent), la promesse rend la réponse complète (même forme que l'appel classique).
 * Un serveur ancien qui répond en JSON d'un bloc reste accepté.
 * Jamais de nouvel essai automatique après une coupure réseau : la génération
 * peut avoir abouti côté serveur (seul un 401 permet un essai après rafraîchissement).
 */
export async function streamContentCoaching(body: Record<string, unknown>, onEvent: (event: IdeaStreamEvent) => void, timeoutMs = 200000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const call = (token: string) => fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/content-coaching`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Accept: "application/x-ndjson" },
    body: JSON.stringify({ ...body, stream: true }),
    signal: controller.signal,
  });
  const fail = (message: string, code: string, data?: unknown): never => {
    reportGenerationFailure("content-coaching", body, code);
    throw new IdeaStreamError(message, data);
  };
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) fail("Ta session a expiré. Reconnecte-toi pour continuer.", "AUTH");
    let resp = await call(token!);
    if (resp.status === 401) {
      const refreshed = await supabase.auth.refreshSession().catch(() => null);
      const next = refreshed?.data?.session?.access_token;
      if (next && !refreshed?.error) resp = await call(next);
    }
    if (resp.status === 401) fail("Ta session a expiré. Reconnecte-toi pour continuer.", "AUTH");
    const type = resp.headers.get("Content-Type") || "";
    if (!type.includes("ndjson") || !resp.body) {
      const json = await resp.json().catch(() => null);
      if (!resp.ok || json?.error) fail(json?.message || json?.error || "Le service est momentanément indisponible. Réessaie dans quelques instants.", resp.status === 429 ? "RATE_LIMIT" : "SERVER_ERROR", json);
      return json;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const handle = (line: string): any => {
      if (!line.trim()) return undefined;
      let event: any;
      try { event = JSON.parse(line); } catch { return undefined; }
      if (event?.type === "done") return event;
      if (event?.type === "error") fail(event.error || "Impossible de préparer les idées. Réessaie.", "GENERATION_ERROR");
      if (event?.type === "stage" || event?.type === "idea") onEvent(event);
      return undefined;
    };
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf("\n")) !== -1) {
        const final = handle(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 1);
        if (final) return final;
      }
      if (done) {
        const final = handle(buffer);
        if (final) return final;
        return fail("La connexion a été coupée avant la fin. Les idées déjà arrivées restent affichées.", "NETWORK");
      }
    }
  } catch (error) {
    if (error instanceof IdeaStreamError) throw error;
    if (controller.signal.aborted) return fail("La réponse prend trop de temps. Réessaie dans un instant.", "TIMEOUT");
    return fail("Le service est momentanément indisponible. Réessaie dans quelques instants.", "NETWORK");
  } finally { clearTimeout(timer); }
}
