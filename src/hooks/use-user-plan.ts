import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";

type Plan = "free" | "outil" | "studio" | "now_pilot";

type Feature =
  | "branding" | "persona" | "audit_basic" | "generation_limited" | "community_read"
  | "generation_unlimited" | "import_stats" | "prospection" | "comments_generator"
  | "dm_generator" | "audit_unlimited" | "offer_workshop" | "lives" | "community_write"
  | "contacts_strategiques" | "routine_engagement" | "editorial_line" | "calendar"
  | "coaching" | "studio_space" | "laetitia_validation" | "studio_lives" | "direct_channel" | "binome"
  | "whatsapp" | "assistant_chat";

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

const NOW_PILOT_FEATURES: Feature[] = [
  ...OUTIL_FEATURES,
  "coaching", "whatsapp", "assistant_chat", "direct_channel", "binome",
];

export type AiCategory = "content" | "audit" | "dm_comment" | "bio_profile" | "suggestion" | "import" | "adaptation";

export interface CategoryUsage {
  used: number;
  limit: number;
}

interface UserPlanState {
  plan: Plan;
  loading: boolean;
  usage: Record<string, CategoryUsage>;
  canUseFeature: (feature: Feature) => boolean;
  canGenerate: (category?: AiCategory) => boolean;
  canAudit: () => boolean;
  remainingGenerations: (category?: AiCategory) => number;
  remainingAudits: () => number;
  remainingTotal: () => number;
  isPaid: boolean;
  isStudio: boolean;
  isPilot: boolean;
  refresh: () => Promise<void>;
}

export function useUserPlan(): UserPlanState {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const [plan, setPlan] = useState<Plan>(isDemoMode ? "now_pilot" : "free");
  const [usage, setUsage] = useState<Record<string, CategoryUsage>>(() => {
    if (isDemoMode) {
      return {
        content: { used: 8, limit: 150 },
        audit: { used: 1, limit: 15 },
        dm_comment: { used: 4, limit: 50 },
        bio_profile: { used: 1, limit: 15 },
        suggestion: { used: 2, limit: 30 },
        import: { used: 0, limit: 10 },
        adaptation: { used: 0, limit: 30 },
        total: { used: demoData?.profile?.credits_used ?? 16, limit: demoData?.profile?.credits_monthly ?? 300 },
      };
    }
    return {};
  });
  const [loading, setLoading] = useState(!isDemoMode);

  const load = useCallback(async () => {
    if (isDemoMode || !user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (!error && data) {
        setPlan((data.plan as Plan) || "free");
        if (data.ai_usage && typeof data.ai_usage === "object") {
          setUsage(data.ai_usage);
        }
      }
    } catch {
      // fallback to free
    }
    setLoading(false);
  }, [user, isDemoMode]);

  useEffect(() => {
    load();
  }, [load]);

  const canUseFeature = useCallback(
    (feature: Feature) => {
      const p = isDemoMode ? "now_pilot" : plan;
      switch (p) {
        case "now_pilot": return NOW_PILOT_FEATURES.includes(feature);
        case "studio": return STUDIO_FEATURES.includes(feature);
        case "outil": return OUTIL_FEATURES.includes(feature);
        default: return FREE_FEATURES.includes(feature);
      }
    },
    [plan, isDemoMode]
  );

  const canGenerate = useCallback((category: AiCategory = "content") => {
    if (isDemoMode) return true;
    const cat = usage[category];
    const total = usage.total;
    if (!cat || !total) return true;
    if (cat.limit === 0) return false;
    return cat.used < cat.limit && total.used < total.limit;
  }, [usage, isDemoMode]);

  const canAudit = useCallback(() => {
    return canGenerate("audit");
  }, [canGenerate]);

  const remainingGenerations = useCallback((category: AiCategory = "content") => {
    if (isDemoMode) return 100;
    const cat = usage[category];
    if (!cat) return Infinity;
    return Math.max(0, cat.limit - cat.used);
  }, [usage, isDemoMode]);

  const remainingAudits = useCallback(() => {
    return remainingGenerations("audit");
  }, [remainingGenerations]);

  const remainingTotal = useCallback(() => {
    if (isDemoMode) return 284;
    const total = usage.total;
    if (!total) return Infinity;
    return Math.max(0, total.limit - total.used);
  }, [usage, isDemoMode]);

  return {
    plan: isDemoMode ? "now_pilot" : plan,
    loading,
    usage,
    canUseFeature,
    canGenerate,
    canAudit,
    remainingGenerations,
    remainingAudits,
    remainingTotal,
    isPaid: isDemoMode || plan !== "free",
    isStudio: !isDemoMode && plan === "studio",
    isPilot: isDemoMode || plan === "now_pilot",
    refresh: load,
  };
}
