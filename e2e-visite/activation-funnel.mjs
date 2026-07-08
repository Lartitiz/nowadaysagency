/**
 * Tunnel d'activation — lecture de l'edge `activation-funnel` (étape 8 du cron).
 *
 * Source = Supabase (exact, immunisé adblockers + bug tracking SPA), via un edge
 * AGRÉGÉ gardé par le secret `CRON_STATS_SECRET`. Chiffres = ceux du dashboard admin.
 * (PostHog abandonné pour ça : events custom muets depuis avril, pageviews app depuis ~25/06.)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (f, prefix) => {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(new RegExp(`^\\s*(${prefix}[A-Z0-9_]*)\\s*=\\s*(.*?)\\s*$`));
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};
load(".env", "VITE_SUPABASE_");
load(".env.visite.local", "CRON_STATS_SECRET");

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.CRON_STATS_SECRET;
if (!URL || !ANON || !SECRET) {
  console.log("funnel : non branché (VITE_SUPABASE_* ou CRON_STATS_SECRET absent) — étape sautée.");
  process.exit(0);
}

try {
  const r = await fetch(`${URL}/functions/v1/activation-funnel`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "x-cron-secret": SECRET, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) {
    console.log(`funnel : edge activation-funnel HTTP ${r.status} (${(await r.text()).slice(0, 90)}) — étape sautée (edge pas encore déployée ?).`);
    process.exit(0);
  }
  const d = await r.json();
  const f = d.funnel || [];
  const top = f[0]?.count || 0;
  const pct = (c) => (top ? Math.round((c / top) * 100) : 0);
  console.log("📊 Tunnel d'activation (source Supabase, exact — hors comptes test)");
  for (const s of f) console.log(`   ${String(s.step).padEnd(22)} ${String(s.count).padStart(5)}  (${pct(s.count)}% des inscrites)`);
  console.log(`   ⏱️  médiane inscription→1re génération : ${d.median_days_to_first_gen ?? "n/a"} j`);
  console.log(`   📅 aujourd'hui : ${d.signups_today} inscrite(s), ${d.generating_users_today} qui ont généré`);
  // 🔑 le trou « Inscrites → Onboarding terminé » = décrochage DANS le diagnostic
  //    (/creer est gaté derrière). « Onboarding terminé → ≥1 génération » = ceux qui
  //    ont fini mais n'ont pas créé. Comparer à la baseline mémorisée.
  const inscrites = f.find((s) => s.step === "Inscrites")?.count || 0;
  const onb = f.find((s) => s.step === "Onboarding terminé")?.count || 0;
  const gen = f.find((s) => s.step === "≥1 génération IA")?.count || 0;
  if (inscrites) {
    console.log(`   🔑 décrochage diagnostic (inscrites→onboarding fini) : ${inscrites - onb} perdues (${100 - pct(onb)}%)`);
    console.log(`   🔑 onboarding fini mais 0 génération : ${onb - gen} (${onb ? Math.round(((onb - gen) / onb) * 100) : 0}% des onboardé·es)`);
  }
} catch (e) {
  console.log(`funnel : erreur (${String(e.message).slice(0, 90)}) — étape sautée sans casser le run.`);
}
