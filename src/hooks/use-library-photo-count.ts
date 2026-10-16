import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
