// Edge « activation-funnel » — tunnel d'activation AGRÉGÉ, lisible par le cron
// (visite-guidee-quotidienne, étape 8). Source de vérité = Supabase (exact,
// immunisé adblockers + bug de tracking SPA — contrairement à PostHog).
//
// Sécurité : lecture seule, AUCUNE PII en sortie (seulement des compteurs et des
// médianes). Gardé par un secret partagé `CRON_STATS_SECRET` (header x-cron-secret).
// Réplique la logique du tunnel de `admin-users?mode=stats` pour que les chiffres
// COÏNCIDENT avec le dashboard admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";
// Comptes internes exclus des stats (mêmes que admin-users) + alias de test +cs/+qaneuf.
const EXCLUDED_EMAILS = [
  ADMIN_EMAIL,
  "laetitiatest@nowadaysagency.com",       // Camille (visite quotidienne)
  "laetitia+qaneuf0407@nowadaysagency.com", // Élodie (qa neuf)
];
const isExcludedEmail = (e: string | null) =>
  !!e && (EXCLUDED_EMAILS.includes(e) || /^laetitia\+cs/i.test(e)); // +cs… = comptes du smoke à froid

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const secret = Deno.env.get("CRON_STATS_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [profRes, aiRes, calRes] = await Promise.all([
      supabase.from("profiles").select("user_id, email, created_at, onboarding_completed"),
      supabase.from("ai_usage").select("user_id, created_at"),
      supabase.from("calendar_posts").select("user_id, status, publish_status, published_at"),
    ]);
    if (profRes.error) throw profRes.error;

    const profiles = (profRes.data || []).filter((p: any) => !isExcludedEmail(p.email));
    const clientIds = new Set(profiles.map((p: any) => p.user_id));
    const ai = (aiRes.data || []).filter((a: any) => clientIds.has(a.user_id));
    const cal = (calRes.data || []).filter((c: any) => clientIds.has(c.user_id));

    const isPublished = (c: any) => c.publish_status === "published" || c.status === "published";
    const totalUsers = profiles.length;
    const onboardingCompleted = profiles.filter((p: any) => p.onboarding_completed).length;
    const everGenerated = new Set(ai.map((a: any) => a.user_id)).size;
    const everPosted = new Set(cal.map((c: any) => c.user_id)).size;
    const everPublished = new Set(cal.filter(isPublished).map((c: any) => c.user_id)).size;

    const funnel = [
      { step: "Inscrites", count: totalUsers },
      { step: "Onboarding terminé", count: onboardingCompleted },
      { step: "≥1 génération IA", count: everGenerated },
      { step: "≥1 post au calendrier", count: everPosted },
      { step: "≥1 publication", count: everPublished },
    ];

    // Vitesse d'activation (médiane jours inscription → 1re génération).
    const DAY = 86400000;
    const signup = new Map<string, number>();
    for (const p of profiles) if (p.created_at) signup.set(p.user_id, new Date(p.created_at).getTime());
    const firstGen = new Map<string, number>();
    for (const a of ai) {
      if (!a.created_at) continue;
      const t = new Date(a.created_at).getTime();
      const cur = firstGen.get(a.user_id);
      if (cur === undefined || t < cur) firstGen.set(a.user_id, t);
    }
    const genDelays: number[] = [];
    for (const [uid, t] of firstGen) { const s = signup.get(uid); if (s !== undefined && t >= s) genDelays.push((t - s) / DAY); }
    const median = (arr: number[]): number | null => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const median_days_to_first_gen = genDelays.length ? Math.round(median(genDelays)! * 10) / 10 : null;

    // Aujourd'hui (UTC) : nouvelles inscrites + nouvelles générations.
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const t0 = dayStart.getTime();
    const signupsToday = profiles.filter((p: any) => p.created_at && new Date(p.created_at).getTime() >= t0).length;
    const genUsersToday = new Set(ai.filter((a: any) => a.created_at && new Date(a.created_at).getTime() >= t0).map((a: any) => a.user_id)).size;

    // Cohorte récente (7 derniers jours) — pour MESURER un levier récent (ex. levier A
    // « 1er contenu génère direct ») sans dilution par les inscrit·es historiques.
    const cohortDays = 7;
    const cohortStart = Date.now() - cohortDays * DAY;
    const generatedSet = new Set(ai.map((a: any) => a.user_id));
    const cohort = profiles.filter((p: any) => p.created_at && new Date(p.created_at).getTime() >= cohortStart);
    const cohortSignups = cohort.length;
    const cohortOnboarded = cohort.filter((p: any) => p.onboarding_completed).length;
    const cohortGenerated = cohort.filter((p: any) => generatedSet.has(p.user_id)).length;

    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(),
      funnel,
      median_days_to_first_gen,
      signups_today: signupsToday,
      generating_users_today: genUsersToday,
      cohort_7d: { signups: cohortSignups, onboarded: cohortOnboarded, generated: cohortGenerated },
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
