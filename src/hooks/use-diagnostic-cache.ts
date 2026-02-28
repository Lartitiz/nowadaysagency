import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";

export interface DiagnosticCacheData {
  id: string;
  created_at: string;
  scores: Record<string, any> | null;
  strengths: any[] | null;
  weaknesses: any[] | null;
  priorities: any[] | null;
  summary: string | null;
  raw_analysis: Record<string, any> | null;
  branding_prefill: Record<string, any> | null;
  sources_used: string[] | null;
  sources_failed: string[] | null;
}

export function useDiagnosticCache() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [diagnosticData, setDiagnosticData] = useState<DiagnosticCacheData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }

    (supabase.from("diagnostic_results") as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) setDiagnosticData(data as DiagnosticCacheData);
        setIsLoading(false);
      });
  }, [user?.id]);

  const isRecent = !!diagnosticData?.created_at &&
    (Date.now() - new Date(diagnosticData.created_at).getTime()) < 24 * 60 * 60 * 1000;

  return { diagnosticData, isRecent, isLoading };
}
