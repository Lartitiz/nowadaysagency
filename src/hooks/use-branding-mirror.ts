import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter, useIsOwnSpace, useWorkspaceReady } from "@/hooks/use-workspace-query";
import { loadGeneratedBranding } from "@/lib/branding-generated";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { friendlyError } from "@/lib/error-messages";
import { toast } from "sonner";

interface MirrorData {
  coherence_score: number;
  summary: string;
  alignments?: { aspect: string; detail: string }[];
  gaps?: { aspect: string; declared: string; actual: string; suggestion: string }[];
  quick_wins?: string[];
}

export function useBrandingMirror() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  const own = useIsOwnSpace();
  const { isDemoMode } = useDemoContext();
  // Object identity also protects A -> B -> A against an old A response.
  const scope = useMemo(() => ({ userId: user?.id, column, value, ready, own, isDemoMode }), [user?.id, column, value, ready, own, isDemoMode]);
  const currentScope = useRef<object | null>(scope);
  currentScope.current = scope;
  const inFlight = useRef<object | null>(null);
  const [state, setState] = useState<{ scope: object; open: boolean; loading: boolean; data: MirrorData | null }>({ scope, open: false, loading: false, data: null });
  useEffect(() => {
    currentScope.current = scope;
    return () => { if (currentScope.current === scope) currentScope.current = null; };
  }, [scope]);
  const current = state.scope === scope ? state : { open: false, loading: false, data: null };
  const setMirrorOpen = (open: boolean) => setState({ scope, ...current, open });
  const run = async (regenerate: boolean) => {
    if (!ready || !user || isDemoMode || inFlight.current === scope) return;
    if (!regenerate && current.data) { setMirrorOpen(true); return; }
    inFlight.current = scope;
    setState({ scope, open: true, loading: true, data: null });
    try {
      const workspaceId = column === "workspace_id" ? value : null;
      const saved = regenerate ? null : await loadGeneratedBranding("branding_mirror_results", user.id, workspaceId, own);
      if (currentScope.current !== scope) return;
      let result = saved;
      if (!result) {
        const { data, error } = await invokeWithTimeout("branding-mirror", {
          body: { workspace_id: workspaceId },
        }, 90000);
        if (error) throw error;
        if (data?.error || data?.saved !== true) throw new Error(data?.error || "Le miroir n'a pas pu être enregistré.");
        result = data;
      }
      if (currentScope.current === scope) setState({ scope, open: true, loading: false, data: result as unknown as MirrorData });
    } catch (error) {
      if (currentScope.current === scope) {
        toast.error(friendlyError(error));
        setState({ scope, open: false, loading: false, data: null });
      }
    } finally {
      if (inFlight.current === scope) inFlight.current = null;
    }
  };
  return { mirrorOpen: current.open, setMirrorOpen, mirrorLoading: current.loading, mirrorData: current.data, runMirror: () => run(false), refreshMirror: () => run(true) };
}
