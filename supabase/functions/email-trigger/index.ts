import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";

const APP_URL = "https://nowadays-assistant.fr";
const ADMIN_EMAIL = "laetitia@nowadaysagency.com";

// Pool d'idées évergreen (rendez-vous hebdo). On en pioche 5 par semaine (rotation selon le n° de semaine).
// ⚠️ SYNCHRO : dupliqué dans src/lib/weekly-ideas.ts (V2 in-app — le dashboard affiche
// les MÊMES 5 idées que cet e-mail, calculées par la même rotation déterministe).
// Toute modification du pool ou de la formule doit être faite DES DEUX CÔTÉS.
const WEEKLY_IDEA_POOL = [
  "Une erreur que tu vois souvent dans ton domaine (et quoi faire à la place)",
  "Les coulisses de ton dernier projet ou de ta semaine",
  "Un avis à contre-courant sur ton métier",
  "Une question qu'on te pose tout le temps — réponds-y publiquement",
  "Ce que tu aurais aimé savoir en débutant",
  "Présente une de tes offres autrement (par le résultat, pas la prestation)",
  "Un retour client ou un moment de fierté récent",
  "Un mythe à déconstruire dans ton secteur",
  "Ta routine ou ton outil préféré pour t'organiser",
  "Pourquoi tu fais ce métier — ton « pourquoi » en une histoire",
  "3 conseils rapides que tu donnerais à ta cliente idéale",
  "Avant / après : une transformation que tu as permise",
  "Une décision difficile que tu as prise dans ton activité",
  "Ce qui te différencie vraiment de la concurrence",
  "Un coup de cœur (livre, compte, ressource) à partager",
  "Une journée type dans ton activité",
  "Un échec dont tu as tiré une leçon",
  "Réagis à une actu ou une tendance de ton secteur",
  "Réponds à l'objection n°1 de tes prospects",
  "Montre ton process étape par étape",
];

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

// Jour ISO 8601 : 1 = lundi … 7 = dimanche (aligné sur extract(isodow) côté Postgres).
function isoDayOfWeek(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

// 5 idées de la semaine (fenêtre glissante dans le pool selon le n° de semaine).
function weeklyIdeas(now: Date): string[] {
  const week = isoWeekNumber(now);
  const start = (week * 5) % WEEKLY_IDEA_POOL.length;
  return Array.from({ length: 5 }, (_, i) => WEEKLY_IDEA_POOL[(start + i) % WEEKLY_IDEA_POOL.length]);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ─── AUTH: accept either service-role key (internal/cron) OR an admin user JWT ───
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  let authorized = false;

  if (bearer && bearer === serviceRoleKey) {
    authorized = true;
  } else if (bearer) {
    try {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: userData, error: userErr } = await anonClient.auth.getUser(bearer);
      if (!userErr && userData.user) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) authorized = true;
      }
    } catch (_) {
      // fall through
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { event, user_id } = await req.json();

    if (!event) {
      return new Response(JSON.stringify({ error: "Missing event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any = {};

    switch (event) {
      case "signup":
        result = await handleSignup(supabase, user_id);
        break;
      case "check_inactive":
        result = await handleCheckInactive(supabase);
        break;
      case "check_not_activated":
        result = await handleCheckNotActivated(supabase);
        break;
      case "check_credits":
        result = await handleCheckCredits(supabase);
        break;
      case "check_forgotten_drafts":
        result = await handleCheckForgottenDrafts(supabase);
        break;
      case "subscription_activated":
        result = { event, user_id, ...(await enqueueSequence(supabase, user_id, "subscription_activated")) };
        break;
      case "payment_failed":
        result = { event, user_id, ...(await enqueueSequence(supabase, user_id, "payment_failed")) };
        break;
      case "subscription_cancelled":
        result = { event, user_id, ...(await enqueueSequence(supabase, user_id, "subscription_cancelled")) };
        break;
      case "weekly_digest":
        result = await handleWeeklyDigest(supabase, supabaseUrl, serviceRoleKey);
        break;
      case "monthly_stats_report":
        result = await handleMonthlyStatsReport(supabase, supabaseUrl, serviceRoleKey);
        break;
      case "process_queue":
        result = await handleProcessQueue(supabase, supabaseUrl, serviceRoleKey);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown event: ${event}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("email-trigger error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ───

async function alreadySent(supabase: any, userId: string, templateId: string): Promise<boolean> {
  const { data } = await supabase
    .from("email_sends")
    .select("id")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .eq("status", "sent")
    .limit(1);
  return (data?.length || 0) > 0;
}

async function alreadyQueued(supabase: any, userId: string, sequenceId: string): Promise<boolean> {
  const { data } = await supabase
    .from("email_queue")
    .select("id")
    .eq("user_id", userId)
    .eq("sequence_id", sequenceId)
    .eq("cancelled", false)
    .limit(1);
  return (data?.length || 0) > 0;
}

async function enqueueSequence(supabase: any, userId: string, triggerEvent: string): Promise<{ queued: number }> {
  // Find active sequence for this trigger
  const { data: sequences } = await supabase
    .from("email_sequences")
    .select("id")
    .eq("trigger_event", triggerEvent)
    .eq("is_active", true)
    .limit(1);

  if (!sequences?.length) return { queued: 0 };
  const sequence = sequences[0];

  // Check if already queued
  if (await alreadyQueued(supabase, userId, sequence.id)) return { queued: 0 };

  // Get steps
  const { data: steps } = await supabase
    .from("email_sequence_steps")
    .select("id, delay_hours")
    .eq("sequence_id", sequence.id)
    .order("step_number", { ascending: true });

  if (!steps?.length) return { queued: 0 };

  const now = new Date();
  const entries = steps.map((step: any) => ({
    user_id: userId,
    sequence_id: sequence.id,
    step_id: step.id,
    scheduled_at: new Date(now.getTime() + step.delay_hours * 3600000).toISOString(),
  }));

  const { error } = await supabase.from("email_queue").insert(entries);
  if (error) throw error;
  return { queued: entries.length };
}

function resolveTemplate(html: string, subject: string, vars: Record<string, string>): { html: string; subject: string } {
  let resolvedHtml = html;
  let resolvedSubject = subject;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    resolvedHtml = resolvedHtml.replaceAll(placeholder, value || "");
    resolvedSubject = resolvedSubject.replaceAll(placeholder, value || "");
  }
  return { html: resolvedHtml, subject: resolvedSubject };
}

// ─── Event Handlers ───

async function handleSignup(supabase: any, userId: string): Promise<any> {
  if (!userId) return { error: "user_id required for signup" };
  const result = await enqueueSequence(supabase, userId, "signup");
  return { event: "signup", user_id: userId, ...result };
}

async function handleCheckInactive(supabase: any): Promise<any> {
  // Escalade d'inactivité : 7j → 14j → 30j. Chaque palier déclenche SA séquence une seule fois
  // (alreadyQueued garde l'unicité par séquence), donc une inactive progresse 7d → 14d → 30d.
  const now = Date.now();
  const days = (d: number) => now - d * 24 * 3600000;

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (!users?.users?.length) return { event: "check_inactive", checked: 0, triggered: 0 };

  const inactiveUsers = users.users.filter(
    (u: any) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() < days(7)
  );

  let triggered = 0;
  for (const user of inactiveUsers) {
    const last = new Date(user.last_sign_in_at).getTime();
    // On choisit le palier le plus élevé atteint ; les paliers inférieurs ont déjà été envoyés les jours précédents.
    const triggerEvent = last < days(30) ? "inactive_30d" : last < days(14) ? "inactive_14d" : "inactive_7d";
    const result = await enqueueSequence(supabase, user.id, triggerEvent);
    if (result.queued > 0) triggered++;
  }

  return { event: "check_inactive", checked: inactiveUsers.length, triggered };
}

async function handleCheckNotActivated(supabase: any): Promise<any> {
  // Inscrites qui ont fini l'onboarding mais n'ont JAMAIS généré (activation ratée).
  // Fenêtre : compte âgé de 24h à 14 jours (on laisse 24h avant de relancer, et on ne
  // remonte pas trop loin pour ne pas spammer rétroactivement d'anciens comptes).
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 3600000).toISOString();

  const { data: candidates } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("onboarding_completed", true)
    .gte("created_at", fourteenDaysAgo)
    .lte("created_at", twentyFourHoursAgo);

  if (!candidates?.length) return { event: "check_not_activated", checked: 0, triggered: 0 };

  // Qui a déjà généré au moins une fois (n'importe quand) ?
  const { data: aiRows } = await supabase.from("ai_usage").select("user_id");
  const hasGenerated = new Set((aiRows || []).map((r: any) => r.user_id));

  const notActivated = candidates.filter((c: any) => !hasGenerated.has(c.user_id));

  let triggered = 0;
  for (const c of notActivated) {
    const result = await enqueueSequence(supabase, c.user_id, "not_activated");
    if (result.queued > 0) triggered++;
  }

  return { event: "check_not_activated", checked: notActivated.length, triggered };
}

async function handleCheckCredits(supabase: any): Promise<any> {
  // Find free users who have used >= 10 credits
  const { data: heavyUsers } = await supabase
    .from("ai_usage")
    .select("user_id")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600000).toISOString());

  if (!heavyUsers?.length) return { event: "check_credits", checked: 0, triggered: 0 };

  // Count per user
  const counts: Record<string, number> = {};
  for (const row of heavyUsers) {
    counts[row.user_id] = (counts[row.user_id] || 0) + 1;
  }

  // Filter users with >= 10 uses
  const exhaustedUserIds = Object.entries(counts)
    .filter(([, count]) => count >= 10)
    .map(([uid]) => uid);

  // Check which are on free plan
  let triggered = 0;
  for (const uid of exhaustedUserIds) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", uid)
      .limit(1);

    const plan = sub?.[0]?.plan || "free";
    if (plan !== "free") continue;

    const result = await enqueueSequence(supabase, uid, "credits_exhausted");
    if (result.queued > 0) triggered++;
  }

  return { event: "check_credits", checked: exhaustedUserIds.length, triggered };
}

async function handleCheckForgottenDrafts(supabase: any): Promise<any> {
  // Contenus posés au calendrier (dashboard AdaptiveHome.forgottenDrafts, même
  // critère) dont la date vient tout juste de passer sans jamais être publiés.
  // On ne regarde QUE hier (pas de fenêtre plus large) pour prévenir dès J+1 —
  // avant cette relance, rien ne le disait tant que l'autrice ne rouvrait pas
  // le dashboard par hasard (audit du 14/08 : jusqu'à 3 semaines constatées).
  const yesterday = new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 10);

  const { data: posts } = await supabase
    .from("calendar_posts")
    .select("id, user_id")
    .eq("date", yesterday)
    .neq("status", "published")
    .not("content_draft", "is", null)
    .neq("content_draft", "")
    .or("publish_status.is.null,publish_status.eq.failed");

  if (!posts?.length) return { event: "check_forgotten_drafts", checked: 0, triggered: 0 };

  const userIds = [...new Set(posts.map((p: any) => p.user_id).filter(Boolean))] as string[];

  let triggered = 0;
  for (const uid of userIds) {
    const result = await enqueueSequence(supabase, uid, "forgotten_draft_reminder");
    if (result.queued > 0) triggered++;
  }

  return { event: "check_forgotten_drafts", checked: userIds.length, triggered };
}

// Rendez-vous hebdo : email récurrent « tes idées de la semaine ».
// Envoi DIRECT (pas la file one-shot) pour pouvoir repartir chaque semaine ;
// garde anti-doublon = pas déjà envoyé ce template dans les 6 derniers jours.
// Les désabonnées sont filtrées par send-email lui-même.
async function handleWeeklyDigest(supabase: any, supabaseUrl: string, serviceRoleKey: string): Promise<any> {
  // 1. Séquence active "weekly_digest" → étape → template (respecte le toggle admin)
  const { data: sequences } = await supabase
    .from("email_sequences").select("id").eq("trigger_event", "weekly_digest").eq("is_active", true).limit(1);
  if (!sequences?.length) return { event: "weekly_digest", reason: "no active sequence", sent: 0 };

  const { data: steps } = await supabase
    .from("email_sequence_steps").select("template_id").eq("sequence_id", sequences[0].id)
    .order("step_number", { ascending: true }).limit(1);
  const templateId = steps?.[0]?.template_id;
  if (!templateId) return { event: "weekly_digest", reason: "no step", sent: 0 };

  const { data: template } = await supabase
    .from("email_templates").select("subject, html_body, is_active").eq("id", templateId).single();
  if (!template?.is_active) return { event: "weekly_digest", reason: "template inactive", sent: 0 };

  // 2. Cibles : inscrites ayant fini l'onboarding, AYANT activé leur rendez-vous hebdo,
  // et dont le jour choisi = aujourd'hui. Le cron tourne tous les jours ; chaque inscrite
  // ne reçoit donc l'email QUE le jour qu'elle a choisi (l'admin et les désabonnées sont exclues).
  // Valeurs par défaut tolérantes si la migration de préférences n'est pas encore appliquée :
  // rituel actif + lundi.
  const todayIso = isoDayOfWeek(new Date());
  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("user_id, prenom, email, activite, weekly_ritual_enabled, weekly_ritual_day")
    .eq("onboarding_completed", true)
    .not("email", "is", null);
  const profiles = (allProfiles || []).filter((p: any) => {
    const enabled = p.weekly_ritual_enabled !== false; // défaut = activé
    const day = p.weekly_ritual_day ?? 1; // défaut = lundi
    return enabled && day === todayIso;
  });
  if (!profiles.length) return { event: "weekly_digest", day: todayIso, eligible: 0, sent: 0 };

  // 3. Anti-doublon : qui a déjà reçu ce template dans les 6 derniers jours
  const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString();
  const { data: recent } = await supabase
    .from("email_sends").select("user_id").eq("template_id", templateId).gte("sent_at", sixDaysAgo);
  const alreadyThisWeek = new Set((recent || []).map((r: any) => r.user_id));

  // 4. Idées de la semaine → liste HTML injectée dans {{ideas}}
  const ideas = weeklyIdeas(new Date());
  const ideasHtml = `<ul style="font-size:15px;color:#1A1A1A;line-height:1.9;padding-left:20px;margin:0;">${ideas.map((i) => `<li>${i}</li>`).join("")}</ul>`;

  let sent = 0, skipped = 0, errors = 0;
  for (const p of profiles) {
    if (!p.email || p.email === ADMIN_EMAIL || alreadyThisWeek.has(p.user_id)) { skipped++; continue; }
    const resolved = resolveTemplate(template.html_body, template.subject, {
      prenom: p.prenom || "", activite: p.activite || "", email: p.email, app_url: APP_URL, ideas: ideasHtml,
    });
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: p.email, subject: resolved.subject, html: resolved.html,
          template_id: templateId, sequence_id: sequences[0].id, user_id: p.user_id,
        }),
      });
      const d = await res.json();
      if (d.success) sent++; else skipped++; // send-email renvoie skipped pour les désabonnées
    } catch (e) {
      errors++;
      console.error("weekly_digest send error", p.user_id, e);
    }
  }
  return { event: "weekly_digest", eligible: profiles.length, sent, skipped, errors };
}

// Rapport mensuel stats Instagram : envoyé le 1er du mois, déclenché par l'edge
// stats-monthly-snapshot juste APRÈS le gel des chiffres du mois écoulé. Cible =
// les utilisatrices qui ONT des stats pour ce mois (portée renseignée). Contrairement
// au weekly digest, l'admin est INCLUSE : c'est le rapport de ses propres données.
async function handleMonthlyStatsReport(supabase: any, supabaseUrl: string, serviceRoleKey: string): Promise<any> {
  const { data: sequences } = await supabase
    .from("email_sequences").select("id").eq("trigger_event", "monthly_stats_report").eq("is_active", true).limit(1);
  if (!sequences?.length) return { event: "monthly_stats_report", reason: "no active sequence", sent: 0 };

  const { data: steps } = await supabase
    .from("email_sequence_steps").select("template_id").eq("sequence_id", sequences[0].id)
    .order("step_number", { ascending: true }).limit(1);
  const templateId = steps?.[0]?.template_id;
  if (!templateId) return { event: "monthly_stats_report", reason: "no step", sent: 0 };

  const { data: template } = await supabase
    .from("email_templates").select("subject, html_body, is_active").eq("id", templateId).single();
  if (!template?.is_active) return { event: "monthly_stats_report", reason: "template inactive", sent: 0 };

  // Mois écoulé (le cron tourne le 1er du mois suivant) + mois d'avant pour les variations.
  const nowD = new Date();
  const monthStart = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 1));
  const prevStart = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 2, 1));
  const monthKey = monthStart.toISOString().slice(0, 10);
  const prevKey = prevStart.toISOString().slice(0, 10);
  const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const moisLabel = `${MONTHS_FR[monthStart.getUTCMonth()]} ${monthStart.getUTCFullYear()}`;

  const { data: rows } = await supabase
    .from("monthly_stats")
    .select("user_id, reach, views, interactions, accounts_engaged, profile_visits, followers, followers_gained, ai_analysis, month_date")
    .in("month_date", [monthKey, prevKey])
    .not("reach", "is", null);
  const current = (rows || []).filter((r: any) => r.month_date === monthKey);
  const prevByUser = new Map<string, any>();
  for (const r of (rows || []).filter((r: any) => r.month_date === prevKey)) {
    // En cas de plusieurs lignes (multi-espaces), on garde la plus grosse portée.
    const seen = prevByUser.get(r.user_id);
    if (!seen || (r.reach || 0) > (seen.reach || 0)) prevByUser.set(r.user_id, r);
  }
  const byUser = new Map<string, any>();
  for (const r of current) {
    const seen = byUser.get(r.user_id);
    if (!seen || (r.reach || 0) > (seen.reach || 0)) byUser.set(r.user_id, r);
  }
  if (!byUser.size) return { event: "monthly_stats_report", month: monthKey, eligible: 0, sent: 0 };

  const { data: profiles } = await supabase
    .from("profiles").select("user_id, prenom, email")
    .in("user_id", [...byUser.keys()])
    .eq("onboarding_completed", true)
    .not("email", "is", null);

  // Anti-doublon : pas deux rapports dans le même mois.
  const days25Ago = new Date(Date.now() - 25 * 86400000).toISOString();
  const { data: recent } = await supabase
    .from("email_sends").select("user_id").eq("template_id", templateId).gte("sent_at", days25Ago);
  const alreadyThisMonth = new Set((recent || []).map((r: any) => r.user_id));

  const fmtNum = (n: number) => n.toLocaleString("fr-FR");
  const variation = (cur: number | null, prev: number | null): string => {
    if (cur == null || prev == null || prev === 0) return "";
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (Math.abs(pct) <= 2) return " <span style=\"color:#6B6B6B;font-size:13px;\">(stable)</span>";
    const color = pct > 0 ? "#0B7A4B" : "#B3261E";
    return ` <span style="color:${color};font-size:13px;font-weight:bold;">(${pct > 0 ? "+" : ""}${pct} %)</span>`;
  };
  const statRow = (label: string, cur: number | null | undefined, prev: number | null | undefined): string => {
    if (typeof cur !== "number") return "";
    return `<tr><td style="padding:8px 0;font-size:15px;color:#6B6B6B;">${label}</td><td style="padding:8px 0;font-size:15px;color:#1A1A1A;font-weight:bold;text-align:right;">${fmtNum(cur)}${variation(cur ?? null, typeof prev === "number" ? prev : null)}</td></tr>`;
  };

  let sent = 0, skipped = 0, errors = 0;
  for (const p of profiles || []) {
    if (!p.email || alreadyThisMonth.has(p.user_id)) { skipped++; continue; }
    const s = byUser.get(p.user_id);
    if (!s) { skipped++; continue; }
    const prev = prevByUser.get(p.user_id) || null;

    const engagement = s.accounts_engaged != null && s.reach ? Math.round((s.accounts_engaged / s.reach) * 1000) / 10 : null;
    const prevEngagement = prev?.accounts_engaged != null && prev?.reach ? Math.round((prev.accounts_engaged / prev.reach) * 1000) / 10 : null;

    const statsHtml =
      `<table style="width:100%;border-collapse:collapse;margin:8px 0 4px;">` +
      statRow("Abonné·es", s.followers, prev?.followers) +
      statRow("Portée (comptes touchés)", s.reach, prev?.reach) +
      statRow("Vues", s.views, prev?.views) +
      statRow("Interactions", s.interactions, prev?.interactions) +
      (engagement != null
        ? `<tr><td style="padding:8px 0;font-size:15px;color:#6B6B6B;">Taux d'engagement</td><td style="padding:8px 0;font-size:15px;color:#1A1A1A;font-weight:bold;text-align:right;">${String(engagement).replace(".", ",")} %${variation(engagement, prevEngagement)}</td></tr>`
        : "") +
      statRow("Visites du profil", s.profile_visits, prev?.profile_visits) +
      statRow("Abonné·es gagné·es", s.followers_gained, prev?.followers_gained) +
      `</table>`;

    const analyseHtml = s.ai_analysis
      ? `<div style="background:#FFF4F8;border-radius:8px;padding:16px 20px;margin:16px 0;"><p style="margin:0;font-size:14px;color:#91014b;font-weight:bold;">🧠 L'analyse du mois</p><p style="margin:8px 0 0;font-size:15px;color:#1A1A1A;line-height:1.6;">${s.ai_analysis}</p></div>`
      : `<p style="font-size:14px;color:#6B6B6B;line-height:1.6;">💡 Lance « Analyser mes stats avec l'IA » sur ta page stats pour comprendre ce que ces chiffres racontent.</p>`;

    const resolved = resolveTemplate(template.html_body, template.subject, {
      prenom: p.prenom || "", email: p.email, app_url: APP_URL,
      mois: moisLabel, stats: statsHtml, analyse: analyseHtml,
    });
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: p.email, subject: resolved.subject, html: resolved.html,
          template_id: templateId, sequence_id: sequences[0].id, user_id: p.user_id,
        }),
      });
      const d = await res.json();
      if (d.success) sent++; else skipped++; // send-email filtre les désabonnées
    } catch (e) {
      errors++;
      console.error("monthly_stats_report send error", p.user_id, e);
    }
  }
  return { event: "monthly_stats_report", month: monthKey, eligible: byUser.size, sent, skipped, errors };
}

async function handleProcessQueue(supabase: any, supabaseUrl: string, serviceRoleKey: string): Promise<any> {
  const now = new Date().toISOString();

  // Get pending queue entries
  const { data: pending } = await supabase
    .from("email_queue")
    .select("id, user_id, sequence_id, step_id")
    .lte("scheduled_at", now)
    .eq("sent", false)
    .eq("cancelled", false)
    .limit(50);

  if (!pending?.length) return { event: "process_queue", processed: 0 };

  let processed = 0;
  let errors = 0;

  for (const entry of pending) {
    try {
      // Get step → template
      const { data: step } = await supabase
        .from("email_sequence_steps")
        .select("template_id")
        .eq("id", entry.step_id)
        .single();

      if (!step?.template_id) {
        const { error } = await supabase.from("email_queue").update({ cancelled: true }).eq("id", entry.id);
        if (error) console.error(`Failed to cancel queue ${entry.id} (no template_id):`, error);
        continue;
      }

      // Get template
      const { data: template } = await supabase
        .from("email_templates")
        .select("subject, html_body, is_active")
        .eq("id", step.template_id)
        .single();

      if (!template?.is_active) {
        const { error } = await supabase.from("email_queue").update({ cancelled: true }).eq("id", entry.id);
        if (error) console.error(`Failed to cancel queue ${entry.id} (inactive template):`, error);
        continue;
      }

      // Deduplicate: check if already sent
      if (await alreadySent(supabase, entry.user_id, step.template_id)) {
        const { error } = await supabase.from("email_queue").update({ sent: true }).eq("id", entry.id);
        if (error) console.error(`Failed to mark queue ${entry.id} as sent (dedup):`, error);
        continue;
      }

      // Get user info
      const { data: profile } = await supabase
        .from("profiles")
        .select("prenom, email, activite")
        .eq("user_id", entry.user_id)
        .single();

      if (!profile?.email) {
        const { error } = await supabase.from("email_queue").update({ cancelled: true }).eq("id", entry.id);
        if (error) console.error(`Failed to cancel queue ${entry.id} (no email):`, error);
        continue;
      }

      // Resolve template variables
      const vars = {
        prenom: profile.prenom || "",
        activite: profile.activite || "",
        email: profile.email,
        app_url: APP_URL,
      };
      const resolved = resolveTemplate(template.html_body, template.subject, vars);

      // Call send-email function
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: profile.email,
          subject: resolved.subject,
          html: resolved.html,
          template_id: step.template_id,
          sequence_id: entry.sequence_id,
          user_id: entry.user_id,
        }),
      });

      const sendData = await sendRes.json();

      if (sendData.success) {
        const { error } = await supabase.from("email_queue").update({ sent: true }).eq("id", entry.id);
        if (error) console.error(`Failed to mark queue ${entry.id} as sent:`, error);
        processed++;
      } else {
        console.error(`Failed to send email for queue ${entry.id}:`, sendData.error);
        errors++;
      }
    } catch (err) {
      console.error(`Error processing queue entry ${entry.id}:`, err);
      errors++;
    }
  }

  return { event: "process_queue", processed, errors, total: pending.length };
}
