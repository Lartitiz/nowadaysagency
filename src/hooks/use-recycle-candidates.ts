import { useQuery } from "@tanstack/react-query";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAuth } from "@/contexts/AuthContext";

export interface RecycleCandidate {
  id: string;
  source: "app" | "instagram";
  reason: "top_engagement" | "revive";
  theme: string;
  content: string | null;
  excerpt: string;
  canal: string;
  format: string | null;
  publishedAt: string | null;
  permalink?: string;
  metrics?: {
    engagementRate?: number;
    reach?: number;
    views?: number;
    likes?: number;
    comments?: number;
    saves?: number;
    shares?: number;
  };
}

interface RecycleResponse {
  candidates: RecycleCandidate[];
  igConnected: boolean;
  partial: boolean;
}

/**
 * Candidats au recyclage intelligent (posts passés qui méritent une seconde vie).
 * `enabled` = fetch uniquement quand le panneau s'ouvre : l'edge interroge l'API
 * Meta post par post (~10-20 s la première fois), on ne paie ce coût que sur demande.
 */
export function useRecycleCandidates(enabled: boolean) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();

  return useQuery<RecycleResponse>({
    queryKey: ["recycle-candidates", workspaceId],
    enabled: enabled && !!user,
    staleTime: 30 * 60 * 1000, // les métriques bougent lentement — 30 min de cache
    retry: 1,
    queryFn: async () => {
      const { data, error } = await invokeWithTimeout(
        "recycle-candidates",
        { body: { workspace_id: workspaceId !== user?.id ? workspaceId : undefined } },
        45000,
      );
      if (error) throw new Error(error.message || "Erreur lors de la recherche de posts à recycler");
      if (data?.error) throw new Error(data.error);
      return data as RecycleResponse;
    },
  });
}
