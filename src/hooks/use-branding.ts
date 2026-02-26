import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";

export function usePersona() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["persona", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("persona") as any)
        .select("*")
        .eq(column, value)
        .eq("is_primary", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrandProposition() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["brand-proposition", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("brand_proposition") as any)
        .select("*")
        .eq(column, value)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrandStrategy() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["brand-strategy", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("brand_strategy") as any)
        .select("*")
        .eq(column, value)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStorytelling() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["storytelling-primary", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("storytelling") as any)
        .select("*")
        .eq(column, value)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStorytellingList() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["storytelling-list", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("storytelling") as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrandCharter() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["brand-charter", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("brand_charter") as any)
        .select("*")
        .eq(column, value)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEditorialLine() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["editorial-line", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("instagram_editorial_line") as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook composite : charge TOUTES les données branding d'un coup.
 * Utilise les hooks individuels, donc bénéficie du cache partagé.
 * Pour les pages qui ont besoin de 3+ tables branding.
 */
export function useBrandingContext() {
  const { data: persona, isLoading: personaLoading } = usePersona();
  const { data: proposition, isLoading: propositionLoading } = useBrandProposition();
  const { data: strategy, isLoading: strategyLoading } = useBrandStrategy();
  const { data: storytelling, isLoading: storytellingLoading } = useStorytelling();
  const { data: charter, isLoading: charterLoading } = useBrandCharter();
  const { data: editorialLine, isLoading: editorialLoading } = useEditorialLine();

  const isLoading = personaLoading || propositionLoading || strategyLoading || storytellingLoading || charterLoading || editorialLoading;

  return {
    persona,
    proposition,
    strategy,
    storytelling,
    charter,
    editorialLine,
    isLoading,
  };
}
