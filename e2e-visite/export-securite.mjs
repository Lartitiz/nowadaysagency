#!/usr/bin/env node
/**
 * Export de sécurité mensuel — déclenche l'edge `export-securite` (copie de
 * chaque table, hors secrets et journaux, dans le bucket privé `sauvegardes`)
 * et affiche le résumé. Lancé par la routine « audit mensuel ».
 *
 * Même plomberie que cron-health.mjs : secret partagé CRON_STATS_SECRET,
 * lu dans .env.visite.local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  console.log("export de sécurité : non branché (VITE_SUPABASE_* ou CRON_STATS_SECRET absent) — étape sautée.");
  process.exit(0);
}

const r = await fetch(`${URL}/functions/v1/export-securite`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "x-cron-secret": SECRET, "Content-Type": "application/json" },
  body: "{}",
  signal: AbortSignal.timeout(420_000),
});
if (!r.ok) {
  console.log(`🔴 export de sécurité : HTTP ${r.status} (${(await r.text()).slice(0, 120)}) — edge pas déployée ou bucket « sauvegardes » absent ?`);
  process.exit(1);
}
const d = await r.json();
const mo = (d.octets / 1024 / 1024).toFixed(1);
const erreurs = Object.entries(d.erreurs || {});
const complet = !erreurs.length && !(d.non_faites || []).length;
console.log(`${complet ? "✅" : "🔴"} export de sécurité du ${d.date} : ${d.tables_copiees} tables, ${d.lignes} lignes, ${mo} Mo compressés, ${d.duree_s} s`);
for (const [t, e] of erreurs) console.log(`   🔴 ${t} : ${e}`);
if ((d.non_faites || []).length) console.log(`   🔴 pas le temps de copier : ${d.non_faites.join(", ")}`);
if ((d.anciens_exports_supprimes || []).length) console.log(`   rotation : anciens exports retirés ${d.anciens_exports_supprimes.join(", ")}`);
