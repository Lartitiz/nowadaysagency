import { supabase } from "@/integrations/supabase/client";

export type InvokeErrorCode = "TIMEOUT" | "RATE_LIMIT" | "AUTH" | "FORBIDDEN" | "SERVER_ERROR" | "GENERATION_ERROR" | "NETWORK" | "UNKNOWN";
export interface InvokeError {
  message: string;
  code: InvokeErrorCode;
  isTimeout?: boolean;
  isRateLimit?: boolean;
  isAuth?: boolean;
  isNetwork?: boolean;
  originalError?: any;
}

/** A lost response may hide a successful write. Never automatically replay a
 * network failure. Only a definite 401 permits one retry after refreshing auth.
 * Aborting the transport does not imply that the server rolled back its work. */
export async function invokeWithTimeout(
  functionName: string,
  options: { body?: any; headers?: Record<string, string>; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" } = {},
  timeoutMs = 90000,
): Promise<{ data: any; error: InvokeError | null }> {
  const controller = new AbortController();
  const networkMessage = options.body?.photo_mode === true || Array.isArray(options.body?.photos)
    ? "Génération longue interrompue. Réessaie avec moins de photos (3-5 max) ou vérifie ta connexion."
    : "Le service est momentanément indisponible. Réessaie dans quelques instants.";
  const networkFailure = (error: any) => ({ data: null, error: { message: networkMessage, code: "NETWORK" as const, isNetwork: true, originalError: error } });
  const statusOf = (error: any) => error?.status || error?.context?.status;
  const isFetchError = (error: any) => error?.name === "FunctionsFetchError" || error?.name === "TypeError" || /Failed to (fetch|send a request)/i.test(error?.message || "");
  const invoke = async () => {
    if (controller.signal.aborted) throw new Error("request_timeout");
    let result = await supabase.functions.invoke(functionName, { ...options, signal: controller.signal });
    if (result.error && result.data === null && (result.error as any).context) {
      try {
        const response = (result.error as any).context;
        const body = await (response.clone ? response.clone() : response).json();
        if (body && typeof body === "object") result = { ...result, data: body };
      } catch { /* Keep the typed transport error when no JSON body exists. */ }
    }
    return result;
  };
  const run = async (): Promise<{ data: any; error: InvokeError | null }> => {
    try {
      let result = await invoke();
      if (statusOf(result.error) === 401 && !controller.signal.aborted) {
        const refreshed = await supabase.auth.refreshSession().catch(() => null);
        if (!controller.signal.aborted && refreshed?.data?.session && !refreshed.error) result = await invoke();
        // A failed refresh can be a network outage. Do not destroy the session.
      }
      if (result.error) {
        const status = statusOf(result.error);
        const body = result.data && typeof result.data === "object" ? result.data : {};
        const message = body.message || body.error;
        if (status === 401) return { data: null, error: { code: "AUTH", isAuth: true, message: "Ta session a expiré. Reconnecte-toi pour continuer." } };
        if (status === 403) return { data: body, error: { code: "FORBIDDEN", message: message || "Tu n’as pas les droits nécessaires pour cette action." } };
        if (status === 429) return { data: body, error: { code: "RATE_LIMIT", isRateLimit: true, message: message || "Trop de demandes en même temps. Attends un instant avant de réessayer." } };
        if (status === undefined && isFetchError(result.error)) return networkFailure(result.error);
        return { data: body, error: {
          code: "SERVER_ERROR", originalError: result.error,
          message: status === 404 || status === 503 ? "Le service est momentanément indisponible. Réessaie dans quelques instants."
            : message || "L’IA a eu un blanc. Réessaie dans quelques instants.",
        } };
      }
      if (result.data?.error) {
        const isLimit = result.data.error === "limit_reached";
        return { data: result.data, error: { message: result.data.message || result.data.error,
          code: isLimit ? "RATE_LIMIT" : "GENERATION_ERROR", isRateLimit: isLimit } };
      }
      return { data: result.data, error: null };
    } catch (error: any) {
      if (isFetchError(error)) return networkFailure(error);
      return { data: null, error: { code: "UNKNOWN", message: "L’action n’a pas pu être confirmée. Vérifie son résultat avant de réessayer.", originalError: error } };
    }
  };
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ data: any; error: InvokeError }>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ data: null, error: { code: "TIMEOUT", isTimeout: true,
        message: "La réponse prend trop de temps. Le traitement peut encore se terminer : vérifie son résultat avant de relancer." } });
    }, timeoutMs);
  });
  try { return await Promise.race([run(), timeout]); }
  finally { clearTimeout(timer!); }
}
