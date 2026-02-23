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
  const [plan, setPlan] = useState<Plan>("free");
  const [usage, setUsage] = useState<Record<string, CategoryUsage>>({});
  const [loading, setLoading] = useState(true);

  // In demo mode, return now_pilot with fake usage
  if (isDemoMode) {
    const demoUsage: Record<string, CategoryUsage> = {
      content: { used: 8, limit: 150 },
      audit: { used: 1, limit: 15 },
      dm_comment: { used: 4, limit: 50 },
      bio_profile: { used: 1, limit: 15 },
      suggestion: { used: 2, limit: 30 },
      import: { used: 0, limit: 10 },
      adaptation: { used: 0, limit: 30 },
      total: { used: demoData?.credits_used ?? 16, limit: demoData?.credits_monthly ?? 300 },
    };
    return {
      plan: "now_pilot",
      loading: false,
      usage: demoUsage,
      canUseFeature: (f: Feature) => NOW_PILOT_FEATURES.includes(f),
      canGenerate: () => true,
      canAudit: () => true,
      remainingGenerations: () => 100,
      remainingAudits: () => 14,
      remainingTotal: () => 284,
      isPaid: true,
      isStudio: false,
      isPilot: true,
      refresh: async () => {},
    };
  }

  const load = useCallback(async () => {
    if (!user) {
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
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const canUseFeature = useCallback(
    (feature: Feature) => {
      switch (plan) {
        case "now_pilot": return NOW_PILOT_FEATURES.includes(feature);
        case "studio": return STUDIO_FEATURES.includes(feature);
        case "outil": return OUTIL_FEATURES.includes(feature);
        default: return FREE_FEATURES.includes(feature);
      }
    },
    [plan]
  );

  const canGenerate = useCallback((category: AiCategory = "content") => {
    const cat = usage[category];
    const total = usage.total;
    if (!cat || !total) return true; // No data yet, allow
    if (cat.limit === 0) return false; // Not available on this plan
    return cat.used < cat.limit && total.used < total.limit;
  }, [usage]);

  const canAudit = useCallback(() => {
    return canGenerate("audit");
  }, [canGenerate]);

  const remainingGenerations = useCallback((category: AiCategory = "content") => {
    const cat = usage[category];
    if (!cat) return Infinity;
    return Math.max(0, cat.limit - cat.used);
  }, [usage]);

  const remainingAudits = useCallback(() => {
    return remainingGenerations("audit");
  }, [remainingGenerations]);

  const remainingTotal = useCallback(() => {
    const total = usage.total;
    if (!total) return Infinity;
    return Math.max(0, total.limit - total.used);
  }, [usage]);

  return {
    plan,
    loading,
    usage,
    canUseFeature,
    canGenerate,
    canAudit,
    remainingGenerations,
    remainingAudits,
    remainingTotal,
    isPaid: plan !== "free",
    isStudio: plan === "studio",
    isPilot: plan === "now_pilot",
    refresh: load,
  };
}
