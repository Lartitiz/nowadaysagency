import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "./use-workspace-query";
import { useToast } from "@/hooks/use-toast";

const QUERY_KEY = "calendar-posts";

export function useCalendarPosts(filters?: {
  month?: number;
  year?: number;
  canal?: string;
  status?: string;
}) {
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: [QUERY_KEY, filters, column, value],
    queryFn: async () => {
      let q = (supabase.from("calendar_posts") as any)
        .select("*")
        .eq(column, value)
        .order("date", { ascending: true });

      if (filters?.canal) q = q.eq("canal", filters.canal);
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.month !== undefined && filters?.year !== undefined) {
        const start = new Date(filters.year, filters.month, 1).toISOString().split("T")[0];
        const end = new Date(filters.year, filters.month + 1, 0).toISOString().split("T")[0];
        q = q.gte("date", start).lte("date", end);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!value,
  });
}

export function useCreateCalendarPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (post: Record<string, unknown>) => {
      const { data, error } = await (supabase.from("calendar_posts") as any)
        .insert(post)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de créer le post.", variant: "destructive" });
    },
  });
}

export function useUpdateCalendarPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      const { data, error } = await (supabase.from("calendar_posts") as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useDeleteCalendarPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("calendar_posts") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
