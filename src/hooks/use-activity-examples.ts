import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";
import { getActivityExamples, type ActivityProfile } from "@/lib/activity-examples";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";

/**
 * Returns dynamic examples adapted to the user's activity.
 * In demo mode, uses the demo activity instead.
 */
export function useActivityExamples(): ActivityProfile & { activityText: string } {
  const { user } = useAuth();
  const { isDemoMode, demoActivity } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const [activity, setActivity] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) return;
    if (!user) return;
    (supabase
      .from("profiles") as any)
      .select("activite, type_activite")
      .eq(column, value)
      .maybeSingle()
      .then(({ data }: { data: { type_activite?: string; activite?: string } | null }) => {
        setActivity(data?.type_activite || data?.activite || null);
      });
  }, [user?.id, isDemoMode, column, value]);

  const activityText = isDemoMode ? (demoActivity || "") : (activity || "");
  const examples = getActivityExamples(activityText);

  return { ...examples, activityText };
}
