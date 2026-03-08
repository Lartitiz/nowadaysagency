import { supabase } from "@/integrations/supabase/client";

export type InvokeErrorCode =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "AUTH"
  | "SERVER_ERROR"
  | "GENERATION_ERROR"
  | "NETWORK"
  | "UNKNOWN";

export interface InvokeError {
  message: string;
  code: InvokeErrorCode;
  isTimeout?: boolean;
  isRateLimit?: boolean;
  isAuth?: boolean;
  isNetwork?: boolean;
  originalError?: any;
}

/**
 * Appelle une Edge Function Supabase avec un timeout configurable.
 * Retourne des erreurs typées pour que le frontend affiche le bon message.
 */
export async function invokeWithTimeout(
  functionName: string,
  options: { body?: any } = {},
  timeoutMs = 30000
): Promise<{ data: any; error: InvokeError | null }> {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      resolve({
        data: null,
        error: {
          message:
            "La génération prend plus de temps que prévu. Réessaie dans quelques instants.",
          code: "TIMEOUT",
          isTimeout: true,
        },
      });
    }, timeoutMs);

    try {
      const result = await supabase.functions.invoke(functionName, options);
      clearTimeout(timer);

      // Edge Function returned an HTTP error
      if (result.error) {
        const status =
          (result.error as any)?.status ||
          (result.error as any)?.context?.status;
        const body =
          typeof result.data === "object" && result.data !== null
            ? result.data
            : {};
        const serverMsg =
          body.message || body.error || (result.error as any)?.message;

        if (status === 429) {
          resolve({
            data: body,
            error: {
              message:
                serverMsg ||
                "Tu as atteint ta limite de crédits ce mois-ci. Ils se renouvellent le 1er du mois.",
              code: "RATE_LIMIT",
              isRateLimit: true,
            },
          });
          return;
        }

        if (status === 401 || status === 403) {
          resolve({
            data: null,
            error: {
              message: "Session expirée. Reconnecte-toi pour continuer.",
              code: "AUTH",
              isAuth: true,
            },
          });
          return;
        }

        resolve({
          data: body,
          error: {
            message:
              serverMsg ||
              "L'IA a eu un blanc. Réessaie dans quelques instants.",
            code: "SERVER_ERROR",
            originalError: result.error,
          },
        });
        return;
      }

      // Edge Function returned OK but with an error in the body
      if (result.data?.error) {
        const isLimit = result.data.error === "limit_reached";
        resolve({
          data: result.data,
          error: {
            message:
              result.data.message ||
              result.data.error,
            code: isLimit ? "RATE_LIMIT" : "GENERATION_ERROR",
            isRateLimit: isLimit,
          },
        });
        return;
      }

      resolve({ data: result.data, error: null });
    } catch (err: any) {
      clearTimeout(timer);

      // Network error
      if (
        err?.message?.includes("fetch") ||
        err?.message?.includes("network") ||
        err?.name === "TypeError"
      ) {
        resolve({
          data: null,
          error: {
            message:
              "Connexion perdue. Vérifie ta connexion internet et réessaie.",
            code: "NETWORK",
            isNetwork: true,
          },
        });
        return;
      }

      resolve({
        data: null,
        error: {
          message: err?.message || "Erreur inattendue. Réessaie.",
          code: "UNKNOWN",
          originalError: err,
        },
      });
    }
  });
}
