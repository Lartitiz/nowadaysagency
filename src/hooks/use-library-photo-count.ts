import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classerParPertinence } from "@/lib/rank-library-photos";
import type { UserPhotoRow } from "@/lib/photo-storage";

/**
 * Nombre de photos prêtes dans « Mes photos » (les mêmes que propose
 * « Choisir dans mes photos »). 0 tant que la lecture n'a pas répondu ou si
 * elle échoue : l'écran garde alors son comportement sans bibliothèque.
 */
export function useLibraryPhotoCount(filter: { column: string; value: string }): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!filter.value) return;
    let cancelled = false;
    (async () => {
      try {
        const { count: n, error } = await supabase
          .from("user_photos")
          .select("id", { count: "exact", head: true })
          .eq(filter.column as "workspace_id", filter.value)
          .eq("status", "ready")
          .is("removed_from_library_at", null);
        if (!cancelled && !error) setCount(n ?? 0);
      } catch {
        // Lecture indisponible : on reste à 0.
      }
    })();
    return () => { cancelled = true; };
  }, [filter.column, filter.value]);
  return count;
}

/** « L'app choisit » (14/11/2026) : ses photos les plus proches du sujet d'abord, classées sans IA. */
export function usePickLibraryPhotos(filter: { column: string; value: string }, subject: string) {
  return useCallback(async (count: number) => {
    const { data, error } = await supabase
      .from("user_photos")
      .select("*")
      .eq(filter.column as "workspace_id", filter.value)
      .eq("status", "ready")
      .is("removed_from_library_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return classerParPertinence((data ?? []) as UserPhotoRow[], subject).slice(0, count);
  }, [filter.column, filter.value, subject]);
}
