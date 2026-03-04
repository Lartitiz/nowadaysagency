import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "./use-workspace-query";
import { useToast } from "@/hooks/use-toast";

const QUERY_KEY = "saved-ideas";

export function useSavedIdeas(filters?: { canal?: string; tag?: string }) {
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: [QUERY_KEY, filters, column, value],
    queryFn: async () => {
      let q = (supabase.from("saved_ideas") as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false });

      if (filters?.canal) q = q.eq("canal", filters.canal);
      if (filters?.tag) q = q.contains("tags", [filters.tag]);

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!value,
  });
}

export function useCreateIdea() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (idea: Record<string, unknown>) => {
      const { data, error } = await (supabase.from("saved_ideas") as any)
        .insert(idea)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({ title: "Idée sauvegardée ✨" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de sauvegarder l'idée.", variant: "destructive" });
    },
  });
}

export function useDeleteIdea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("saved_ideas") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
