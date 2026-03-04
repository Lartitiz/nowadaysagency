import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "./use-workspace-query";

const QUERY_KEY = "branding-data";

export interface BrandingData {
  proposition: any | null;
  strategy: any | null;
  profile: any | null;
  storytelling: any | null;
  persona: any | null;
}

export function useBrandingData() {
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  return useQuery({
    queryKey: [QUERY_KEY, column, value],
    queryFn: async (): Promise<BrandingData> => {
      const [propRes, stratRes, profRes, storyRes, persRes] = await Promise.all([
        (supabase.from("brand_proposition") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_strategy") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_profile") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("storytelling") as any).select("*").eq(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("persona") as any).select("*").eq(column, value).maybeSingle(),
      ]);

      return {
        proposition: propRes.data,
        strategy: stratRes.data,
        profile: profRes.data,
        storytelling: storyRes.data,
        persona: persRes.data,
      };
    },
    enabled: !!value,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrandingSection(table: "brand_proposition" | "brand_strategy" | "brand_profile" | "storytelling" | "persona") {
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: [QUERY_KEY, table, column, value],
    queryFn: async () => {
      const { data, error } = await (supabase.from(table) as any)
        .select("*")
        .eq(column, value)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!value,
    staleTime: 5 * 60 * 1000,
  });
}
