import { supabase } from "@/integrations/supabase/client";

/**
 * Appelle une Edge Function Supabase avec un timeout de 30 secondes.
 * Si le timeout est atteint, rejette avec un message clair pour l'utilisatrice.
 */
export async function invokeWithTimeout(
  functionName: string,
  options: { body?: any } = {},
  timeoutMs = 30000
): Promise<{ data: any; error: any }> {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      resolve({
        data: null,
        error: {
          message: "La génération prend trop de temps. Réessaie dans quelques instants.",
          isTimeout: true,
        },
      });
    }, timeoutMs);

    try {
      const result = await supabase.functions.invoke(functionName, options);
      clearTimeout(timer);
      resolve(result);
    } catch (err: any) {
      clearTimeout(timer);
      resolve({ data: null, error: err });
    }
  });
}
