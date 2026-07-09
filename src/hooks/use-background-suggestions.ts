import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "./use-workspace-query";
import {
  buildBackgroundSuggestions,
  type CharterForSuggestions,
} from "@/lib/background-suggestions";

/**
 * Suggestions de fond alignées sur le branding de l'espace actif (charte
 * visuelle). Retourne [] pendant le chargement pour éviter d'afficher des
 * suggestions génériques qui seraient remplacées une seconde plus tard.
 */
export function useBackgroundSuggestions(): string[] {
  const { column, value } = useWorkspaceFilter();

  const { data } = useQuery({
    queryKey: ["background-suggestions", column, value],
    queryFn: async (): Promise<CharterForSuggestions | null> => {
      const { data } = await (supabase.from("brand_charter") as any)
        .select(
          "color_primary, color_secondary, color_accent, color_background, mood_keywords, photo_keywords, photo_style",
        )
        .eq(column, value)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!value,
    staleTime: 5 * 60 * 1000,
  });

  return data === undefined ? [] : buildBackgroundSuggestions(data);
}
