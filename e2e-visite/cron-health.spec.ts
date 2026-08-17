/**
 * Santé des publications réelles — assertions dures sur l'edge `cron-health`
 * (scope daily).
 *
 * cron-health.mjs (le script original) ne fait QUE du reporting visuel :
 * `process.exit(0)` systématique, y compris quand un signal est 🔴. Ce spec
 * transforme les trois signaux qui trahissent un pipeline de publication
 * cassé (pas une variation normale) en vraies assertions Playwright :
 *   - posts bloqués en "publishing" (worker mort en route)
 *   - posts "scheduled" en retard de plus de 45 min (pg_cron
 *     trigger_publish_due_posts mort ou edge social-publish-scheduled down —
 *     cf. le seuil identique dans supabase/functions/cron-health/index.ts)
 *   - connexions sociales déjà EXPIRÉES (pas "expire bientôt", qui est une
 *     variation attendue au fil de l'eau — cf. etat côté edge)
 *
 * cron-health.mjs reste tel quel pour la lecture humaine quotidienne
 * (bilan complet, feedbacks bêta, facturation, Photoroom…) : ce spec ne
 * couvre que les trois signaux ci-dessus, ceux qui doivent faire rougir un
 * run CI plutôt qu'attendre un œil humain.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Même plomberie que cron-health.mjs : chargement manuel, autonome du reste
// de la config Playwright (qui ne charge que .env.visite.local).
const load = (f: string, prefix: string) => {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(new RegExp(`^\\s*(${prefix}[A-Z0-9_]*)\\s*=\\s*(.*?)\\s*$`));
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};
load(".env", "VITE_SUPABASE_");
load(".env.visite.local", "CRON_STATS_SECRET");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.CRON_STATS_SECRET;
const CONFIGURED = Boolean(SUPABASE_URL && ANON && SECRET);

test.skip(
  !CONFIGURED,
  "cron-health : VITE_SUPABASE_* ou CRON_STATS_SECRET absent — non branché en local (voir e2e-visite/README.md).",
);

test("cron-health (daily) : ni post bloqué, ni retard de cron, ni connexion expirée", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cron-health`, {
    method: "POST",
    headers: {
      apikey: ANON!,
      Authorization: `Bearer ${ANON}`,
      "x-cron-secret": SECRET!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scope: "daily" }),
  });
  const bodyText = await res.text();
  expect(res.ok, `edge cron-health HTTP ${res.status} — ${bodyText.slice(0, 200)}`).toBeTruthy();
  const d = JSON.parse(bodyText);

  // Worker mort en route : social-publish-scheduled récupère lui-même tout
  // post resté en 'publishing' plus de 15 min (cf. index.ts) — s'il en reste
  // un après 1h (seuil côté cron-health), ce filet de sécurité a aussi échoué.
  expect(
    d.stuck_publishing,
    `${d.stuck_publishing} post(s) bloqué(s) en "publishing" depuis plus d'1h — worker planté en route ?`,
  ).toBe(0);

  // pg_cron trigger_publish_due_posts (toutes les ~5 min) ou l'edge
  // social-publish-scheduled elle-même est morte : un post dû depuis plus de
  // 45 min ne serait jamais republié tout seul.
  expect(
    d.overdue_scheduled,
    `${d.overdue_scheduled} post(s) programmé(s) en retard de plus de 45 min — cron pg de publication mort ?`,
  ).toBe(0);

  // Une connexion déjà EXPIRÉE bloque en silence toute publication
  // programmée dessus (social-publish-scheduled la marque 'failed' à chaque
  // tentative). "expire bientôt" / vieillissement LinkedIn restent des
  // signaux d'alerte routiniers, pas un pipeline cassé — on les logue sans
  // faire échouer le run.
  const atRisk = (d.connections_at_risk || []) as Array<{ platform?: string; compte?: string; etat?: string; jours?: number }>;
  const expired = atRisk.filter((c) => c.etat === "expirée");
  const upcoming = atRisk.filter((c) => c.etat !== "expirée");
  if (upcoming.length) {
    console.log(`ℹ️ connexions à surveiller (non bloquantes) : ${JSON.stringify(upcoming)}`);
  }
  expect(expired, `connexion(s) sociale(s) déjà expirée(s) : ${JSON.stringify(expired)}`).toEqual([]);
});
