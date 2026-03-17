import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trackError } from "@/lib/error-tracker";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";

type Plan = "free" | "outil" | "binome";

/** "studio" et "now_pilot" = même plan (Binôme de com').
 *  Stripe écrit "studio", coaching_programs écrit "now_pilot".
 *  On normalise vers "binome" pour simplifier toute la logique. */
export function normalizePlan(raw: string): Plan {
  if (raw === "studio" || raw === "now_pilot") return "binome";
  return (["free", "outil", "binome"].includes(raw) ? raw : "free") as Plan;
}

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

const BINOME_FEATURES: Feature[] = [
  ...OUTIL_FEATURES,
  "coaching", "whatsapp", "assistant_chat", "direct_channel", "binome",
];


export type AiCategory = "content" | "audit" | "dm_comment" | "bio_profile" | "suggestion" | "coach" | "import" | "adaptation" | "deep_research";

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
  isBinome: boolean;
  refresh: () => Promise<void>;
}

/* ── Shared in-memory cache for check-subscription ── */
let _cachedData: any = null;
let _cacheTimestamp = 0;
let _inflightPromise: Promise<any> | null = null;
const CACHE_TTL = 60_000; // 1 minute

async function fetchSubscription(): Promise<any> {
  const now = Date.now();
  if (_cachedData && now - _cacheTimestamp < CACHE_TTL) {
    return _cachedData;
  }
  if (_inflightPromise) return _inflightPromise;

  _inflightPromise = supabase.functions
    .invoke("check-subscription")
    .then(({ data, error }) => {
      _inflightPromise = null;
      if (!error && data) {
        _cachedData = data;
        _cacheTimestamp = Date.now();
        return data;
      }
      return null;
    })
    .catch(() => {
      _inflightPromise = null;
      return null;
    });

  return _inflightPromise;
}

/** Force cache invalidation (called by refresh) */
function invalidateCache() {
  _cachedData = null;
  _cacheTimestamp = 0;
}

export function useUserPlan(): UserPlanState {
  const { user } = useAuth();
  const { isDemoMode, demoData, demoPlan } = useDemoContext();
  const demoPlanResolved: Plan = isDemoMode ? normalizePlan(demoPlan as string) : "free";
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
      const data = await fetchSubscription();
      if (data) {
        setPlan(normalizePlan(data.plan || "free"));
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

  const refresh = useCallback(async () => {
    invalidateCache();
    await load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const { isAdmin: isAdminUser } = useAuth();
  const effectivePlan: Plan = isAdminUser ? "binome" : (isDemoMode ? demoPlanResolved : plan);

  const canUseFeature = useCallback(
    (feature: Feature) => {
      const p = isAdminUser ? "binome" : (isDemoMode ? demoPlanResolved : plan);
      switch (p) {
        case "binome": return BINOME_FEATURES.includes(feature);
        case "outil": return OUTIL_FEATURES.includes(feature);
        default: return FREE_FEATURES.includes(feature);
      }
    },
    [plan, isDemoMode, demoPlanResolved, isAdminUser]
  );

  const canGenerate = useCallback((category: AiCategory = "content") => {
    if (isAdminUser) return true;
    if (isDemoMode && demoPlanResolved === "binome") return true;
    const cat = usage[category];
    const total = usage.total;
    if (!cat || !total) return true;
    if (cat.limit === 0) return false;
    return cat.used < cat.limit && total.used < total.limit;
  }, [usage, isDemoMode, demoPlanResolved, isAdminUser]);

  const canAudit = useCallback(() => {
    return canGenerate("audit");
  }, [canGenerate]);

  const remainingGenerations = useCallback((category: AiCategory = "content") => {
    if (isAdminUser) return 100;
    if (isDemoMode && demoPlanResolved === "binome") return 100;
    const cat = usage[category];
    if (!cat) return Infinity;
    return Math.max(0, cat.limit - cat.used);
  }, [usage, isDemoMode, demoPlanResolved, isAdminUser]);

  const remainingAudits = useCallback(() => {
    return remainingGenerations("audit");
  }, [remainingGenerations]);

  const remainingTotal = useCallback(() => {
    if (isAdminUser) return 284;
    if (isDemoMode && demoPlanResolved === "binome") return 284;
    if (isDemoMode && demoPlanResolved === "free") return 2;
    const total = usage.total;
    if (!total) return Infinity;
    return Math.max(0, total.limit - total.used);
  }, [usage, isDemoMode, demoPlanResolved, isAdminUser]);

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
    isPaid: isAdminUser || (isDemoMode && demoPlanResolved === "binome") || (!isDemoMode && plan !== "free"),
    isBinome: isAdminUser || (isDemoMode && demoPlanResolved === "binome") || (!isDemoMode && plan === "binome"),
    refresh,
  };
}

// TODO: type demoData properly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDemoUsage(demoPlan: string, demoData: any): Record<string, CategoryUsage> {
  if (normalizePlan(demoPlan) === "free") {
    return {
      content: { used: 22, limit: 30 },
      audit: { used: 2, limit: 30 },
      dm_comment: { used: 0, limit: 30 },
      bio_profile: { used: 0, limit: 30 },
      suggestion: { used: 0, limit: 30 },
      import: { used: 0, limit: 30 },
      adaptation: { used: 0, limit: 30 },
      total: { used: 26, limit: 30 },
    };
  }
  return {
    content: { used: 8, limit: 9999 },
    audit: { used: 1, limit: 9999 },
    dm_comment: { used: 4, limit: 50 },
    bio_profile: { used: 1, limit: 15 },
    suggestion: { used: 2, limit: 30 },
    import: { used: 0, limit: 10 },
    adaptation: { used: 0, limit: 30 },
    total: { used: demoData?.profile?.credits_used ?? 16, limit: 9999 },
  };
}
