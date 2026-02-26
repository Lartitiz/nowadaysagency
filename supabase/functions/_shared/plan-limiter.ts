/**
 * Server-side AI quota management.
 * Checks per-category and total monthly limits, logs usage after success.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    total: 25,
    content: 12,
    audit: 3,
    dm_comment: 5,
    bio_profile: 3,
    suggestion: 2,
    import: 1,
    adaptation: 2,
    deep_research: 5,
  },
  outil: {
    total: 100,
    content: 50,
    audit: 5,
    dm_comment: 25,
    bio_profile: 5,
    suggestion: 10,
    import: 3,
    adaptation: 10,
    deep_research: 15,
  },
  studio: {
    total: 300,
    content: 150,
    audit: 15,
    dm_comment: 60,
    bio_profile: 15,
    suggestion: 30,
    import: 10,
    adaptation: 30,
    deep_research: 30,
  },
  now_pilot: {
    total: 300,
    content: 150,
    audit: 15,
    dm_comment: 50,
    bio_profile: 15,
    suggestion: 30,
    import: 10,
    adaptation: 30,
    deep_research: 30,
  },
  pro: {
    total: 500,
    content: 250,
    audit: 25,
    dm_comment: 100,
    bio_profile: 25,
    suggestion: 50,
    import: 15,
    adaptation: 50,
    deep_research: 30,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "contenus",
  audit: "audits",
  dm_comment: "DM et commentaires",
  bio_profile: "bios et profils",
  suggestion: "suggestions",
  import: "imports",
  adaptation: "adaptations",
  deep_research: "recherches approfondies",
};

export interface QuotaResult {
  allowed: boolean;
  plan: string;
  remaining?: number;
  remaining_total?: number;
  reason?: "category" | "total" | "not_available";
  message?: string;
  usage?: Record<string, { used: number; limit: number }>;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getUserPlan(userId: string): Promise<string> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .single();
  return data?.plan || "free";
}

async function getWorkspacePlan(workspaceId: string): Promise<string> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("workspaces")
    .select("plan")
    .eq("id", workspaceId)
    .single();
  return data?.plan || "free";
}

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

async function getBonusCredits(userId: string): Promise<number> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("profiles")
    .select("bonus_credits")
    .eq("user_id", userId)
    .single();
  return data?.bonus_credits || 0;
}

export async function checkQuota(
  userId: string,
  category: string,
  workspaceId?: string
): Promise<QuotaResult> {
  const plan = workspaceId
    ? await getWorkspacePlan(workspaceId)
    : await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  // Check if category is available for this plan
  if ((limits[category] ?? 0) === 0) {
    const planLabel = plan === "free" ? "Outil" : "Now Studio";
    return {
      allowed: false,
      plan,
      reason: "not_available",
      message: `Cette fonctionnalité est disponible à partir du plan ${planLabel}.`,
    };
  }

  const sb = getServiceClient();
  const monthStart = getMonthStart();

  // Get bonus credits for the user
  const bonusCredits = await getBonusCredits(userId);
  const effectiveTotalLimit = limits.total + bonusCredits;

  // Get all usage this month — filter by workspace or user
  const query = sb
    .from("ai_usage")
    .select("category")
    .gte("created_at", monthStart);

  if (workspaceId) {
    query.eq("workspace_id", workspaceId);
  } else {
    query.eq("user_id", userId);
  }

  const { data: usageRows } = await query;

  const rows = usageRows || [];
  const totalUsed = rows.length;
  const categoryUsed = rows.filter((r: any) => r.category === category).length;

  // Build usage map (effective total includes bonus)
  const usageMap: Record<string, { used: number; limit: number }> = {};
  for (const cat of Object.keys(limits)) {
    if (cat === "total") continue;
    const used = rows.filter((r: any) => r.category === cat).length;
    usageMap[cat] = { used, limit: limits[cat] };
  }
  usageMap.total = { used: totalUsed, limit: effectiveTotalLimit };

  // Check total limit (monthly + bonus)
  if (totalUsed >= effectiveTotalLimit) {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    const monthLabel = nextMonth.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    return {
      allowed: false,
      plan,
      reason: "total",
      remaining: 0,
      remaining_total: 0,
      usage: usageMap,
      message: `Tu as utilisé tes ${effectiveTotalLimit} générations IA ce mois. Tes crédits se renouvellent le ${monthLabel}.`,
    };
  }

  // Check category limit
  if (categoryUsed >= limits[category]) {
    const label = CATEGORY_LABELS[category] || category;
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    const monthLabel = nextMonth.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    return {
      allowed: false,
      plan,
      reason: "category",
      remaining: 0,
      remaining_total: effectiveTotalLimit - totalUsed,
      usage: usageMap,
      message: `Tu as utilisé tes ${limits[category]} ${label} ce mois. Tes crédits se renouvellent le ${monthLabel}.`,
    };
  }

  return {
    allowed: true,
    plan,
    remaining: limits[category] - categoryUsed - 1,
    remaining_total: effectiveTotalLimit - totalUsed - 1,
    usage: usageMap,
  };
}

export async function logUsage(
  userId: string,
  category: string,
  actionType: string,
  tokensUsed?: number,
  modelUsed?: string,
  workspaceId?: string
): Promise<void> {
  const sb = getServiceClient();
  await sb.from("ai_usage").insert({
    user_id: userId,
    category,
    action_type: actionType,
    tokens_used: tokensUsed || null,
    model_used: modelUsed || null,
    workspace_id: workspaceId || null,
  });

  // After logging, check if user exceeded monthly base limit → decrement bonus
  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const monthStart = getMonthStart();

  const { data: usageRows } = await sb
    .from("ai_usage")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", monthStart);

  const totalUsed = (usageRows || []).length;

  // If usage exceeds monthly base limit, this credit came from bonus
  if (totalUsed > limits.total) {
    const { data: profile } = await sb
      .from("profiles")
      .select("bonus_credits")
      .eq("user_id", userId)
      .single();
    const currentBonus = profile?.bonus_credits || 0;
    if (currentBonus > 0) {
      await sb
        .from("profiles")
        .update({ bonus_credits: currentBonus - 1 })
        .eq("user_id", userId);
    }
  }
}

/** @deprecated Use checkQuota + logUsage instead */
export async function checkAndIncrementUsage(
  _supabase: any,
  userId: string,
  type: "generation" | "audit" = "generation"
): Promise<{ allowed: boolean; remaining?: number; plan: string; error?: string }> {
  const category = type === "audit" ? "audit" : "content";
  const result = await checkQuota(userId, category);
  if (!result.allowed) {
    return { allowed: false, plan: result.plan, error: result.message };
  }
  // Log immediately for backward compat
  await logUsage(userId, category, type === "audit" ? "audit_instagram" : "content_generic");
  return { allowed: true, remaining: result.remaining, plan: result.plan };
}
