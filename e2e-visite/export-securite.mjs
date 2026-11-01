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
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env.visite.local n'est pas versé dans git : depuis un worktree, le lire dans le clone principal.
const clonePrincipal = () => {
  try {
    const commun = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: __dirname, encoding: "utf8" }).trim();
    return path.dirname(commun);
  } catch {
    return null;
  }
};
const load = (f, prefix) => {
  const candidats = [path.join(__dirname, "..", f), clonePrincipal() && path.join(clonePrincipal(), f)].filter(Boolean);
  const p = candidats.find((c) => fs.existsSync(c));
  if (!p) return;
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
  // Pas un « sauté » silencieux : aucun export pendant 18 jours est passé inaperçu.
  console.log("🔴 export de sécurité : PAS FAIT (VITE_SUPABASE_* ou CRON_STATS_SECRET absent).");
  process.exit(1);
}

// L'edge copie un morceau par appel et dit où elle en est. Sur un 546 (pas assez
// de ressources), repartir du dernier état avec des morceaux plus petits.
const debut = Date.now();
const LIMITE_MS = 40 * 60_000;
let d = null;
let date = null;
let plafond_mo = 15;
let page_max = 1000;
for (;;) {
  const r = await fetch(`${URL}/functions/v1/export-securite`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "x-cron-secret": SECRET, "Content-Type": "application/json" },
    body: JSON.stringify({ date, plafond_mo, page_max }),
    signal: AbortSignal.timeout(300_000),
  });
  if (r.status === 546 && (plafond_mo > 1 || page_max > 1)) {
    plafond_mo = Math.max(1, Math.floor(plafond_mo / 2));
    page_max = Math.max(1, Math.floor(page_max / 5));
    continue;
  }
  if (!r.ok) {
    console.log(`🔴 export de sécurité : HTTP ${r.status} (${(await r.text()).slice(0, 120)}) — edge pas déployée ou bucket « sauvegardes » absent ?${d ? ` Arrêté à ${d.avancement}.` : ""}`);
    process.exit(1);
  }
  d = await r.json();
  date = d.date;
  if (d.termine) break;
  if (Date.now() - debut > LIMITE_MS) {
    console.log(`🔴 export de sécurité : pas fini après 40 min, arrêté à ${d.avancement}.`);
    process.exit(1);
  }
}
const mo = (d.octets / 1024 / 1024).toFixed(1);
const erreurs = Object.entries(d.erreurs || {});
const secrets = Object.entries(d.secrets_vus || {});
const liens = Object.entries(d.liens_signes_retires || {});
const complet = !erreurs.length;
console.log(`${complet && !secrets.length ? "✅" : "🔴"} export de sécurité du ${d.date} : ${d.tables_copiees} tables, ${d.lignes} lignes, ${mo} Mo compressés, ${d.duree_s} s`);
for (const [t, e] of erreurs) console.log(`   🔴 ${t} : ${e}`);
if (secrets.length) console.log(`   🔴 forme de clé ou de jeton retirée de la copie (à comprendre) : ${secrets.map(([t, n]) => `${t} ${n}`).join(", ")}`);
if (liens.length) console.log(`   jetons de liens signés retirés de la copie : ${liens.map(([t, n]) => `${t} ${n}`).join(", ")}`);
if ((d.anciens_exports_supprimes || []).length) console.log(`   rotation : anciens exports retirés ${d.anciens_exports_supprimes.join(", ")}`);
const gardes = d.exports_gardes || [];
if (gardes.length) {
  const age = Math.round((Date.now() - Date.parse(gardes[gardes.length - 1])) / 86_400_000);
  // La politique de confidentialité annonce environ 3 mois : au-delà, la rotation ne tourne plus.
  console.log(`   ${age > 125 ? "🔴" : ""}exports gardés : ${gardes.join(", ")} (le plus ancien a ${age} jours)`);
}
if (!complet || secrets.length) process.exit(1);
