import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useDemoContext } from "@/contexts/DemoContext";

/* ── « Y a-t-il une fiche de marque qui attend d'être validée ? » ───────────
   L'onboarding pose une fiche `branding_autofill` en `pending_review` (#633) :
   tant qu'elle n'est pas validée, la marque n'est PAS écrite dans les tables
   lues par la génération — un contenu créé à ce moment-là ne parle donc pas
   vraiment de la personne. On s'en sert pour renvoyer vers la fiche avant de
   laisser créer.

   Deux garde-fous, parce qu'on bloque un parcours :
   - erreur réseau / requête impossible → on ne bloque jamais (pending = false) ;
   - au-delà de TIMEOUT_MS sans réponse, on arrête d'attendre et on laisse
     passer : mieux vaut une création non idéale qu'un écran qui ne s'ouvre pas.
   ── */

const TIMEOUT_MS = 2500;

export function usePendingBrandReview(options?: {
  /** Re-interroge toutes les N ms tant qu'aucune fiche n'est trouvée. Utile sur
   *  l'écran de bienvenue : l'enrichissement est async, la fiche peut arriver
   *  pendant la lecture — sans ça, le bouton garderait le mauvais libellé. */
  pollMs?: number;
}): { pending: boolean; checking: boolean } {
  const { column, value } = useWorkspaceFilter();
  const { isDemoMode } = useDemoContext();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["pending-brand-review", column, value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("branding_autofill") as any)
        .select("id")
        .eq(column, value)
        .eq("autofill_status", "pending_review")
        .limit(1)
        .maybeSingle();
      // supabase-js ne lève pas : sans ce garde, une erreur RLS/réseau
      // passerait pour « pas de fiche » (ou l'inverse selon le cache).
      if (error) throw error;
      return !!data;
    },
    enabled: !!value && !isDemoMode,
    staleTime: options?.pollMs ? 0 : 60 * 1000,
    refetchInterval: options?.pollMs
      ? (query) => (query.state.data === true ? false : options.pollMs!)
      : false,
    retry: 0,
  });

  if (isDemoMode || !value || isError) return { pending: false, checking: false };
  return { pending: data === true, checking: isLoading && !timedOut };
}
