import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SerieSummary {
  id: string;
  name: string;
  promise: string;
  pillar_key: "pillar_major" | "pillar_minor_1" | "pillar_minor_2" | "pillar_minor_3" | null;
  cadence: "weekly" | "biweekly" | "monthly" | "irregular" | null;
  format_template: string | null;
  signature_description: string | null;
  channels: string[];
  status: "active" | "paused" | "archived";
  planned_episodes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_ORDER: Record<SerieSummary["status"], number> = {
  active: 0,
  paused: 1,
  archived: 2,
};

export function useSeries() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const queryClient = useQueryClient();
  const [series, setSeries] = useState<SerieSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Miroir du useState local, mais la table `series` alimente AUSSI les queries
  // TanStack ["active-series"] / ["all-series-map"] (sélecteur « Série » du
  // dialog calendrier). Sans invalidation, une série mise en pause/supprimée y
  // reste proposée jusqu'au staleTime. Même classe que le fond figé /photos (#618).
  const invalidateSeriesQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["active-series"] });
    queryClient.invalidateQueries({ queryKey: ["all-series-map"] });
  }, [queryClient]);

  const fetchSeries = useCallback(async () => {
    if (isDemoMode) {
      setSeries([]);
      setLoading(false);
      return;
    }
    if (!user || !value) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase.from("series" as any) as any)
      .select("*")
      .eq(column, value);

    if (error) {
      console.error("[use-series] fetch error", error);
      setSeries([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as SerieSummary[];
    rows.sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (so !== 0) return so;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    setSeries(rows);
    setLoading(false);
  }, [user?.id, column, value, isDemoMode]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  const updateStatus = useCallback(async (id: string, status: SerieSummary["status"]) => {
    const { error } = await (supabase.from("series" as any) as any)
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error("Impossible de mettre à jour le statut");
      return;
    }
    const labels: Record<SerieSummary["status"], string> = {
      active: "Série réactivée",
      paused: "Série mise en pause",
      archived: "Série archivée",
    };
    toast.success(labels[status]);
    await fetchSeries();
    invalidateSeriesQueries();
  }, [fetchSeries, invalidateSeriesQueries]);

  const deleteSerie = useCallback(async (id: string) => {
    const { error } = await (supabase.from("series" as any) as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Impossible de supprimer la série");
      return;
    }
    toast.success("Série supprimée");
    await fetchSeries();
    invalidateSeriesQueries();
  }, [fetchSeries, invalidateSeriesQueries]);

  const activeSeries = series.filter((s) => s.status === "active");
  const archivedSeries = series.filter((s) => s.status === "archived");

  return {
    series,
    activeSeries,
    archivedSeries,
    loading,
    refetch: fetchSeries,
    updateStatus,
    deleteSerie,
  };
}
