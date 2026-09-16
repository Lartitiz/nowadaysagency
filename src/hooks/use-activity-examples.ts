import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { getActivityExamples, type ActivityProfile } from "@/lib/activity-examples";
import { useWorkspaceFilter, useProfileOwner } from "@/hooks/use-workspace-query";

/**
 * Returns dynamic examples adapted to the user's activity.
 * In demo mode, uses the demo activity instead.
 */
export function useActivityExamples(): ActivityProfile & { activityText: string } {
  const { user } = useAuth();
  const { isDemoMode, demoActivity } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const owner = useProfileOwner();
  const key = `${user?.id}:${column}:${value}:${owner.userId}`;
  const [activity, setActivity] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    if (isDemoMode || !user || owner.loading || owner.error || !owner.userId) return;
    let current = true;
    setActivity(null);
    // profiles is account-scoped. Examples are optional: an unavailable read uses
    // neutral examples, never a former workspace's activity or the manager's own.
    Promise.resolve(supabase.from("profiles").select("activite, type_activite")
      .eq("user_id", owner.userId).maybeSingle())
      .then(({ data, error }) => {
        if (current) setActivity({ key, text: error ? "" : data?.type_activite || data?.activite || "" });
      }).catch(() => { if (current) setActivity({ key, text: "" }); });
    return () => { current = false; };
  }, [user?.id, isDemoMode, owner.userId, owner.loading, owner.error, key]);

  const activityText = isDemoMode ? (demoActivity || "")
    : !owner.loading && !owner.error && activity?.key === key ? activity.text : "";
  const examples = getActivityExamples(activityText);

  return { ...examples, activityText };
}
