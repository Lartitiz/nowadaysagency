/**
 * Server-side AI quota management.
 * Checks per-category and total monthly limits, logs usage after success.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { assertWorkspaceMembership } from "./workspace-guard.ts";

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
  // Panne de vérification (fail-closed) ≠ quota épuisé : surtout ne pas renvoyer
  // limit_reached — le front afficherait « tu as utilisé tous tes crédits » +
  // upsell, mensonger pour une cliente qui n'a rien consommé. On renvoie un 503
  // distinct que le front traite comme une erreur passagère à réessayer.
  if (quota.reason === "error") {
    return new Response(
      JSON.stringify({ error: "quota_check_failed", message: quota.message, quota }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
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

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getUserPlan(sb: any, userId: string): Promise<string> {
  const { data } = await sb
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .single();
  return resolvePlan(data?.plan || "free");
}

async function getWorkspacePlan(sb: any, workspaceId: string): Promise<string> {
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
async function getCoachingPlan(sb: any, userId: string): Promise<string> {
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

/**
 * Plan EFFECTIF = le meilleur entre le plan perso (subscriptions), le plan du
 * workspace et un éventuel programme d'accompagnement actif (coaching_programs).
 * SOURCE DE VÉRITÉ UNIQUE : l'affichage (check-subscription) et l'enforcement
 * (checkQuota/logUsage) doivent TOUS LES DEUX passer par ici — toute divergence
 * ré-introduit le bug « header N restantes pendant que le serveur refuse » (T19).
 */
export async function getEffectivePlan(sb: any, userId: string, workspaceId?: string): Promise<string> {
  const userPlan = await getUserPlan(sb, userId);
  const workspacePlan = workspaceId ? await getWorkspacePlan(sb, workspaceId) : "free";
  const coachingPlan = await getCoachingPlan(sb, userId);
  return bestPlan(bestPlan(userPlan, workspacePlan), coachingPlan);
}

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * Usage IA du mois courant, dans le MÊME périmètre que l'enforcement :
 * par workspace quand il y en a un, par user sinon. Exporté pour que
 * check-subscription compte exactement comme checkQuota.
 */
export function getMonthlyUsageRows(sb: any, userId: string, workspaceId?: string) {
  const query = sb
    .from("ai_usage")
    .select("category")
    .gte("created_at", getMonthStart());
  if (workspaceId) {
    query.eq("workspace_id", workspaceId);
  } else {
    query.eq("user_id", userId);
  }
  return query;
}

/**
 * Périmètre de facturation DÉTERMINISTE (fix 10/07/2026). Les lignes ai_usage
 * partaient avec workspace_id NULL dès que le client omettait le champ (observé
 * en live : carousel_deepening_questions et carousel_express_full NULL pendant
 * que carousel_visual était rattaché) → une partie de la génération échappait
 * au comptage par workspace de checkQuota / check-subscription, et le coût d'un
 * même contenu dépendait du contexte d'appel. Résolution côté serveur :
 *  - workspace fourni ET membre → conservé (manager sur l'espace d'une cliente) ;
 *  - fourni mais NON membre → ignoré (jamais compter ni facturer sur l'espace
 *    d'autrui, ni hériter de son plan) ;
 *  - absent → workspace PROPRE de l'utilisatrice (owner, créé au signup) ;
 *    à défaut (compte legacy sans workspace), périmètre par user comme avant.
 */
export async function resolveBillingWorkspaceId(
  sb: any,
  userId: string,
  workspaceId?: string | null,
): Promise<string | undefined> {
  if (workspaceId) {
    const guard = await assertWorkspaceMembership(sb, userId, workspaceId);
    if (guard.ok) return workspaceId;
  }
  const { data } = await sb
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    // FIX 26/07 : `workspace_members` n'a PAS de colonne `created_at` (seulement
    // `joined_at`) → l'ancien `.order("created_at")` renvoyait une erreur PostgREST
    // silencieuse → `data=null` → le périmètre de facturation retombait TOUJOURS
    // en user-scope (le fix déterministe du 10/07 était donc muet).
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.workspace_id) {
    console.warn(
      `[plan-limiter] resolveBillingWorkspaceId: aucun espace owner pour ${userId} — périmètre facturation = user (dégradé).`,
    );
  }
  return data?.workspace_id ?? undefined;
}

export async function getBonusCredits(sb: any, userId: string): Promise<number> {
  const { data } = await sb
    .from("profiles")
    .select("bonus_credits")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.bonus_credits || 0;
}

// Bypass comptes QA — DÉTERMINISTE : Set d'UUID en dur, AUCUNE résolution
// réseau. L'ancien mécanisme (Set d'emails + sb.auth.admin.getUserById avec
// catch silencieux) échouait par intermittence : le 10/07/2026, 3 générations
// du compte QA ont été facturées (lignes ai_usage + bonus 133→130) pendant que
// d'autres du même jour étaient bypassées. Un UUID auth est stable à vie, la
// comparaison est locale et infaillible. checkQuota et logUsage passent TOUS
// LES DEUX par ce même Set : un seul mécanisme, zéro point de panne.
// ⚠️ NE PAS élargir sans demande explicite : les autres comptes test (Margot…)
// servent justement à mesurer la facturation réelle et ne doivent JAMAIS être
// bypassés. Comparaison EXACTE (code de facturation : jamais de match partiel).
const QA_TEST_USER_IDS = new Set<string>([
  "52e6c03c-a7de-4c20-9b4a-276751f976e8", // laetitiatest@nowadaysagency.com (Camille)
]);

export function isQaTestAccount(userId: string): boolean {
  return QA_TEST_USER_IDS.has(userId);
}

export async function checkQuota(
  userId: string,
  category: string,
  workspaceId?: string,
  sbOverride?: any
): Promise<QuotaResult> {
  // Admin bypass — unlimited quota (check via has_role function)
  // `sbOverride` permet d'injecter un faux client en test (cf. plan-limiter_test.ts).
  const sb = sbOverride ?? getServiceClient();
  const { data: adminCheck } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (adminCheck) {
    return { allowed: true, plan: "admin", remaining: 9999, remaining_total: 9999 };
  }

  // Bypass comptes QA (cf. QA_TEST_USER_IDS) : autorisés à générer sans limite
  // pour les tests automatisés, MAIS on garde leur plan RÉEL (souvent "free")
  // pour que le gating UI/tests reflète l'expérience d'une vraie cliente free.
  // On ne loggue pas non plus (logUsage a son propre check) → aucune écriture
  // ai_usage pour ces comptes.
  if (isQaTestAccount(userId)) {
    const realPlan = await getEffectivePlan(sb, userId, workspaceId);
    return { allowed: true, plan: realPlan, remaining: 9999, remaining_total: 9999 };
  }

  // Périmètre résolu côté serveur — voir resolveBillingWorkspaceId.
  const billingWorkspaceId = await resolveBillingWorkspaceId(sb, userId, workspaceId);

  const plan = await getEffectivePlan(sb, userId, billingWorkspaceId);
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

  // Get bonus credits for the user
  const bonusCredits = await getBonusCredits(sb, userId);
  const effectiveTotalLimit = limits.total + bonusCredits;

  const { data: usageRows, error: usageError } = await getMonthlyUsageRows(sb, userId, billingWorkspaceId);

  if (usageError) {
    return {
      allowed: false,
      plan,
      reason: "error",
      // ⚠️ Éviter les mots « crédit(s) » / « quota » / « limite » dans ce message :
      // plusieurs surfaces front (friendlyError, NewsjackingPanel…) les détectent
      // par substring et basculeraient sur l'UI « plus de crédits » mensongère.
      message: "Impossible de vérifier ton abonnement pour le moment. Réessaie dans un instant.",
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

  // Check category limit — le cap catégorie protège la répartition du mensuel
  // de BASE. Les bonus_credits sont un dépassement TOUTES-CATÉGORIES (même
  // sémantique que leur consommation dans logUsage : tout usage au-delà du
  // mensuel de base décrémente un bonus) → tant qu'il reste des bonus, le cap
  // catégorie ne bloque pas. Sans ça, sur plan free (content = total = 23),
  // les bonus ne pouvaient JAMAIS servir à générer du contenu : vécu le 05/07,
  // compte recrédité de 190 bonus, header « 190 restants », génération refusée.
  // Le plafond global reste vérifié au-dessus (effectiveTotalLimit inclut les
  // bonus) ; les catégories à cap 0 (quality_max sur free) restent indisponibles
  // (return not_available plus haut, les bonus ne les débloquent pas).
  if (categoryUsed >= limits[category] && bonusCredits <= 0) {
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
    // clamp 0 : quand un bonus by-passe le cap catégorie, le calcul brut devient négatif
    remaining: Math.max(0, limits[category] - categoryUsed - 1),
    remaining_total: effectiveTotalLimit - totalUsed - 1,
    usage: usageMap,
  };
}

/**
 * Étiquette `model_used` des générations rendues SANS appel modèle (rendu
 * déterministe côté serveur — aujourd'hui le carrousel photo pur, composé par
 * code depuis le chantier gabarits du 13/07).
 *
 * Pourquoi une étiquette plutôt que NULL : un `model_used` NULL est ambigu. Il
 * peut vouloir dire « aucun modèle appelé, coût API nul » (le cas ici, sain) ou
 * « modèle appelé mais oublié dans la grille tarifaire » (le bug corrigé par la
 * PR #697, qui rendait le compteur € aveugle à `claude-sonnet-5`). La garde
 * `modeles_non_tarifes` de `cron-health` ne peut pas distinguer les deux et
 * signale les deux — à raison. On lève donc l'ambiguïté À LA SOURCE.
 *
 * ⚠️ Ce littéral est recopié dans `cron-health/index.ts` (`ZERO_COST_LABELS`),
 * qui n'importe VOLONTAIREMENT rien de `_shared/` pour rester déployable seule.
 * Toute modification doit toucher les deux.
 */
export const COMPOSED_BY_CODE_MODEL = "composition-code";

export async function logUsage(
  userId: string,
  category: string,
  actionType: string,
  tokensUsed?: number,
  modelUsed?: string,
  workspaceId?: string,
  sbOverride?: any
): Promise<void> {
  const sb = sbOverride ?? getServiceClient();

  // Bypass comptes QA (même Set déterministe que checkQuota, cf.
  // QA_TEST_USER_IDS) : on ne loggue rien pour ces comptes afin que la QA
  // automatisée puisse tourner tous les jours sans polluer ai_usage ni
  // consommer de bonus.
  if (isQaTestAccount(userId)) return;

  // Même périmètre que checkQuota : le workspace est résolu côté serveur pour
  // que TOUTE ligne ai_usage porte un workspace_id (les ~20 edges qui n'en
  // passent pas retombent sur le workspace propre de l'utilisatrice).
  const billingWorkspaceId = await resolveBillingWorkspaceId(sb, userId, workspaceId);

  // eslint-disable-next-line nowadays/require-supabase-error-check -- log d'usage IA volontairement fire-and-forget : un échec ne doit jamais bloquer la réponse déjà générée à l'utilisatrice
  await sb.from("ai_usage").insert({
    user_id: userId,
    category,
    action_type: actionType,
    tokens_used: tokensUsed || null,
    model_used: modelUsed || null,
    workspace_id: billingWorkspaceId || null,
  });


  // After logging, check if user exceeded monthly base limit → decrement bonus.
  // Le plan et le périmètre de comptage doivent être LES MÊMES que dans checkQuota
  // (meilleur de perso/workspace/coaching, usage compté par workspace si fourni) :
  // sinon une cliente Premium/Binôme voit ses bonus_credits fondre à tort dès que
  // son compteur perso dépasse le plafond du plan gratuit.
  const { data: adminCheck } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (adminCheck) return;

  const plan = await getEffectivePlan(sb, userId, billingWorkspaceId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const { data: usageRows } = await getMonthlyUsageRows(sb, userId, billingWorkspaceId);

  const totalUsed = (usageRows || []).length;

  // If usage exceeds monthly base limit, this credit came from bonus.
  // Décrément ATOMIQUE (anti race condition) : la RPC fait un UPDATE conditionnel
  // verrouillé (-1 seulement si > 0) en une requête, au lieu d'un read-modify-write.
  // Best-effort : on log sans throw (ne casse pas la génération déjà effectuée).
  if (totalUsed > limits.total) {
    const { error: decErr } = await sb.rpc("consume_bonus_credit", { p_user_id: userId });
    if (decErr) console.error("consume_bonus_credit failed", decErr);
  }
}
