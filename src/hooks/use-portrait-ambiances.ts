import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceFilter } from "./use-workspace-query";

export interface PortraitAmbiance {
  title: string;
  description: string;
  prompt: string;
}

interface AmbiancesResponse {
  ambiances?: PortraitAmbiance[];
  error?: string;
}

/**
 * Ambiances de fond « Portrait pro », générées depuis le branding par l'edge
 * photo-describe (mode portrait_ambiances). L'edge cache le résultat dans
 * brand_charter.portrait_ambiances : les ouvertures suivantes sont instantanées
 * et le cache s'invalide tout seul quand le branding change. `regenerate()`
 * force un nouveau lot (« D'autres idées »).
 */
export function usePortraitAmbiances(enabled: boolean) {
  const { column, value } = useWorkspaceFilter();
  const queryClient = useQueryClient();
  const [isRegenerating, setIsRegenerating] = useState(false);

  const queryKey = ["portrait-ambiances", column, value];

  const invoke = async (regenerate: boolean): Promise<PortraitAmbiance[]> => {
    // Via invokeWithTimeout : en cas de fonction injoignable, error.message est
    // déjà un message clair (« Le service est momentanément indisponible… »),
    // jamais le brut du SDK (« Failed to send a request… »). Cf PR #632.
    const { data, error } = await invokeWithTimeout("photo-describe", {
      body: {
        mode: "portrait_ambiances",
        workspace_id: column === "workspace_id" ? value : undefined,
        regenerate,
      },
    });
    if (error) throw new Error(error.message);
    const res = data as AmbiancesResponse;
    if (res?.error) throw new Error(res.error);
    return Array.isArray(res?.ambiances) ? res.ambiances : [];
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => invoke(false),
    enabled: enabled && !!value,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  async function regenerate(): Promise<void> {
    setIsRegenerating(true);
    try {
      const fresh = await invoke(true);
      if (fresh.length) queryClient.setQueryData(queryKey, fresh);
    } finally {
      setIsRegenerating(false);
    }
  }

  return {
    ambiances: data ?? [],
    isLoading,
    isError,
    refetch,
    regenerate,
    isRegenerating,
  };
}
