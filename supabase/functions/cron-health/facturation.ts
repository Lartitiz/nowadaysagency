// cron-health, scope daily : santé de la facturation Stripe (fiche 18 lot 1, à l'identique).
import { fetchAllRows, DAY } from "./lecture.ts";

// ── Santé de la FACTURATION (incident Stripe 24-31/07/2026) ──────────────────
// Le webhook `stripe-webhook` a renvoyé des 500 en boucle pendant 8 jours sans que
// RIEN dans l'app ne le dise : la visite était verte, les edges répondaient, seul
// Stripe le savait (et menaçait de couper l'endpoint le 02/08). Pire, le second bug
// (invoice.subscription) était SILENCIEUX : webhook 200, mais `studio_months_paid`
// jamais incrémenté et aucune cliente prévenue quand sa carte était refusée.
//
// 🔑 La leçon : une panne de facturation ne se voit pas côté app — elle se voit chez
// Stripe (livraisons en attente) et dans l'ÉCART entre Stripe et la base. D'où trois
// mesures, la première étant la seule qui attrape n'importe quelle panne future,
// quelle qu'en soit la cause :
//   1. événements que Stripe n'arrive PAS à livrer (`pending_webhooks > 0`) ;
//   2. abonnements actifs chez Stripe SANS ligne en base = « elle paie et n'a pas ses accès » ;
//   3. lignes actives dont la période de facturation est vide ou périmée = symptôme
//      muet d'un webhook qui ne met plus rien à jour.
// Lecture seule, sans PII : identifiants Stripe et types d'événements uniquement.
export const STRIPE_API = "https://api.stripe.com/v1";

// Délai laissé à Stripe pour ses tentatives normales avant de considérer l'échec réel
// (Stripe réessaie pendant plusieurs jours ; 30 min évite d'alerter sur un événement
// tout juste émis, en cours de première livraison).
export const LIVRAISON_GRACE = 30 * 60000;

// Une période de facturation dépassée de plus de 2 jours n'est jamais normale :
// le renouvellement Stripe la repousse d'un mois le jour même.
export const PERIODE_RETARD_JOURS = 2;

// Un timestamp Stripe absent ne doit JAMAIS faire tomber la sonde : c'est exactement
// ainsi que le webhook est mort (`new Date(undefined * 1000).toISOString()` → RangeError).
// La garde `e2e-visite/stripe-api-guard.mjs` refuse d'ailleurs toute conversion nue.
export function isoFromUnix(unixSeconds: unknown): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return null;
  const d = new Date(unixSeconds * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function stripeGet(key: string, chemin: string) {
  const r = await fetch(`${STRIPE_API}${chemin}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 90)}`);
  return await r.json();
}

export async function facturationHealth(supabase: any, now: number) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const out: Record<string, unknown> = {};

  // (3) et le contexte : côté base, toujours lisible même sans clé Stripe.
  let rowsStripe: any[] = [];
  try {
    const rows = await fetchAllRows(
      supabase,
      "subscriptions",
      "stripe_subscription_id, status, plan, current_period_end, studio_months_paid, updated_at",
    );
    rowsStripe = rows.filter((s: any) => s.stripe_subscription_id); // les lignes manuelles n'ont pas de période
    const actives = rowsStripe.filter((s: any) => s.status === "active");
    const perimees = actives
      .filter(
        (s: any) =>
          !s.current_period_end ||
          now - new Date(s.current_period_end).getTime() > PERIODE_RETARD_JOURS * DAY,
      )
      .map((s: any) => ({
        abo: s.stripe_subscription_id,
        plan: s.plan,
        fin_periode: s.current_period_end,
      }));
    out.abonnements_stripe_actifs = actives.length;
    out.periodes_perimees = { count: perimees.length, items: perimees.slice(0, 10) };
  } catch (e) {
    out.periodes_perimees = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  // Contexte : le webhook reçoit-il encore quelque chose ?
  try {
    const ev = await fetchAllRows(supabase, "webhook_events", "event_type, processed_at", (q) =>
      q.gte("processed_at", new Date(now - 7 * DAY).toISOString()),
    );
    const dernier = ev.reduce(
      (max: string | null, e: any) => (!max || e.processed_at > max ? e.processed_at : max),
      null,
    );
    out.evenements_recus = {
      h24: ev.filter((e: any) => now - new Date(e.processed_at).getTime() < DAY).length,
      j7: ev.length,
      dernier,
    };
  } catch (e) {
    out.evenements_recus = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  if (!key) {
    out.erreur_stripe = "STRIPE_SECRET_KEY absent — vérification côté Stripe impossible";
    return out;
  }

  // (1) LE signal direct : des événements que Stripe n'arrive pas à livrer.
  try {
    const ev = await stripeGet(key, "/events?limit=100");
    const bloques = (ev.data || []).filter(
      (e: any) => (e.pending_webhooks || 0) > 0 && now - e.created * 1000 > LIVRAISON_GRACE,
    );
    const parType: Record<string, number> = {};
    for (const e of bloques) parType[e.type] = (parType[e.type] || 0) + 1;
    out.livraisons_en_echec = {
      count: bloques.length,
      plus_ancien: bloques.length
        ? isoFromUnix(Math.min(...bloques.map((e: any) => e.created)))
        : null,
      types: Object.entries(parType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([type, n]) => ({ type, n })),
    };
  } catch (e) {
    out.livraisons_en_echec = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  // (2) L'écart qui coûte de l'argent : payante chez Stripe, sans accès dans l'app.
  //
  // ⚠️ Le compte Stripe est PARTAGÉ : il porte aussi les abonnements « Ta binôme de
  // com' » vendus par lien de paiement, qui n'ont jamais eu de ligne `subscriptions`
  // et n'en auront jamais (ce ne sont pas des accès à l'app). Les compter ici ferait
  // 11 fausses alertes par jour — et une sonde qui crie au loup finit ignorée.
  // Le discriminant est déterministe : `create-checkout` pose TOUJOURS
  // `subscription_data.metadata.user_id` (index.ts, mode subscription), et un lien de
  // paiement ne le pose jamais. Un abonnement app SANS ligne en base = vraie alerte.
  try {
    const subs = await stripeGet(key, "/subscriptions?status=active&limit=100");
    const connus = new Set(rowsStripe.map((s: any) => s.stripe_subscription_id));
    const toutes = subs.data || [];
    const issuesDeLApp = toutes.filter((s: any) => s.metadata?.user_id);
    const orphelines = issuesDeLApp
      .filter((s: any) => !connus.has(s.id))
      .map((s: any) => ({ abo: s.id, depuis: isoFromUnix(s.created) }));
    out.payantes_sans_acces = { count: orphelines.length, items: orphelines.slice(0, 10) };
    out.abonnements_app_chez_stripe = issuesDeLApp.length;
    out.abonnements_hors_app = toutes.length - issuesDeLApp.length; // info, jamais une alerte
  } catch (e) {
    out.payantes_sans_acces = { erreur: String((e as any)?.message || e).slice(0, 90) };
  }

  return out;
}
