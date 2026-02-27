import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";
const PLAN_PRICES: Record<string, number> = { outil: 39, studio: 250, now_pilot: 250, pro: 79 };

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userEmail = authUser.email;
    if (userEmail !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Service role client for admin queries
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "list";

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    if (mode === "stats") {
      return new Response(JSON.stringify(await getStats(supabase, monthStart, now)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: list
    return new Response(JSON.stringify(await getList(supabase, monthStart)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-users error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// ── Branding score helpers ──

const BRAND_PROFILE_FIELDS = [
  "mission", "offer", "positioning", "target_description", "target_problem", "target_beliefs", "target_verbatims",
  "tone_description", "tone_style", "tone_register", "tone_level", "tone_humor", "tone_engagement",
  "tone_do", "tone_dont", "combats", "combat_cause", "combat_fights", "combat_refusals", "combat_alternative",
  "story_origin", "story_struggles", "story_turning_point", "story_unique", "story_vision", "story_full",
  "value_prop_problem", "value_prop_solution", "value_prop_difference", "value_prop_proof", "value_prop_sentence",
  "content_editorial_line", "content_twist", "content_frequency", "key_expressions", "things_to_avoid",
  "voice_description", "visual_style",
];

const PERSONA_FIELDS = [
  "description", "daily_life", "quote", "starting_point",
  "step_1_frustrations", "step_2_transformation", "step_3a_objections", "step_3b_cliches",
  "step_4_beautiful", "step_4_feeling", "step_4_inspiring", "step_4_repulsive", "step_5_actions",
  "pitch_short", "pitch_medium", "pitch_long", "portrait_prenom",
];

const STORYTELLING_FIELDS = [
  "step_1_raw", "step_2_location", "step_3_action", "step_4_thoughts", "step_5_emotions",
  "step_6_full_story", "step_7_polished", "title", "pitch_short", "pitch_medium", "pitch_long",
];

const PROPOSITION_FIELDS = [
  "step_1_what", "step_2a_process", "step_2b_values", "step_2c_feedback", "step_2d_refuse", "step_3_for_whom",
  "version_one_liner", "version_short", "version_complete", "version_pitch", "version_bio",
  "version_emotional", "version_engagee", "version_networking", "version_site_web", "version_pitch_naturel", "version_final",
];

const STRATEGY_FIELDS = [
  "step_1_hidden_facets", "pillar_major", "pillar_minor_1", "pillar_minor_2", "pillar_minor_3",
  "facet_1", "facet_1_format", "facet_2", "facet_2_format", "facet_3", "facet_3_format", "creative_concept",
];

const TOTAL_BRANDING_FIELDS =
  BRAND_PROFILE_FIELDS.length + PERSONA_FIELDS.length + STORYTELLING_FIELDS.length +
  PROPOSITION_FIELDS.length + STRATEGY_FIELDS.length;

function countNonNull(row: Record<string, unknown> | null, fields: string[]): number {
  if (!row) return 0;
  return fields.filter((f) => row[f] != null && row[f] !== "").length;
}

// ── LIST mode ──

async function getList(supabase: any, monthStart: string) {
  // Fetch all data in parallel
  const [profilesRes, subsRes, aiRes, brandRes, personaRes, storyRes, propRes, stratRes] = await Promise.all([
    supabase.from("profiles").select("user_id, prenom, email, activite, type_activite, created_at"),
    supabase.from("subscriptions").select("user_id, plan, status"),
    supabase.from("ai_usage").select("user_id").gte("created_at", monthStart),
    supabase.from("brand_profile").select("user_id, " + BRAND_PROFILE_FIELDS.join(", ")),
    supabase.from("persona").select("user_id, " + PERSONA_FIELDS.join(", ")),
    supabase.from("storytelling").select("user_id, " + STORYTELLING_FIELDS.join(", ")),
    supabase.from("brand_proposition").select("user_id, " + PROPOSITION_FIELDS.join(", ")),
    supabase.from("brand_strategy").select("user_id, " + STRATEGY_FIELDS.join(", ")),
  ]);

  // Auth users for last_sign_in_at
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 10000 });

  const authMap = new Map<string, string>();
  if (authUsers?.users) {
    for (const u of authUsers.users) {
      authMap.set(u.id, u.last_sign_in_at || null);
    }
  }

  // Index helpers
  const subsMap = new Map<string, { plan: string; status: string }>();
  for (const s of subsRes.data || []) subsMap.set(s.user_id, { plan: s.plan, status: s.status });

  const aiCountMap = new Map<string, number>();
  for (const a of aiRes.data || []) aiCountMap.set(a.user_id, (aiCountMap.get(a.user_id) || 0) + 1);

  const indexByUser = (arr: any[]) => {
    const m = new Map<string, any>();
    for (const r of arr || []) if (!m.has(r.user_id)) m.set(r.user_id, r);
    return m;
  };

  const brandMap = indexByUser(brandRes.data);
  const personaMap = indexByUser(personaRes.data);
  const storyMap = indexByUser(storyRes.data);
  const propMap = indexByUser(propRes.data);
  const stratMap = indexByUser(stratRes.data);

  const users = (profilesRes.data || []).map((p: any) => {
    const uid = p.user_id;
    const sub = subsMap.get(uid);
    const filled =
      countNonNull(brandMap.get(uid), BRAND_PROFILE_FIELDS) +
      countNonNull(personaMap.get(uid), PERSONA_FIELDS) +
      countNonNull(storyMap.get(uid), STORYTELLING_FIELDS) +
      countNonNull(propMap.get(uid), PROPOSITION_FIELDS) +
      countNonNull(stratMap.get(uid), STRATEGY_FIELDS);

    return {
      user_id: uid,
      prenom: p.prenom,
      email: p.email,
      activite: p.activite,
      activite_type: p.type_activite,
      plan: sub?.plan || "free",
      plan_status: sub?.status || "none",
      ai_usage_count: aiCountMap.get(uid) || 0,
      last_sign_in: authMap.get(uid) || null,
      created_at: p.created_at,
      branding_score: Math.round((filled / TOTAL_BRANDING_FIELDS) * 100),
    };
  });

  return { users, total: users.length };
}

// ── STATS mode ──

async function getStats(supabase: any, monthStart: string, now: Date) {
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStart = prevMonthDate.toISOString();
  const prevMonthEnd = monthStart;

  const [
    profilesRes, subsRes, aiRes, brandRes, personaRes, storyRes, propRes, stratRes,
    aiPrevRes, draftsRes, calendarRes, scoresRes, authUsersRes,
  ] = await Promise.all([
    supabase.from("profiles").select("user_id, prenom, email, created_at, onboarding_completed, type_activite, canaux, level"),
    supabase.from("subscriptions").select("user_id, plan, status, created_at, canceled_at, current_period_start, current_period_end, source"),
    supabase.from("ai_usage").select("user_id, category, created_at, action_type, tokens_used").gte("created_at", monthStart),
    supabase.from("brand_profile").select("user_id, " + BRAND_PROFILE_FIELDS.join(", ")),
    supabase.from("persona").select("user_id, " + PERSONA_FIELDS.join(", ")),
    supabase.from("storytelling").select("user_id, " + STORYTELLING_FIELDS.join(", ")),
    supabase.from("brand_proposition").select("user_id, " + PROPOSITION_FIELDS.join(", ")),
    supabase.from("brand_strategy").select("user_id, " + STRATEGY_FIELDS.join(", ")),
    supabase.from("ai_usage").select("user_id, category, created_at").gte("created_at", prevMonthStart).lt("created_at", prevMonthEnd),
    supabase.from("content_drafts").select("user_id, created_at, canal, status").gte("created_at", monthStart),
    supabase.from("calendar_posts").select("user_id, created_at, canal, status").gte("created_at", monthStart),
    supabase.from("content_scores").select("user_id, global_score, created_at").gte("created_at", monthStart),
    supabase.auth.admin.listUsers({ perPage: 10000 }),
  ]);

  // Auth map
  const authMap = new Map<string, string>();
  if (authUsersRes.data?.users) {
    for (const u of authUsersRes.data.users) {
      authMap.set(u.id, u.last_sign_in_at || "");
    }
  }

  const profiles = profilesRes.data || [];
  const adminUserId = profiles.find((p: any) => p.email === ADMIN_EMAIL)?.user_id;
  const clientProfiles = profiles.filter((p: any) => p.user_id !== adminUserId);

  const totalUsers = clientProfiles.length;
  const newThisMonth = clientProfiles.filter((p: any) => p.created_at >= monthStart).length;
  const onboardingCompleted = clientProfiles.filter((p: any) => p.onboarding_completed).length;

  // Previous month comparisons
  const aiPrevData = aiPrevRes.data || [];
  const prevActiveUserIds = new Set(aiPrevData.map((a: any) => a.user_id));
  const newPrevMonth = clientProfiles.filter((p: any) => p.created_at >= prevMonthStart && p.created_at < prevMonthEnd).length;

  // Plans & subscriptions
  const subs = subsRes.data || [];
  const plans: Record<string, number> = { free: 0, outil: 0, studio: 0, now_pilot: 0 };
  const subsByUser = new Map<string, any>();
  for (const s of subs) {
    subsByUser.set(s.user_id, s);
  }
  for (const p of profiles) {
    const plan = subsByUser.get(p.user_id)?.plan || "free";
    plans[plan] = (plans[plan] || 0) + 1;
  }

  // Séparer les vraies abonnées payantes des accès promo
  const paidSubs = subs.filter((s: any) => s.source !== "promo" && s.plan !== "now_pilot" && s.user_id !== adminUserId);
  const promoSubs = subs.filter((s: any) => (s.source === "promo" || s.plan === "now_pilot") && s.user_id !== adminUserId);

  // Business metrics : seulement les abonnements payants (pas les promos)
  const activePaidSubs = paidSubs.filter((s: any) => (s.status === "active" || s.status === "trialing") && s.plan !== "free");
  let mrr = 0;
  const revenueByPlan: Record<string, number> = {};
  for (const s of activePaidSubs) {
    const price = PLAN_PRICES[s.plan] || 0;
    mrr += price;
    revenueByPlan[s.plan] = (revenueByPlan[s.plan] || 0) + price;
  }
  const churnedThisMonth = paidSubs.filter((s: any) => s.canceled_at && s.canceled_at >= monthStart).length;
  const totalPaidStart = activePaidSubs.length + churnedThisMonth;
  const churnRate = totalPaidStart > 0 ? Math.round((churnedThisMonth / totalPaidStart) * 100) : 0;
  const paidUsers = activePaidSubs.length;
  const conversionRate = totalUsers > 0 ? Math.round((paidUsers / totalUsers) * 100) : 0;

  // AI usage current month
  const aiData = aiRes.data || [];
  const activeUserIds = new Set(aiData.map((a: any) => a.user_id));
  const aiByCategory: Record<string, number> = {};
  const aiByActionType: Record<string, number> = {};
  let totalTokens = 0;
  const aiCountByUser = new Map<string, number>();
  for (const a of aiData) {
    aiByCategory[a.category] = (aiByCategory[a.category] || 0) + 1;
    const at = a.action_type || "unknown";
    aiByActionType[at] = (aiByActionType[at] || 0) + 1;
    totalTokens += (a.tokens_used || 0);
    aiCountByUser.set(a.user_id, (aiCountByUser.get(a.user_id) || 0) + 1);
  }
  const topFeatures = Object.entries(aiByCategory)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Retention
  const activeThisMonthIds = activeUserIds;
  const retainedUsers = [...activeThisMonthIds].filter(id => prevActiveUserIds.has(id)).length;
  const retentionRate = prevActiveUserIds.size > 0 ? Math.round((retainedUsers / prevActiveUserIds.size) * 100) : 0;

  // Active week / month from auth
  const now7 = new Date(now); now7.setDate(now7.getDate() - 7);
  const now30 = new Date(now); now30.setDate(now30.getDate() - 30);
  let activeWeek = 0;
  let activeMonth = 0;
  for (const [, lastSign] of authMap) {
    if (!lastSign) continue;
    const d = new Date(lastSign);
    if (d >= now7) activeWeek++;
    if (d >= now30) activeMonth++;
  }

  // AI by day (last 30 days)
  const aiByDay: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = aiData.filter((a: any) => (a.created_at || "").startsWith(dateStr)).length;
    aiByDay.push({ date: dateStr, count });
  }

  // Power users
  const powerUsers = [...aiCountByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, count]) => {
      const prof = profiles.find((p: any) => p.user_id === userId);
      const sub = subsByUser.get(userId);
      return { user_id: userId, prenom: prof?.prenom || prof?.email || "Anonyme", plan: sub?.plan || "free", count };
    });

  // Content metrics
  const drafts = draftsRes.data || [];
  const calPosts = calendarRes.data || [];
  const scores = scoresRes.data || [];
  const draftsByCanalMap: Record<string, number> = {};
  for (const d of drafts) { const c = d.canal || "autre"; draftsByCanalMap[c] = (draftsByCanalMap[c] || 0) + 1; }
  const calendarByCanalMap: Record<string, number> = {};
  for (const c of calPosts) { const cn = c.canal || "autre"; calendarByCanalMap[cn] = (calendarByCanalMap[cn] || 0) + 1; }
  const avgContentScore = scores.length > 0 ? Math.round(scores.reduce((s: number, r: any) => s + (r.global_score || 0), 0) / scores.length) : 0;

  // Branding scores
  const indexByUser = (arr: any[]) => {
    const m = new Map<string, any>();
    for (const r of arr || []) if (!m.has(r.user_id)) m.set(r.user_id, r);
    return m;
  };
  const brandMap = indexByUser(brandRes.data);
  const personaMap = indexByUser(personaRes.data);
  const storyMap = indexByUser(storyRes.data);
  const propMap = indexByUser(propRes.data);
  const stratMap = indexByUser(stratRes.data);

  let totalScore = 0;
  let scoredCount = 0;
  const scoreDistribution: Record<string, number> = { "0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0 };
  for (const p of profiles) {
    const uid = p.user_id;
    const filled =
      countNonNull(brandMap.get(uid), BRAND_PROFILE_FIELDS) +
      countNonNull(personaMap.get(uid), PERSONA_FIELDS) +
      countNonNull(storyMap.get(uid), STORYTELLING_FIELDS) +
      countNonNull(propMap.get(uid), PROPOSITION_FIELDS) +
      countNonNull(stratMap.get(uid), STRATEGY_FIELDS);
    if (filled > 0) {
      const score = Math.round((filled / TOTAL_BRANDING_FIELDS) * 100);
      totalScore += score;
      scoredCount++;
      if (score <= 25) scoreDistribution["0-25"]++;
      else if (score <= 50) scoreDistribution["26-50"]++;
      else if (score <= 75) scoreDistribution["51-75"]++;
      else scoreDistribution["76-100"]++;
    }
  }

  // Demographics (clients only)
  const activityTypes: Record<string, number> = {};
  const levels: Record<string, number> = {};
  const channelPopularity: Record<string, number> = {};
  for (const p of clientProfiles) {
    const at = p.type_activite || "non renseigné";
    activityTypes[at] = (activityTypes[at] || 0) + 1;
    const lv = p.level || "non renseigné";
    levels[lv] = (levels[lv] || 0) + 1;
    if (Array.isArray(p.canaux)) {
      for (const ch of p.canaux) { channelPopularity[ch] = (channelPopularity[ch] || 0) + 1; }
    }
  }

  // Signups by week (last 12 weeks)
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  const signupsByWeek: { week: string; count: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const weekStart = new Date(twelveWeeksAgo);
    weekStart.setDate(weekStart.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const wStr = weekStart.toISOString().slice(0, 10);
    const count = clientProfiles.filter((p: any) => {
      const d = new Date(p.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;
    signupsByWeek.push({ week: wStr, count });
  }

  return {
    // Existing
    total_users: totalUsers,
    new_this_month: newThisMonth,
    active_this_month: activeUserIds.size,
    plans,
    ai_total_this_month: aiData.length,
    ai_by_category: aiByCategory,
    avg_branding_score: scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0,
    onboarding_completed: onboardingCompleted,
    onboarding_rate: totalUsers > 0 ? Math.round((onboardingCompleted / totalUsers) * 100) : 0,
    top_features: topFeatures,
    signups_by_week: signupsByWeek,
    // Comparisons
    new_prev_month: newPrevMonth,
    active_prev_month: prevActiveUserIds.size,
    ai_total_prev_month: aiPrevData.length,
    // Business
    mrr,
    churn_rate: churnRate,
    churned_this_month: churnedThisMonth,
    conversion_rate: conversionRate,
    paid_users: paidUsers,
    revenue_by_plan: revenueByPlan,
    promo_users: promoSubs.filter((s: any) => s.status === "active").length,
    active_paid_subs: activePaidSubs.length,
    // Engagement
    active_week: activeWeek,
    active_month: activeMonth,
    retention_rate: retentionRate,
    retained_users: retainedUsers,
    ai_by_day: aiByDay,
    total_tokens: totalTokens,
    power_users: powerUsers,
    // Content
    drafts_this_month: drafts.length,
    calendar_posts_this_month: calPosts.length,
    avg_content_score: avgContentScore,
    drafts_by_canal: draftsByCanalMap,
    calendar_by_canal: calendarByCanalMap,
    // Branding
    score_distribution: scoreDistribution,
    // Demographics
    activity_types: activityTypes,
    levels,
    channel_popularity: channelPopularity,
    ai_by_action_type: aiByActionType,
  };
}
