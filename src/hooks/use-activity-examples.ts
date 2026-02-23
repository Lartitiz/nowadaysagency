import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";
import { getActivityExamples, type ActivityProfile } from "@/lib/activity-examples";

/**
 * Returns dynamic examples adapted to the user's activity.
 * In demo mode, uses the demo activity instead.
 */
export function useActivityExamples(): ActivityProfile & { activityText: string } {
  const { user } = useAuth();
  const { isDemoMode, demoActivity } = useDemoContext();
  const [activity, setActivity] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) return;
    if (!user) return;
    supabase
      .from("profiles")
      .select("activite, type_activite")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        // Prefer the structured type_activite key, fall back to free-text activite
        setActivity(data?.type_activite || data?.activite || null);
      });
  }, [user?.id, isDemoMode]);

  const activityText = isDemoMode ? (demoActivity || "") : (activity || "");
  const examples = getActivityExamples(activityText);

  return { ...examples, activityText };
}
