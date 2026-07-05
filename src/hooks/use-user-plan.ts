import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trackError } from "@/lib/error-tracker";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

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
  "calendar",
];

const OUTIL_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "generation_unlimited", "import_stats", "prospection", "comments_generator",
  "dm_generator", "audit_unlimited", "offer_workshop", "lives", "community_write",
  "contacts_strategiques", "routine_engagement", "editorial_line",
];

const BINOME_FEATURES: Feature[] = [
  ...OUTIL_FEATURES,
  "coaching", "whatsapp", "assistant_chat", "direct_channel", "binome",
];


export type AiCategory = "content" | "audit" | "dm_comment" | "bio_profile" | "suggestion" | "coach" | "import" | "adaptation" | "deep_research" | "quality_max";

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
  /** Crédits réellement dépensables : mensuels restants + bonus (même règle que l'enforcement serveur). */
  remainingWithBonus: () => number;
  isPaid: boolean;
  isBinome: boolean;
  refresh: () => Promise<void>;
}

/* ── Shared in-memory cache for check-subscription ──
   Clé = workspace actif : le plan effectif et le compteur d'usage dépendent du
   périmètre (l'enforcement serveur compte par workspace), donc changer d'espace
   doit changer de cache — sinon on ré-affiche les crédits de l'espace précédent. */
let _cache = new Map<string, { data: any; ts: number }>();
const _inflight = new Map<string, Promise<any>>();
const CACHE_TTL = 60_000; // 1 minute

async function fetchSubscription(workspaceId?: string): Promise<any> {
  const key = workspaceId || "perso";
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return hit.data;
  }
  const pending = _inflight.get(key);
  if (pending) return pending;

  const promise = supabase.functions
    .invoke("check-subscription", { body: { workspace_id: workspaceId || null } })
    .then(({ data, error }) => {
      _inflight.delete(key);
      if (!error && data) {
        _cache.set(key, { data, ts: Date.now() });
        return data;
      }
      return null;
    })
    .catch(() => {
      _inflight.delete(key);
      return null;
    });

  _inflight.set(key, promise);
  return promise;
}

/** Force cache invalidation (called by refresh and on sign-out to avoid cross-user leak) */
export function invalidateUserPlanCache() {
  _cache = new Map();
  _inflight.clear();
}

export function useUserPlan(): UserPlanState {
  const { user } = useAuth();
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
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
    // Attendre la résolution du workspace actif : interroger trop tôt ferait
    // un appel en périmètre perso puis un second en périmètre workspace.
    if (workspaceLoading) return;

    try {
      const data = await fetchSubscription(activeWorkspace?.id);
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
  }, [user, isDemoMode, workspaceLoading, activeWorkspace?.id]);

  const refresh = useCallback(async () => {
    invalidateUserPlanCache();
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
    if (total.used >= total.limit) return false;
    // Même règle que l'enforcement (plan-limiter) : tant qu'il reste des bonus,
    // le cap catégorie ne bloque pas — seul le plafond global (bonus inclus) compte.
    return cat.used < cat.limit || bonusCredits > 0;
  }, [usage, isDemoMode, demoPlanResolved, isAdminUser, bonusCredits]);

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

  const remainingWithBonus = useCallback(() => {
    const monthly = remainingTotal();
    if (monthly === Infinity) return Infinity;
    return monthly + bonusCredits;
  }, [remainingTotal, bonusCredits]);

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
    remainingWithBonus,
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
