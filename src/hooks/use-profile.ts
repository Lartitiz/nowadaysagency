import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfile() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["profile", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("*")
        .eq(column, value)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export function useBrandProfile() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["brand-profile", value],
    queryFn: async () => {
      const { data, error } = await (supabase.from("brand_profile") as any)
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

export function useMergedProfile() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: brandProfile, isLoading: brandProfileLoading } = useBrandProfile();

  const isLoading = profileLoading || brandProfileLoading;

  const mergedProfile = profile
    ? {
        ...profile,
        mission: brandProfile?.mission || profile.mission,
        offre: brandProfile?.offer || profile.offre,
        cible: brandProfile?.target_description || profile.cible,
        probleme_principal: brandProfile?.target_problem || profile.probleme_principal,
        croyances_limitantes: brandProfile?.target_beliefs || profile.croyances_limitantes,
        verbatims: brandProfile?.target_verbatims || profile.verbatims,
        expressions_cles: brandProfile?.key_expressions || profile.expressions_cles,
        ce_quon_evite: brandProfile?.things_to_avoid || profile.ce_quon_evite,
      }
    : null;

  return { profile, brandProfile, mergedProfile, isLoading };
}
