// Test de charge des GARDES de quota sous concurrence (pas de la génération elle-même).
//
// Envoie N appels concurrents à une edge quota-gated légère (suggest-format, Gemini
// Flash, ne persiste AUCUNE donnée → zéro pollution du compte) et vérifie que :
//   - le pipeline tient la concurrence (pas de crash, latences raisonnables) ;
//   - le fail-closed honnête (503 quota_check_failed) ne se déclenche pas à tort ;
//   - le décompte de crédits est cohérent (le RPC atomique du bonus ne double-débite pas) ;
//   - le blocage, quand le quota est atteint, est un 429 limit_reached propre.
//
// ⚠️ Consomme de VRAIS crédits « suggestion » sur le compte de test (cap mensuel = 23).
//    Le cap se réinitialise le 1er du mois. Ne PAS pointer sur un compte de prod réel.
//
// Prérequis : creds dans .env (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) et
//             .env.visite.local (VISITE_EMAIL, VISITE_PASSWORD) — non versionnés.
// Usage :  N=10 node scripts/loadtest-quota.mjs
//
// Finding connu (04/07) : sous forte concurrence le check du cap CATÉGORIE
// (COUNT ai_usage non atomique) peut être franchi → sur-autorisation bornée,
// jamais de sous-autorisation. Biais « généreux », pas de faux blocage.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function envFrom(file, key) {
  try {
    const line = readFileSync(resolve(ROOT, file), "utf8").split("\n").find((l) => l.startsWith(key + "="));
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : null;
  } catch { return null; }
}

const URL = envFrom(".env", "VITE_SUPABASE_URL");
const ANON = envFrom(".env", "VITE_SUPABASE_PUBLISHABLE_KEY");
const EMAIL = envFrom(".env.visite.local", "VISITE_EMAIL");
const PASSWORD = envFrom(".env.visite.local", "VISITE_PASSWORD");
const N = Number(process.env.N || 10);

if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.error("❌ Creds manquants — vérifie .env (URL + PUBLISHABLE_KEY) et .env.visite.local (EMAIL + PASSWORD).");
  process.exit(1);
}

async function login() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("login failed: " + JSON.stringify(j));
  return j.access_token;
}

async function quotaSnapshot(jwt) {
  const r = await fetch(`${URL}/functions/v1/check-subscription`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const j = await r.json().catch(() => ({}));
  return { total: j?.ai_usage?.total, suggestion: j?.ai_usage?.suggestion, bonus: j?.bonus_credits, plan: j?.plan };
}

async function oneCall(jwt, i) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${URL}/functions/v1/suggest-format`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ idea: `Partager une astuce de productivité (test concurrent #${i})` }),
    });
    let body = {};
    try { body = await r.json(); } catch {}
    const errorCode = body.error === undefined ? null : (typeof body.error === "string" ? body.error : JSON.stringify(body.error));
    return { i, status: r.status, ms: Date.now() - t0, errorCode, hasFormat: !!body.format };
  } catch (e) {
    return { i, status: 0, ms: Date.now() - t0, errorCode: "fetch_error:" + String(e) };
  }
}

const jwt = await login();
console.log("✅ Authentifiée:", EMAIL);

const before = await quotaSnapshot(jwt);
const bUsed = before?.total?.used;
console.log(`📊 Quota AVANT — total: ${bUsed}/${before?.total?.limit}, suggestion: ${before?.suggestion?.used}/${before?.suggestion?.limit}, bonus: ${before?.bonus}, plan: ${before?.plan}`);

console.log(`\n🚀 Salve de ${N} appels CONCURRENTS à suggest-format…\n`);
const tStart = Date.now();
const results = (await Promise.all(Array.from({ length: N }, (_, i) => oneCall(jwt, i)))).sort((a, b) => a.i - b.i);
const tWall = Date.now() - tStart;

for (const r of results) {
  const tag = r.status === 200 ? "✅" : r.status === 429 ? "🟠429" : r.status === 503 ? "🔴503" : `⚠️${r.status}`;
  console.log(`  #${String(r.i).padStart(2)} ${tag}  ${String(r.ms).padStart(6)}ms  ${r.errorCode ? "→ " + r.errorCode.slice(0, 80) : r.hasFormat ? "→ suggestion OK" : ""}`);
}

const ok = results.filter((r) => r.status === 200).length;
const r429 = results.filter((r) => r.status === 429).length;
const r503 = results.filter((r) => r.status === 503).length;
const other = results.filter((r) => ![200, 429, 503].includes(r.status));
const lats = results.map((r) => r.ms).sort((a, b) => a - b);

console.log(`\n📈 Wall-clock: ${tWall}ms | latence p50: ${lats[Math.floor(lats.length / 2)]}ms, max: ${lats[lats.length - 1]}ms`);
console.log(`   200 OK: ${ok} | 429 limit_reached: ${r429} | 503 quota_check_failed: ${r503} | autres: ${other.length}`);

const after = await quotaSnapshot(jwt);
const aUsed = after?.total?.used;
const delta = (aUsed ?? 0) - (bUsed ?? 0);
console.log(`📊 Quota APRÈS — total: ${aUsed}/${after?.total?.limit}, suggestion: ${after?.suggestion?.used}`);

console.log("\n══ VERDICTS ══");
console.log(`  Fail-closed intempestif ?   ${r503 === 0 ? "✅ aucun 503" : `🔴 ${r503}× 503`}`);
console.log(`  Blocage propre au plafond ? ${r429 === 0 ? "n/a (pas de blocage)" : `✅ ${r429}× 429 limit_reached`}`);
console.log(`  Décompte cohérent ?         ${delta === ok ? "✅ exact (+" + ok + ")" : `⚠️ Δ=${delta} vs ${ok} OK`}`);
console.log(`  Erreurs inattendues ?       ${other.length === 0 ? "✅ aucune" : `⚠️ ${other.map((r) => r.status).join(",")}`}`);
