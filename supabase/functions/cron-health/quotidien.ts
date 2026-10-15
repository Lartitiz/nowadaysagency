// cron-health, scope daily : le bulletin du matin (publications, connexions,
// retours bêta, sondes Photoroom / Higgsfield / Stripe, crons pg, e-mails, images
// Studio bloquées). Sorti d'index.ts à l'identique (fiche 18, lot 2) : index.ts
// ajoute `generated_at` et `scope` devant l'objet rendu ici.
import { feedbackNewItems, type FeedbackNewRow } from "./feedback-new.ts";
import { lireCronsPg } from "./crons-pg.ts";
import { studioImagesBloquees } from "./studio-bloquees.ts";
import { santeQuotidienne } from "./sante-emails.ts"; // erreurs JS clientes à part + e-mails
import { isInternalEmail as isExcludedEmail } from "../_shared/internal-accounts.ts";
import { DAY, fetchAllRows, HOUR } from "./lecture.ts";
import { photoroomCredits } from "./photoroom.ts";
import { facturationHealth } from "./facturation.ts";
import { higgsfieldBudget } from "./higgsfield-budget.ts";

export async function bilanQuotidien({ supabase, now, isClient, emailOf }: {
  supabase: any;
  now: number;
  isClient: (userId: string) => boolean;
  emailOf: Map<string, string>;
}) {
    const [postsRows, connRows, fbRows, fbNewRows, photoroom, facturation, sante, higgsfield, cronsPg, studioBloquees] = await Promise.all([
      fetchAllRows(
        supabase,
        "calendar_posts",
        "user_id, canal, publish_status, publish_error, scheduled_publish_at, published_at, updated_at",
        (q) => q.in("publish_status", ["failed", "publishing", "scheduled", "published"]),
      ),
      fetchAllRows(
        supabase,
        "social_connections",
        "user_id, platform, platform_account_name, token_expires_at, updated_at",
      ),
      fetchAllRows(
        supabase,
        "beta_feedback",
        "user_id, type, severity, content, details, page_url, screenshot_url, status, created_at",
        (q) => q.gte("created_at", new Date(now - DAY).toISOString()),
      ),
      fetchAllRows(supabase, "beta_feedback", "user_id, type, severity, content, page_url, created_at", (q) => q.eq("status", "new")),
      photoroomCredits(now), facturationHealth(supabase, now),
      santeQuotidienne(supabase, now, fetchAllRows, emailOf, isExcludedEmail),
      higgsfieldBudget(supabase, now),
      lireCronsPg(supabase, now), // automates pg_cron
      studioImagesBloquees(supabase, now), // images Studio « en cours » > 1 h
    ]);
    const posts = postsRows.filter((p: any) => isClient(p.user_id));
    const conns = connRows.filter((c: any) => isClient(c.user_id));

    // Échecs de publication des dernières 48 h (erreur tronquée, pas de contenu).
    const failedRecent = posts
      .filter((p: any) => p.publish_status === "failed" && p.updated_at && now - new Date(p.updated_at).getTime() < 48 * HOUR)
      .map((p: any) => ({
        canal: p.canal,
        quand: p.updated_at,
        erreur: (p.publish_error || "").slice(0, 140) || null,
      }));

    // Posts coincés en "publishing" depuis > 1 h (zombie — le worker a planté en route).
    const stuckPublishing = posts.filter(
      (p: any) => p.publish_status === "publishing" && p.updated_at && now - new Date(p.updated_at).getTime() > HOUR,
    ).length;

    // Programmés dont l'heure est passée depuis > 45 min sans être partis :
    // signal que le cron pg `social-publish-scheduled` est mort (régé schéma ?).
    const overdueScheduled = posts.filter(
      (p: any) =>
        p.publish_status === "scheduled" &&
        p.scheduled_publish_at &&
        now - new Date(p.scheduled_publish_at).getTime() > 45 * 60000,
    ).length;

    const published24h = posts.filter(
      (p: any) => p.published_at && now - new Date(p.published_at).getTime() < DAY,
    ).length;

    // Connexions sociales : expirées, expirant sous 7 j, et LinkedIn vieillissantes
    // sans date d'expiration connue (refresh manuel ~60 j — alerter à 50 j d'âge).
    // ⚠️ Seulement Instagram + LinkedIn : Canva/Pinterest se rafraîchissent via
    // refresh_token, leur token_expires_at en base est trompeur — même règle que
    // la page Connexions (PR #306), sinon faux positif quotidien.
    const connState = (c: any) => {
      if (c.platform !== "instagram" && c.platform !== "linkedin") return null;
      if (c.token_expires_at) {
        const left = (new Date(c.token_expires_at).getTime() - now) / DAY;
        if (left < 0) return { etat: "expirée", jours: Math.round(left) };
        if (left <= 7) return { etat: "expire bientôt", jours: Math.round(left * 10) / 10 };
        return null;
      }
      if (c.platform === "linkedin" && c.updated_at) {
        const age = (now - new Date(c.updated_at).getTime()) / DAY;
        if (age > 50) return { etat: "linkedin vieillissante (~60 j max)", jours: Math.round(age) };
      }
      return null;
    };
    const connectionsAtRisk = conns
      .map((c: any) => {
        const s = connState(c);
        return s ? { platform: c.platform, compte: c.platform_account_name, ...s } : null;
      })
      .filter(Boolean);

    // Retours bêta des 24 h (widget BetaFeedbackWidget → table beta_feedback,
    // sinon visibles seulement dans l'onglet admin) — les « blocking » d'abord.
    const SEVERITY_RANK: Record<string, number> = { blocking: 0, annoying: 1, minor: 2 };
    const sevRank = (s: string | null) => SEVERITY_RANK[s || ""] ?? 3;
    const feedback24h = fbRows
      .filter((f: any) => isClient(f.user_id))
      .sort(
        (a: any, b: any) =>
          sevRank(a.severity) - sevRank(b.severity) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .map((f: any) => ({
        type: f.type,
        severite: f.severity,
        contenu: (f.content || "").slice(0, 200),
        detail: f.details ? f.details.slice(0, 200) : null,
        page: f.page_url,
        capture: !!f.screenshot_url,
        statut: f.status,
        quand: f.created_at,
      }));
    const feedbackNewTotal = fbNewRows.filter((f: any) => isClient(f.user_id)).length;

    return {
      failed_48h: { count: failedRecent.length, items: failedRecent.slice(0, 10) },
      stuck_publishing: stuckPublishing,
      overdue_scheduled: overdueScheduled,
      published_24h: published24h,
      connections_total: conns.length,
      connections_at_risk: connectionsAtRisk.slice(0, 20),
      feedback_24h: { count: feedback24h.length, items: feedback24h.slice(0, 15) },
      feedback_new_total: feedbackNewTotal,
      crons_pg: cronsPg, studio_images_bloquees: studioBloquees,
      feedback_new_items: feedbackNewItems(fbNewRows.filter((f: FeedbackNewRow) => isClient(f.user_id))),
      photoroom_credits: photoroom,
      higgsfield,
      facturation,
      ...sante, // client_errors_24h (vraies clientes, internes à part) + emails_24h
    };
}
