import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";

export interface ActiveSerie {
  id: string;
  name: string;
  promise: string | null;
  format_template: string | null;
  channels: string[] | null;
  cadence: string | null;
}

/**
 * Returns active series for the current workspace — used to populate
 * the "Série" selector in the calendar post dialog.
 */
export function useActiveSeries() {
  const { column, value } = useWorkspaceFilter();

  return useQuery({
    queryKey: ["active-series", column, value],
    queryFn: async (): Promise<ActiveSerie[]> => {
      if (!value) return [];
      const { data, error } = await (supabase.from("series" as any) as any)
        .select("id, name, promise, format_template, channels, cadence, status")
        .eq(column, value)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) {
        console.warn("[use-active-series]", error.message);
        return [];
      }
      return (data || []) as ActiveSerie[];
    },
    enabled: !!value,
    staleTime: 60 * 1000,
  });
}

/**
 * Computes the next episode number for a series by looking at existing
 * calendar_posts. Returns 1 for an empty series.
 */
export async function getNextEpisodeNumber(seriesId: string): Promise<number> {
  const { data } = await (supabase.from("calendar_posts") as any)
    .select("episode_number")
    .eq("series_id", seriesId)
    .order("episode_number", { ascending: false, nullsFirst: false })
    .limit(1);
  const max = data?.[0]?.episode_number;
  return typeof max === "number" && max > 0 ? max + 1 : 1;
}
