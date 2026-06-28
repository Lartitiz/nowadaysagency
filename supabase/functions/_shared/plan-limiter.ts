/**
 * Server-side AI quota management.
 * Checks per-category and total monthly limits, logs usage after success.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

// Modèle de crédits simplifié (2026-06) :
//  - `total` = LE compteur global unique de créations du mois (toutes catégories
//    de génération confondues). C'est le seul chiffre que voit la cliente.
//  - `audit` = sous-plafond dédié aux audits (compte dans `total`).
//  - `quality_max` = carrousels Opus « Qualité Max », le SEUL poste vraiment
//    coûteux → plafonné. Gratuit = 0 (réservé au payant). 20 ≈ break-even à 39€.
//  - `photo_retouch` = génération d'image (coût propre) → gardé borné.
//  - Toutes les autres catégories sont alignées sur `total` pour que le compteur
//    global soit la seule vraie limite (le détail par catégorie devient cosmétique).
export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    total: 23,
    content: 23,
    audit: 3,
    dm_comment: 23,
    bio_profile: 23,
    suggestion: 23,
    coach: 23,
    import: 23,
    adaptation: 23,
    deep_research: 23,
    photo_retouch: 5,
    quality_max: 0,
  },
  outil: {
    total: 9999,
    content: 9999,
    audit: 9999,
    dm_comment: 9999,
    bio_profile: 9999,
    suggestion: 9999,
    coach: 9999,
    import: 9999,
    adaptation: 9999,
    deep_research: 9999,
    photo_retouch: 50,
    quality_max: 20,
  },
  binome: {
    total: 9999,
    content: 9999,
    audit: 9999,
    dm_comment: 9999,
    bio_profile: 9999,
    suggestion: 9999,
    coach: 9999,
    import: 9999,
    adaptation: 9999,
    deep_research: 9999,
    photo_retouch: 100,
    quality_max: 40,
  },
};

/** Resolve legacy plan names still in DB to current plan keys */
const PLAN_ALIASES: Record<string, string> = {
  studio: "binome",
  now_pilot: "binome",
};

function resolvePlan(raw: string): string {
  return PLAN_ALIASES[raw] || raw;
}

const CATEGORY_LABELS: Record<string, string> = {
  content: "contenus",
  audit: "audits",
  dm_comment: "DM et commentaires",
  bio_profile: "bios et profils",
  suggestion: "suggestions",
  coach: "messages coach IA",
  import: "imports",
  adaptation: "adaptations",
  deep_research: "recherches approfondies",
  photo_retouch: "retouches photo",
  quality_max: "carrousels Qualité Max",
};

export interface QuotaResult {
  allowed: boolean;
  plan: string;
  remaining?: number;
  remaining_total?: number;
  reason?: "category" | "total" | "not_available" | "error";
  message?: string;
  usage?: Record<string, { used: number; limit: number }>;
}

/** Build a standard 429 Response for quota errors */
export function quotaDeniedResponse(quota: QuotaResult, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "limit_reached",
      message: quota.message,
      remaining: 0,
      category: quota.reason,
      quota,
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
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
  return resolvePlan(data?.plan || "free");
}

async function getWorkspacePlan(workspaceId: string): Promise<string> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("workspaces")
    .select("plan")
    .eq("id", workspaceId)
    .single();
  return resolvePlan(data?.plan || "free");
}

// Un programme d'accompagnement actif (Binôme) donne droit au plan binôme,
// même sans abonnement Stripe. Cohérent avec check-subscription (qui upgrade
// free -> binome quand un coaching_program actif existe). Sans ça, le quota
// traite en "free" une cliente binôme et la bloque à tort.
async function getCoachingPlan(userId: string): Promise<string> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("coaching_programs")
    .select("id")
    .eq("client_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data ? "binome" : "free";
}

/** Compare two plans and return the one with the highest total limit */
function bestPlan(planA: string, planB: string): string {
  const limitsA = PLAN_LIMITS[planA] || PLAN_LIMITS.free;
  const limitsB = PLAN_LIMITS[planB] || PLAN_LIMITS.free;
  return limitsA.total >= limitsB.total ? planA : planB;
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
  // Admin bypass — unlimited quota (check via has_role function)
  const sb = getServiceClient();
  const { data: adminCheck } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (adminCheck) {
    return { allowed: true, plan: "admin", remaining: 9999, remaining_total: 9999 };
  }

  // Plan effectif = le meilleur entre le plan perso (subscriptions),
  // le plan du workspace, et un éventuel programme d'accompagnement actif
  // (coaching_program) — pour rester cohérent avec check-subscription qui
  // pilote l'affichage. Sans le coaching_program, une cliente Binôme sans
  // abonnement Stripe était traitée en "free" et bloquée à tort.
  const userPlan = await getUserPlan(userId);
  const workspacePlan = workspaceId ? await getWorkspacePlan(workspaceId) : "free";
  const coachingPlan = await getCoachingPlan(userId);
  const plan = bestPlan(bestPlan(userPlan, workspacePlan), coachingPlan);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  // Check if category is available for this plan
  if ((limits[category] ?? 0) === 0) {
    const planLabel = plan === "free" ? "Premium" : "Binôme";
    return {
      allowed: false,
      plan,
      reason: "not_available",
      message: `Cette fonctionnalité est disponible à partir du plan ${planLabel}.`,
    };
  }

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

  const { data: usageRows, error: usageError } = await query;

  if (usageError) {
    return {
      allowed: false,
      plan,
      reason: "error",
      message: "Impossible de vérifier tes crédits pour le moment. Réessaie dans un instant.",
    };
  }

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
