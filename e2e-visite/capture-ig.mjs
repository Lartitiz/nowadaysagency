/**
 * capture-ig.mjs — repro/vérif du bug "post IG intermittent" (PR #466).
 *
 * Tire une RAFALE de générations de post Instagram (chemin streaming direct de
 * creative-flow → _shared/anthropic-stream.ts createClientSSEStream) et
 * classe chaque réponse SSE :
 *   - OK          : event `done` avec full non vide (succès)
 *   - EMPTY_DONE  : `data: {"type":"done","full":""}` = SIGNATURE DU BUG (33 o) → ÉCHEC
 *   - ERROR       : event `error` explicite (honnête ; le retry serveur n'a pas suffi)
 *   - NO_DONE     : stream coupé sans done ni error (anormal)
 *
 * Critère de succès du fix : 0 EMPTY_DONE, et idéalement 0 ERROR (le retry
 * serveur doit absorber les overloaded avant le 1er delta).
 *
 * Usage : node capture-ig.mjs [count=10] [concurrency=5]
 */
import fs from "fs";
import path from "path";

import { fileURLToPath } from "url";
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadEnv = (file, prefix) => {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(new RegExp(`^\\s*(${prefix}[A-Z0-9_]*)\\s*=\\s*(.*?)\\s*$`));
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};
loadEnv(".env", "VITE_SUPABASE_");
loadEnv(".env.visite.local", "VISITE_");

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.VISITE_EMAIL;
const PASSWORD = process.env.VISITE_PASSWORD;
if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.error("❌ env manquant (VITE_SUPABASE_URL/PUBLISHABLE_KEY, VISITE_EMAIL/PASSWORD)");
  process.exit(1);
}

const COUNT = parseInt(process.argv[2] || "10", 10);
const CONCURRENCY = parseInt(process.argv[3] || "5", 10);

// Idées variées (le prompt varie par index → pas de cache identique)
const IDEES = [
  "Pourquoi je refuse les clients qui veulent 'juste un petit logo vite fait'",
  "La vraie raison pour laquelle tes posts n'ont pas d'engagement",
  "Ce que personne ne te dit sur le fait de bosser seule à son compte",
  "3 signes que tu sous-factures ton travail créatif",
  "Comment j'ai arrêté de travailler le week-end sans perdre de clients",
  "L'erreur que je faisais à chaque appel découverte",
  "Pourquoi je ne fais plus de devis gratuits détaillés",
  "Le mythe du 'il faut poster tous les jours' pour percer",
  "Ce que j'aurais aimé savoir à mes débuts de freelance",
  "Pourquoi ta bio Instagram fait fuir tes futurs clients",
  "La question à te poser avant d'accepter une collaboration",
  "Comment fixer ses tarifs quand on débute (sans se brader)",
];

async function login() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return { token: d.access_token, userId: d.user?.id };
}

function classify(raw) {
  let sawDelta = false, done = null, errorEvent = null;
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("data: ") || s === "data: [DONE]") continue;
    let ev;
    try { ev = JSON.parse(s.slice(6)); } catch { continue; }
    if (ev.type === "delta") sawDelta = true;
    else if (ev.type === "done") done = ev.full ?? "";
    else if (ev.type === "error") errorEvent = ev.error;
  }
  if (done !== null) {
    if (done.trim() === "") return { cat: "EMPTY_DONE", fullLen: 0, sawDelta };
    return { cat: "OK", fullLen: done.length, sawDelta };
  }
  if (errorEvent !== null) return { cat: "ERROR", error: errorEvent, sawDelta };
  return { cat: "NO_DONE", sawDelta };
}

async function genOne(token, userId, i) {
  const idea = IDEES[i % IDEES.length] + (i >= IDEES.length ? ` (variante ${i})` : "");
  const body = {
    step: "generate",
    contentType: process.env.CT || "post_instagram",
    context: idea,
    workspace_id: userId,
    objective: undefined,
  };
  const t0 = Date.now();
  try {
    const r = await fetch(`${URL}/functions/v1/creative-flow`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream", // 🔑 sinon creative-flow prend le chemin NON-streaming (JSON)
      },
      body: JSON.stringify(body),
    });
    const raw = await r.text();
    const bytes = Buffer.byteLength(raw, "utf8");
    const res = classify(raw);
    return { i, http: r.status, bytes, ms: Date.now() - t0, ...res, raw };
  } catch (e) {
    return { i, cat: "FETCH_ERR", error: String(e?.message || e), ms: Date.now() - t0, raw: "" };
  }
}

async function main() {
  console.log(`🎯 Rafale post IG : ${COUNT} générations, concurrence ${CONCURRENCY}`);
  console.log(`   compte = ${EMAIL}  ·  edge = ${URL}/functions/v1/creative-flow\n`);
  const { token, userId } = await login();
  console.log(`✅ connecté (userId=${userId?.slice(0, 8)}…)\n`);

  const results = [];
  let launched = 0;
  const queue = Array.from({ length: COUNT }, (_, i) => i);
  async function worker() {
    while (queue.length) {
      const i = queue.shift();
      const label = `#${String(i + 1).padStart(2, " ")}`;
      const r = await genOne(token, userId, i);
      results.push(r);
      const icon = r.cat === "OK" ? "✅" : r.cat === "ERROR" ? "🟠" : "🔴";
      const detail = r.cat === "OK" ? `${r.fullLen} car., ${r.bytes} o`
        : r.cat === "EMPTY_DONE" ? `DONE VIDE (${r.bytes} o) — BUG !`
        : r.cat === "ERROR" ? `error="${String(r.error).slice(0, 70)}"`
        : r.cat === "NO_DONE" ? `stream coupé sans done/error (${r.bytes} o)`
        : `fetch KO: ${r.error}`;
      console.log(`${icon} ${label}  HTTP ${r.http ?? "—"}  ${String(r.ms).padStart(6)}ms  ${r.cat.padEnd(10)} ${detail}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, COUNT) }, worker));

  // ── Bilan ──
  const by = (c) => results.filter((r) => r.cat === c).length;
  console.log(`\n──────── BILAN (${results.length} générations) ────────`);
  console.log(`  ✅ OK          : ${by("OK")}`);
  console.log(`  🔴 EMPTY_DONE  : ${by("EMPTY_DONE")}   ${by("EMPTY_DONE") ? "← BUG NON CORRIGÉ / déploiement pas propagé" : ""}`);
  console.log(`  🟠 ERROR       : ${by("ERROR")}   ${by("ERROR") ? "(erreur honnête → retry serveur insuffisant)" : ""}`);
  console.log(`  🔴 NO_DONE     : ${by("NO_DONE")}`);
  console.log(`  🔴 FETCH_ERR   : ${by("FETCH_ERR")}`);

  // Dump des échecs pour diagnostic
  const fails = results.filter((r) => r.cat === "EMPTY_DONE" || r.cat === "NO_DONE");
  for (const f of fails) {
    console.log(`\n── dump brut #${f.i + 1} (${f.cat}) ──\n${(f.raw || "").slice(0, 400)}`);
  }
  const verdict = by("EMPTY_DONE") === 0 && by("NO_DONE") === 0 && by("FETCH_ERR") === 0;
  console.log(`\n${verdict ? "🟢 VERDICT : aucun done vide / échec muet." : "🔴 VERDICT : échec(s) détecté(s) — voir dumps."}` +
    (by("ERROR") ? `  (${by("ERROR")} erreur(s) honnête(s) — acceptable mais surveiller)` : ""));
  process.exit(verdict ? 0 : 1);
}

main().catch((e) => { console.error("💥", e); process.exit(2); });
