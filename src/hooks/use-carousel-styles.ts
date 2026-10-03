import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";

/** Un style enregistré dans « Mes styles » (éditeur de carrousel). */
export interface SavedCarouselStyle {
  id: string;
  name: string;
  kind: "text" | "shape" | "photo" | "veil";
  styles: Record<string, string>;
}
export interface CarouselStylesApi {
  list: SavedCarouselStyle[];
  save: (name: string, kind: SavedCarouselStyle["kind"], styles: Record<string, string>) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

// La table arrive avec la migration 20261003200000 ; les types générés suivent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("carousel_styles");

/** « Mes styles » de l'espace de travail actif (ou de l'utilisatrice hors espace). */
export function useCarouselStyles(): CarouselStylesApi {
  const { user } = useAuth();
  const scope = useWorkspaceFilter();
  const client = useQueryClient();
  const key = ["carousel_styles", scope.column, scope.value];
  const { data } = useQuery({
    queryKey: key,
    enabled: !!user?.id && !!scope.value,
    queryFn: async (): Promise<SavedCarouselStyle[]> => {
      const { data, error } = await table()
        .select("id, name, kind, styles")
        .eq(scope.column, scope.value)
        .order("created_at", { ascending: false })
        .limit(60);
      // Table pas encore créée : la fonction reste simplement vide.
      if (error) return [];
      return (data || []) as SavedCarouselStyle[];
    },
  });
  return {
    list: data || [],
    save: async (name, kind, styles) => {
      if (!user?.id) return false;
      const { error } = await table().insert({
        user_id: user.id,
        workspace_id: scope.column === "workspace_id" ? scope.value : null,
        name: name.slice(0, 60),
        kind,
        styles,
      });
      if (error) return false;
      await client.invalidateQueries({ queryKey: key });
      return true;
    },
    remove: async (id) => {
      await table().delete().eq("id", id);
      await client.invalidateQueries({ queryKey: key });
    },
  };
}
