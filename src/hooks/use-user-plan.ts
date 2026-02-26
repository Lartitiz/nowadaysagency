import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trackError } from "@/lib/error-tracker";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";

type Plan = "free" | "outil" | "pro" | "studio" | "now_pilot";

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

const PRO_FEATURES: Feature[] = [
  ...OUTIL_FEATURES,
  "coaching", "studio_space", "direct_channel", "binome",
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
  bonusCredits: number;
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
  const { isDemoMode, demoData, demoPlan } = useDemoContext();
  const demoPlanResolved: Plan = isDemoMode ? (demoPlan as Plan) : "free";
  const [plan, setPlan] = useState<Plan>(isDemoMode ? demoPlanResolved : "free");
  const [bonusCredits, setBonusCredits] = useState(0);
  const [usage, setUsage] = useState<Record<string, CategoryUsage>>(() => {
    if (isDemoMode) {
      return getDemoUsage(demoPlan, demoData);
    }
    return {};
  });
  const [loading, setLoading] = useState(!isDemoMode);

  // Update usage when demoPlan changes
  useEffect(() => {
    if (!isDemoMode) return;
    setUsage(getDemoUsage(demoPlan, demoData));
  }, [isDemoMode, demoPlan, demoData]);

  const load = useCallback(async () => {
    if (isDemoMode || !user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (!error && data) {
        setPlan((data.plan as Plan) || "free");
        setBonusCredits(data.bonus_credits || 0);
        if (data.ai_usage && typeof data.ai_usage === "object") {
          setUsage(data.ai_usage);
        }
      }
    } catch (e) {
      trackError(e, { page: "useUserPlan", action: "checkSubscription" });
    }
    setLoading(false);
  }, [user, isDemoMode]);

  useEffect(() => {
    load();
  }, [load]);

  const { isAdmin: isAdminUser } = useAuth();
  const effectivePlan: Plan = isAdminUser ? "now_pilot" : (isDemoMode ? demoPlanResolved : plan);

  const canUseFeature = useCallback(
    (feature: Feature) => {
      const p = isAdminUser ? "now_pilot" : (isDemoMode ? demoPlanResolved : plan);
      switch (p) {
        case "now_pilot": return NOW_PILOT_FEATURES.includes(feature);
        case "studio": return STUDIO_FEATURES.includes(feature);
        case "pro": return PRO_FEATURES.includes(feature);
        case "outil": return OUTIL_FEATURES.includes(feature);
        default: return FREE_FEATURES.includes(feature);
      }
    },
    [plan, isDemoMode, demoPlanResolved, isAdminUser]
  );

  const canGenerate = useCallback((category: AiCategory = "content") => {
    if (isAdminUser) return true;
    if (isDemoMode && demoPlan === "now_pilot") return true;
    const cat = usage[category];
    const total = usage.total;
    if (!cat || !total) return true;
    if (cat.limit === 0) return false;
    return cat.used < cat.limit && total.used < total.limit;
  }, [usage, isDemoMode, demoPlan, isAdminUser]);

  const canAudit = useCallback(() => {
    return canGenerate("audit");
  }, [canGenerate]);

  const remainingGenerations = useCallback((category: AiCategory = "content") => {
    if (isAdminUser) return 100;
    if (isDemoMode && demoPlan === "now_pilot") return 100;
    const cat = usage[category];
    if (!cat) return Infinity;
    return Math.max(0, cat.limit - cat.used);
  }, [usage, isDemoMode, demoPlan, isAdminUser]);

  const remainingAudits = useCallback(() => {
    return remainingGenerations("audit");
  }, [remainingGenerations]);

  const remainingTotal = useCallback(() => {
    if (isAdminUser) return 284;
    if (isDemoMode && demoPlan === "now_pilot") return 284;
    if (isDemoMode && demoPlan === "free") return 2;
    const total = usage.total;
    if (!total) return Infinity;
    return Math.max(0, total.limit - total.used);
  }, [usage, isDemoMode, demoPlan, isAdminUser]);

  return {
    plan: effectivePlan,
    loading,
    usage,
    bonusCredits,
    canUseFeature,
    canGenerate,
    canAudit,
    remainingGenerations,
    remainingAudits,
    remainingTotal,
    isPaid: isAdminUser || (isDemoMode && demoPlan === "now_pilot") || (!isDemoMode && plan !== "free"),
    isStudio: !isDemoMode && (isAdminUser || plan === "studio"),
    isPilot: isAdminUser || (isDemoMode && demoPlan === "now_pilot") || (!isDemoMode && plan === "now_pilot"),
    refresh: load,
  };
}

function getDemoUsage(demoPlan: string, demoData: any): Record<string, CategoryUsage> {
  if (demoPlan === "free") {
    return {
      content: { used: 18, limit: 25 },
      audit: { used: 2, limit: 3 },
      dm_comment: { used: 3, limit: 5 },
      bio_profile: { used: 1, limit: 3 },
      suggestion: { used: 1, limit: 2 },
      import: { used: 0, limit: 1 },
      adaptation: { used: 1, limit: 2 },
      total: { used: 23, limit: 25 },
    };
  }
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
