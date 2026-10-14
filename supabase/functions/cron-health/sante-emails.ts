// Scope daily de cron-health : erreurs JS clientes séparées des comptes internes,
// et santé des e-mails (14/10/2026). Logique pure, testée par sante-emails_test.ts.
//
// Pourquoi séparer les erreurs JS : le 14/10 au matin, 5 `creer/render` sont
// sortis sans qu'on puisse dire s'ils venaient d'une cliente ou de la visite
// automatique (compte test Camille, Mac en veille). Seules les erreurs des vraies
// clientes alertent ; celles des comptes internes restent une info.

const HOUR = 3600000;
const DAY = 24 * HOUR;

type EmailOf = (userId: string | null | undefined) => string | null | undefined;
type IsInternal = (email: string | null | undefined) => boolean;

/**
 * Un user_id est interne si son profil a un email interne. Sans user_id ou sans
 * profil (visiteuse non connectée, compte supprimé), on ne peut pas savoir :
 * compté côté clientes — mieux vaut une fausse alerte qu'un écran planté caché.
 */
const userIsInternal = (userId: string | null | undefined, emailOf: EmailOf, isInternal: IsInternal) =>
  !!userId && isInternal(emailOf(userId));

export function clientErrorsStats(rows: any[], emailOf: EmailOf, isInternal: IsInternal) {
  const clientes = rows.filter((e) => !userIsInternal(e.user_id, emailOf, isInternal));
  const internes = rows.filter((e) => userIsInternal(e.user_id, emailOf, isInternal));
  const parEcran = (list: any[]) => {
    const out: Record<string, number> = {};
    for (const e of list) out[`${e.route}/${e.kind}`] = (out[`${e.route}/${e.kind}`] || 0) + 1;
    return out;
  };
  const sansIdentite = (e: any) => ({ kind: e.kind, route: e.route, asset: e.asset, created_at: e.created_at });
  return {
    // `count` / `items` = VRAIES CLIENTES seulement (ceux qui alertent). Même clés
    // qu'avant : un lecteur ancien affiche désormais le bon chiffre.
    count: clientes.length,
    items: clientes.slice(-20).map(sansIdentite),
    // kind `render` = écran de plantage ErrorBoundary vu par une cliente.
    render: clientes.filter((e) => e.kind === "render").length,
    par_ecran: parEcran(clientes),
    internes: { count: internes.length, par_ecran: parEcran(internes) },
  };
}

// Statuts posés par send-email (sent/failed/skipped) puis montés par resend-webhook
// (opened/clicked/bounced/complained). opened/clicked = bien parti.
const PARTIS = new Set(["sent", "opened", "clicked"]);
const ECHECS = new Set(["failed", "bounced", "complained"]);

// Seuil « file bloquée » : le cron email-trigger (process_queue) passe régulièrement ;
// une entrée due depuis plus d'1 h et toujours ni envoyée ni annulée = cron mort,
// ou envoi qui échoue à chaque passage.
export const FILE_BLOQUEE_APRES_MS = HOUR;

/**
 * sends : lignes email_sends des 24 h (sent_at) ; queue : lignes email_queue dues
 * depuis > 1 h, ni envoyées ni annulées ; templateName : template_id → nom.
 *
 * Seuils : 🔴 si échec client > 0 (failed/bounced/complained) ou file bloquée
 * cliente > 0 ; ✅ sinon. 0 envoyé n'alerte PAS : on ne sait pas ce qui était
 * attendu (même piège que les webhooks Stripe à 0) — affiché tel quel.
 */
export function emailsStats(
  sends: any[],
  queue: any[],
  emailOf: EmailOf,
  isInternal: IsInternal,
  templateName: (id: string | null | undefined) => string | null,
  now: number,
) {
  const interne = (s: any) => {
    if (s.user_id) return userIsInternal(s.user_id, emailOf, isInternal);
    // Envoi sans user_id (notification admin, envoi manuel) : interne si TOUS les
    // destinataires le sont (send-email joint plusieurs adresses par « , »).
    const tos = String(s.to_email || "").split(",").map((t) => t.trim()).filter(Boolean);
    return tos.length > 0 && tos.every((t) => isInternal(t));
  };
  const recents = sends.filter((s) => s.sent_at && now - new Date(s.sent_at).getTime() < DAY);
  const bilan = (list: any[]) => ({
    envoyes: list.filter((s) => PARTIS.has(s.status)).length,
    echecs: list.filter((s) => ECHECS.has(s.status)).length,
    ignores: list.filter((s) => s.status === "skipped").length, // désabonnée, plafond, adresse de test
  });
  const clientes = recents.filter((s) => !interne(s));
  const internes = recents.filter((s) => interne(s));
  const echecs = clientes
    .filter((s) => ECHECS.has(s.status))
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
    .slice(0, 10)
    .map((s) => ({
      statut: s.status,
      type: templateName(s.template_id) || (s.template_id ? "modèle inconnu" : "envoi direct"),
      erreur: s.error ? String(s.error).slice(0, 140) : null,
      quand: s.sent_at,
    }));

  const bloquees = queue.filter(
    (q) => q.sent !== true && q.cancelled !== true && q.scheduled_at &&
      now - new Date(q.scheduled_at).getTime() > FILE_BLOQUEE_APRES_MS,
  );
  const bloqueesClientes = bloquees.filter((q) => !userIsInternal(q.user_id, emailOf, isInternal));
  const plusAncienne = bloqueesClientes.reduce(
    (min: string | null, q: any) => (!min || q.scheduled_at < min ? q.scheduled_at : min),
    null,
  );

  const b = bilan(clientes);
  const raisons: string[] = [];
  if (b.echecs) raisons.push(`${b.echecs} e-mail(s) en échec`);
  if (bloqueesClientes.length) raisons.push(`${bloqueesClientes.length} e-mail(s) en attente depuis > 1 h (cron d'envoi mort ?)`);
  return {
    ...b,
    echecs_items: echecs,
    file_bloquee: { count: bloqueesClientes.length, plus_ancienne: plusAncienne, internes: bloquees.length - bloqueesClientes.length },
    internes: bilan(internes),
    alerte: raisons.length ? raisons.join(" ; ") : null,
  };
}
