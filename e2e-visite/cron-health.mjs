/**
 * Santé de l'app — lecture de l'edge `cron-health`.
 *
 * Sans argument : scope "daily" (étape 8bis de la visite quotidienne) — santé des
 * publications réelles (échecs, posts bloqués, programmés en retard, tokens sociaux)
 * + retours bêta des 24 h (widget beta_feedback), les « blocking » en tête.
 * Avec `--hebdo` : scope "weekly" (routine du lundi) — coûts IA, usage features,
 * rétention par cohorte, volume de publications.
 *
 * Même plomberie que activation-funnel.mjs : secret partagé CRON_STATS_SECRET
 * (`.env.visite.local`), anon key du `.env`. Ne casse jamais le run (exit 0 partout) ;
 * c'est au cron de juger les chiffres.
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
const hebdo = process.argv.includes("--hebdo");
if (!URL || !ANON || !SECRET) {
  console.log("santé : non branché (VITE_SUPABASE_* ou CRON_STATS_SECRET absent) — étape sautée.");
  process.exit(0);
}

try {
  const r = await fetch(`${URL}/functions/v1/cron-health`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "x-cron-secret": SECRET, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: hebdo ? "weekly" : "daily" }),
  });
  if (!r.ok) {
    console.log(`santé : edge cron-health HTTP ${r.status} (${(await r.text()).slice(0, 90)}) — étape sautée (edge pas déployée ? régé schéma ?).`);
    process.exit(0);
  }
  const d = await r.json();

  if (!hebdo) {
    console.log("🩺 Santé des publications (source Supabase — hors comptes test)");
    console.log(`   échecs de publication (48 h)   : ${d.failed_48h.count}`);
    for (const f of d.failed_48h.items || []) console.log(`      🔴 ${f.canal} le ${f.quand} — ${f.erreur || "sans message"}`);
    console.log(`   posts bloqués en "publishing"  : ${d.stuck_publishing}${d.stuck_publishing ? "  🔴 worker planté en route ?" : ""}`);
    console.log(`   programmés en retard (>45 min) : ${d.overdue_scheduled}${d.overdue_scheduled ? "  🔴 cron pg de publication mort ? (régé schéma)" : ""}`);
    console.log(`   publiés dans les 24 h          : ${d.published_24h}`);
    console.log(`   connexions sociales à risque   : ${(d.connections_at_risk || []).length} / ${d.connections_total}`);
    for (const c of d.connections_at_risk || []) console.log(`      ⚠️ ${c.platform} (${c.compte || "?"}) — ${c.etat} (${c.jours} j)`);
    if (d.feedback_24h) {
      const items = d.feedback_24h.items || [];
      const blocking = items.filter((f) => f.severite === "blocking").length;
      console.log(`   feedbacks bêta (24 h)          : ${d.feedback_24h.count}${blocking ? `  🔴 dont ${blocking} BLOQUANT(S)` : ""}`);
      for (const f of items) {
        const icone = f.severite === "blocking" ? "🔴" : f.type === "bug" ? "🟡" : "💡";
        const sev = f.severite ? ` [${f.severite}]` : "";
        console.log(`      ${icone} ${f.type}${sev} — « ${f.contenu} »${f.page ? ` (page ${f.page})` : ""}${f.capture ? " 📎 capture" : ""} — ${f.quand}`);
        if (f.detail) console.log(`         ↳ ${f.detail}`);
      }
      if (d.feedback_new_total > d.feedback_24h.count) {
        console.log(`   feedbacks encore « new » (tous âges) : ${d.feedback_new_total}  ⚠️ des plus anciens jamais traités dans l'onglet admin`);
      }
    }
  } else {
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
    const delta = (cur, prev) => (prev ? `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}%` : "n/a");
    const cur = d.ia_7j, prev = d.ia_7j_precedents;
    console.log("📈 Bilan hebdo (source Supabase — hors comptes test)");
    console.log(`   IA 7 j : ${cur.appels} appels / ${cur.tokens} tokens / ${cur.utilisatrices} utilisatrices  (vs S-1 : ${delta(cur.appels, prev.appels)} appels, ${delta(cur.tokens, prev.tokens)} tokens)`);
    for (const [m, v] of Object.entries(cur.byModel || {})) console.log(`      modèle ${m} : ${v.appels} appels, ${v.tokens} tokens`);
    if (cur.cout_total_estime_eur != null) {
      console.log(
        `   coût estimé 7 j : ${cur.cout_total_estime_eur} € (texte ${cur.cout_texte_estime_eur} € + images ${cur.cout_images_estime_eur} €)  (S-1 : ${prev.cout_total_estime_eur ?? "?"} €)`
      );
    }
    console.log("   top actions 7 j (vs S-1) :");
    const prevActions = Object.fromEntries((prev.topActions || []).map((a) => [a.action, a.count]));
    for (const a of cur.topActions || []) console.log(`      ${String(a.action).padEnd(28)} ${String(a.count).padStart(4)}  (S-1 : ${prevActions[a.action] ?? 0})`);
    console.log(`   publications : ${d.publications.cette_semaine} cette semaine (S-1 : ${d.publications.semaine_precedente})`);
    console.log(`   actives cette semaine : ${d.actives_cette_semaine}`);
    console.log("   rétention par cohorte d'inscription (active = ≥1 génération ou post sur 7 j) :");
    for (const c of d.cohortes || []) console.log(`      ${c.semaine} (du ${c.du}) : ${c.actives_cette_semaine}/${c.inscrites} actives (${pct(c.actives_cette_semaine, c.inscrites)})`);
  }
} catch (e) {
  console.log(`santé : erreur (${String(e.message).slice(0, 90)}) — étape sautée sans casser le run.`);
}
