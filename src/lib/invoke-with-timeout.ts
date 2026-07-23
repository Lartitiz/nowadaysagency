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
 *
 * Règle d'or : ne JAMAIS laisser remonter à l'utilisateur le message technique
 * brut du SDK Supabase (« Failed to send a request to the Edge Function »,
 * « Requested function was not found »…). Ces textes passent par les helpers
 * ci-dessous qui les traduisent en messages clairs.
 */
export async function invokeWithTimeout(
  functionName: string,
  options: { body?: any; headers?: Record<string, string>; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" } = {},
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

    // Échec réseau OU fonction injoignable : le SDK ne LÈVE pas FunctionsFetchError,
    // il le renvoie dans result.error, sans status HTTP. Un 404 « function not
    // found » (fonction non déployée) ou un 500/504 renvoyé sans en-tête CORS
    // arrivent aussi ici, faute de status exploitable.
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

    // Message clair et unique quand le service est injoignable (réseau coupé,
    // fonction non déployée, passerelle qui timeout…). Jamais le brut du SDK.
    function networkErrorMessage(): string {
      const isPhotoCall =
        (options as any)?.body?.photo_mode === true ||
        Array.isArray((options as any)?.body?.photos);
      return isPhotoCall
        ? "Génération longue interrompue. Réessaie avec moins de photos (3-5 max) ou vérifie ta connexion."
        : "Le service est momentanément indisponible. Réessaie dans quelques instants.";
    }

    function bodyOf(res: { data: any }): any {
      return typeof res.data === "object" && res.data !== null ? res.data : {};
    }

    // Un retry (après refresh) a de nouveau échoué : produire un message clair
    // selon la nature de l'échec, sans jamais afficher le message brut du SDK.
    function retryFailureError(retryResult: { data: any; error: any }): { data: any; error: InvokeError } {
      const retryStatus = getStatusFromError(retryResult.error);
      if (retryStatus === 401 || retryStatus === 403) {
        return { data: null, error: { message: "Ta session a expiré. Reconnecte-toi pour continuer.", code: "AUTH", isAuth: true } };
      }
      // Toujours injoignable (fetch error ou pas de status exploitable) → réseau.
      if (isFetchError(retryResult.error) || retryStatus === undefined) {
        return { data: null, error: { message: networkErrorMessage(), code: "NETWORK", isNetwork: true, originalError: retryResult.error } };
      }
      const retryBody = bodyOf(retryResult);
      return {
        data: retryBody,
        error: {
          message: retryBody.message || retryBody.error || "L'IA a eu un blanc. Réessaie dans quelques instants.",
          code: "SERVER_ERROR",
          originalError: retryResult.error,
        },
      };
    }

    // Un retry a abouti côté transport : reste à propager une éventuelle erreur
    // applicative présente dans le corps de la réponse.
    function retrySuccess(retryResult: { data: any; error: any }): { data: any; error: InvokeError | null } {
      if (retryResult.data?.error) {
        const isLimit = retryResult.data.error === "limit_reached";
        return {
          data: retryResult.data,
          error: {
            message: retryResult.data.message || retryResult.data.error,
            code: isLimit ? "RATE_LIMIT" : "GENERATION_ERROR",
            isRateLimit: isLimit,
          },
        };
      }
      return { data: retryResult.data, error: null };
    }

    async function doInvoke() {
      return supabase.functions.invoke(functionName, options);
    }

    try {
      let result = await doInvoke();

      // When Supabase SDK throws FunctionsHttpError, result.data is null
      // but the response body (with the real error) is in error.context
      if (result.error && result.data === null && (result.error as any)?.context) {
        try {
          const errorBody = await (result.error as any).context.json();
          if (errorBody && typeof errorBody === "object") {
            result = { ...result, data: errorBody };
          }
        } catch {
          // Body already consumed or not JSON — ignore
        }
      }

      // Edge Function returned an HTTP error
      if (result.error) {
        const status = getStatusFromError(result.error);
        const body = bodyOf(result);
        const serverMsg =
          body.message || body.error || (result.error as any)?.message;

        // Fonction injoignable sans status (FunctionsFetchError) : on la route
        // vers le catch pour bénéficier du refresh + retry, plutôt que de laisser
        // fuiter « Failed to send a request… » via le chemin « Other HTTP error ».
        if (status === undefined && isFetchError(result.error)) {
          throw result.error;
        }

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
            resolve(retryResult.error ? retryFailureError(retryResult) : retrySuccess(retryResult));
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

        // Fonction non déployée (404) ou plantée au démarrage (503 BOOT_ERROR) :
        // le SDK renvoie un message de plateforme (« Requested function was not
        // found ») inutile pour l'utilisateur → message clair d'indisponibilité.
        clearTimeout(timer);
        const isUnavailable = status === 404 || status === 503;
        resolve({
          data: body,
          error: {
            message: isUnavailable
              ? "Le service est momentanément indisponible. Réessaie dans quelques instants."
              : serverMsg || "L'IA a eu un blanc. Réessaie dans quelques instants.",
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
            resolve(retryResult.error ? retryFailureError(retryResult) : retrySuccess(retryResult));
            return;
          } catch (retryErr: any) {
            resolve({
              data: null,
              error: {
                message: networkErrorMessage(),
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
            message: networkErrorMessage(),
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
