import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Plan = "free" | "outil" | "studio";

type Feature =
  | "branding" | "persona" | "audit_basic" | "generation_limited" | "community_read"
  | "generation_unlimited" | "import_stats" | "prospection" | "comments_generator"
  | "dm_generator" | "audit_unlimited" | "offer_workshop" | "lives" | "community_write"
  | "contacts_strategiques" | "routine_engagement" | "editorial_line" | "calendar"
  | "coaching" | "studio_space" | "laetitia_validation" | "studio_lives" | "direct_channel" | "binome";

const FREE_FEATURES: Feature[] = [
  "branding", "persona", "audit_basic", "generation_limited", "community_read",
];

const OUTIL_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "generation_unlimited", "import_stats", "prospection", "comments_generator",
  "dm_generator", "audit_unlimited", "offer_workshop", "lives", "community_write",
  "contacts_strategiques", "routine_engagement", "editorial_line", "calendar",
];

const STUDIO_FEATURES: Feature[] = [
  ...OUTIL_FEATURES,
  "coaching", "studio_space", "laetitia_validation", "studio_lives", "direct_channel", "binome",
];

interface UserPlanState {
  plan: Plan;
  loading: boolean;
  usage: { generations: number; audits: number };
  canUseFeature: (feature: Feature) => boolean;
  canGenerate: () => boolean;
  canAudit: () => boolean;
  remainingGenerations: () => number;
  remainingAudits: () => number;
  isPaid: boolean;
  isStudio: boolean;
  refresh: () => Promise<void>;
}

export function useUserPlan(): UserPlanState {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan>("free");
  const [usage, setUsage] = useState({ generations: 0, audits: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (!error && data) {
        setPlan((data.plan as Plan) || "free");
        setUsage({
          generations: data.ai_usage?.generation_count || 0,
          audits: data.ai_usage?.audit_count || 0,
        });
      }
    } catch {
      // fallback to free
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const canUseFeature = useCallback(
    (feature: Feature) => {
      switch (plan) {
        case "studio": return STUDIO_FEATURES.includes(feature);
        case "outil": return OUTIL_FEATURES.includes(feature);
        default: return FREE_FEATURES.includes(feature);
      }
    },
    [plan]
  );

  const canGenerate = useCallback(() => {
    if (plan !== "free") return true;
    return usage.generations < 3;
  }, [plan, usage.generations]);

  const canAudit = useCallback(() => {
    if (plan !== "free") return true;
    return usage.audits < 1;
  }, [plan, usage.audits]);

  const remainingGenerations = useCallback(() => {
    if (plan !== "free") return Infinity;
    return Math.max(0, 3 - usage.generations);
  }, [plan, usage.generations]);

  const remainingAudits = useCallback(() => {
    if (plan !== "free") return Infinity;
    return Math.max(0, 1 - usage.audits);
  }, [plan, usage.audits]);

  return {
    plan,
    loading,
    usage,
    canUseFeature,
    canGenerate,
    canAudit,
    remainingGenerations,
    remainingAudits,
    isPaid: plan !== "free",
    isStudio: plan === "studio",
    refresh: load,
  };
}
