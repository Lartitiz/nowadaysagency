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
 * En cas de 401/403 ou FunctionsFetchError, tente un refresh silencieux du token
 * puis relance l'appel UNE seule fois avant d'échouer.
 */
export async function invokeWithTimeout(
  functionName: string,
  options: { body?: any } = {},
  timeoutMs = 90000
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

    async function tryRefreshSession(): Promise<boolean> {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session) return true;
        // Refresh token is dead — force clean signOut to clear stale tokens
        await forceSignOut();
        return false;
      } catch {
        await forceSignOut();
        return false;
      }
    }

    async function forceSignOut(): Promise<void> {
      try {
        await supabase.auth.signOut();
      } catch {
        // If signOut also fails, manually clear storage so user isn't stuck
        try {
          const storageKey = Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
          if (storageKey) localStorage.removeItem(storageKey);
        } catch { /* ignore */ }
      }
    }

    function isFetchError(err: any): boolean {
      return (
        err?.name === "FunctionsFetchError" ||
        err?.message?.includes("Failed to send a request") ||
        err?.message?.includes("Failed to fetch") ||
        err?.name === "TypeError"
      );
    }

    function getStatusFromError(error: any): number | undefined {
      return error?.status || error?.context?.status;
    }

    async function doInvoke() {
      return supabase.functions.invoke(functionName, options);
    }

    try {
      let result = await doInvoke();

      // Edge Function returned an HTTP error
      if (result.error) {
        const status = getStatusFromError(result.error);
        const body =
          typeof result.data === "object" && result.data !== null
            ? result.data
            : {};
        const serverMsg =
          body.message || body.error || (result.error as any)?.message;

        if (status === 429) {
          clearTimeout(timer);
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

        // Auth error (401/403) → try silent refresh + retry once
        if (status === 401 || status === 403) {
          const refreshed = await tryRefreshSession();
          if (refreshed) {
            const retryResult = await doInvoke();
            clearTimeout(timer);

            if (retryResult.error) {
              const retryStatus = getStatusFromError(retryResult.error);
              if (retryStatus === 401 || retryStatus === 403) {
                resolve({
                  data: null,
                  error: {
                    message: "Ta session a expiré. Reconnecte-toi pour continuer.",
                    code: "AUTH",
                    isAuth: true,
                  },
                });
                return;
              }
              const retryBody =
                typeof retryResult.data === "object" && retryResult.data !== null
                  ? retryResult.data
                  : {};
              const retryMsg =
                retryBody.message || retryBody.error || (retryResult.error as any)?.message;
              resolve({
                data: retryBody,
                error: {
                  message: retryMsg || "L'IA a eu un blanc. Réessaie dans quelques instants.",
                  code: "SERVER_ERROR",
                  originalError: retryResult.error,
                },
              });
              return;
            }

            if (retryResult.data?.error) {
              const isLimit = retryResult.data.error === "limit_reached";
              resolve({
                data: retryResult.data,
                error: {
                  message: retryResult.data.message || retryResult.data.error,
                  code: isLimit ? "RATE_LIMIT" : "GENERATION_ERROR",
                  isRateLimit: isLimit,
                },
              });
              return;
            }

            resolve({ data: retryResult.data, error: null });
            return;
          }

          clearTimeout(timer);
          resolve({
            data: null,
            error: {
              message: "Ta session a expiré. Reconnecte-toi pour continuer.",
              code: "AUTH",
              isAuth: true,
            },
          });
          return;
        }

        // Other HTTP error
        clearTimeout(timer);
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

      clearTimeout(timer);

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

      // FunctionsFetchError or network error → try refresh + retry once
      if (isFetchError(err)) {
        const refreshed = await tryRefreshSession();
        if (refreshed) {
          try {
            const retryResult = await doInvoke();

            if (retryResult.error) {
              const retryStatus = getStatusFromError(retryResult.error);
              const retryBody =
                typeof retryResult.data === "object" && retryResult.data !== null
                  ? retryResult.data
                  : {};
              const retryMsg =
                retryBody.message || retryBody.error || (retryResult.error as any)?.message;

              resolve({
                data: retryBody,
                error: {
                  message:
                    retryStatus === 401 || retryStatus === 403
                      ? "Ta session a expiré. Recharge la page pour te reconnecter."
                      : retryMsg || "L'IA a eu un blanc. Réessaie dans quelques instants.",
                  code: retryStatus === 401 || retryStatus === 403 ? "AUTH" : "SERVER_ERROR",
                  isAuth: retryStatus === 401 || retryStatus === 403,
                  originalError: retryResult.error,
                },
              });
              return;
            }

            if (retryResult.data?.error) {
              const isLimit = retryResult.data.error === "limit_reached";
              resolve({
                data: retryResult.data,
                error: {
                  message: retryResult.data.message || retryResult.data.error,
                  code: isLimit ? "RATE_LIMIT" : "GENERATION_ERROR",
                  isRateLimit: isLimit,
                },
              });
              return;
            }

            resolve({ data: retryResult.data, error: null });
            return;
          } catch (retryErr: any) {
            resolve({
              data: null,
              error: {
                message: "Connexion perdue. Vérifie ta connexion internet et réessaie.",
                code: "NETWORK",
                isNetwork: true,
                originalError: retryErr,
              },
            });
            return;
          }
        }

        resolve({
          data: null,
          error: {
            message: "Connexion perdue ou session expirée. Recharge la page et réessaie.",
            code: "NETWORK",
            isNetwork: true,
            originalError: err,
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
