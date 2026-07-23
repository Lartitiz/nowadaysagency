/**
 * Santé du DÉPLOIEMENT des edge functions — sonde INDÉPENDANTE de toute edge.
 *
 * Pourquoi cette sonde existe (incident 23/07/2026) : un déploiement Lovable a fait
 * tomber 92 des 108 edge functions du serveur (HTTP 404 `NOT_FOUND_FUNCTION_BLOB`).
 * La routine matinale ne l'a PAS vu : ses helpers (cron-health, activation-funnel)
 * s'appuient sur des edges qui, par chance, faisaient partie des 16 survivantes → la
 * visite serait restée « verte » pendant que le branding, le chat, les stats, la
 * publication, les e-mails étaient morts.
 *
 * Cette sonde ne dépend d'AUCUNE edge : elle ping l'inventaire complet SANS login
 * (le 404 « function not found » survient AVANT l'auth), avec juste l'anon key.
 * Seul signal d'absence = 404 + NOT_FOUND_FUNCTION_BLOB — jamais un timeout ni une
 * erreur réseau → zéro faux positif.
 *
 * Baseline « déjà vue en ligne » persistée hors worktree (comme pptx-history) pour
 * ne signaler que les RÉGRESSIONS (une fonction qui était déployée et ne l'est plus),
 * pas une fonction neuve encore jamais poussée.
 *
 * Même plomberie que cron-health.mjs : anon key du `.env`. Exit 0 partout — c'est la
 * routine qui juge le verdict imprimé (VERDICT: PANNE|WARN|OK).
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

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
if (!SUPABASE_URL || !ANON) {
  console.log("VERDICT: SKIP");
  console.log("⚠️ Sonde déploiement edge : .env introuvable (VITE_SUPABASE_URL / PUBLISHABLE_KEY) — étape sautée.");
  process.exit(0);
}

// Répertoire de données stable, hors worktree (effacé chaque jour). Cf pptx-history.
const DATA_DIR = process.env.NOWADAYS_VISITE_DATA || path.join(process.env.HOME || "", ".nowadays-visite");
const BASELINE = path.join(DATA_DIR, "edge-deploy-seen.json");

// Seuil : une panne de déploiement en tue des dizaines ; une régression isolée est
// souvent un boot-error à surveiller, pas une panne globale.
const PANNE_THRESHOLD = 5;

const fnDir = path.join(__dirname, "..", "supabase", "functions");
const expected = fs.readdirSync(fnDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && d.name !== "import_map")
  .map((d) => d.name)
  .sort();

async function ping(fn) {
  // 404 « Requested function was not found » = pas servie (avant l'auth), sous deux
  // codes : NOT_FOUND_FUNCTION_BLOB (bundle perdu = déployée puis tombée, cas 23/07)
  // ou NOT_FOUND (inconnue du routeur = jamais déployée). 503/500 boot = plantée.
  // Tout le reste (400/401/200…) = déployée. Un throw réseau ≠ absence → on re-teste.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Origin: "https://nowadays-assistant.fr" },
        body: "{}",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const body = await res.text().catch(() => "");
      if (res.status === 404 && (body.includes("NOT_FOUND_FUNCTION_BLOB") || body.includes("Requested function was not found"))) return "absente";
      if ((res.status === 503 || res.status === 500) && /BOOT_ERROR|WORKER_LIMIT|boot/i.test(body)) return "boot_error";
      return "en_ligne";
    } catch {
      if (attempt === 1) return "indetermine"; // réseau : ni en ligne ni absente
    }
  }
  return "indetermine";
}

// Ping en parallèle, par lots (évite d'ouvrir 108 sockets d'un coup).
async function pingAll(names, batch = 16) {
  const out = {};
  for (let i = 0; i < names.length; i += batch) {
    const slice = names.slice(i, i + batch);
    const res = await Promise.all(slice.map((n) => ping(n)));
    slice.forEach((n, j) => { out[n] = res[j]; });
  }
  return out;
}

const status = await pingAll(expected);
const enLigne = expected.filter((f) => status[f] === "en_ligne");
const absentes = expected.filter((f) => status[f] === "absente");
const bootErrors = expected.filter((f) => status[f] === "boot_error");
const indetermines = expected.filter((f) => status[f] === "indetermine");

// Baseline : ensemble des fonctions déjà vues en ligne au moins une fois.
let everSeen = [];
try { everSeen = JSON.parse(fs.readFileSync(BASELINE, "utf8")).everSeenOnline || []; } catch { /* 1re fois */ }
const everSet = new Set(everSeen);

// Régression = fonction connue déployée AVANT, absente AUJOURD'HUI (vrai signal de panne).
const regressions = absentes.filter((f) => everSet.has(f));
// Fonctions absentes jamais vues en ligne = neuves non déployées → info, pas alerte.
const neuvesNonDeployees = absentes.filter((f) => !everSet.has(f));

// Met à jour la baseline (accumulation).
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  enLigne.forEach((f) => everSet.add(f));
  fs.writeFileSync(BASELINE, JSON.stringify({ everSeenOnline: [...everSet].sort(), updatedAt: new Date().toISOString() }, null, 2));
} catch { /* non bloquant */ }

// ---- Verdict ----
const fmt = (arr, n = 12) => arr.slice(0, n).join(", ") + (arr.length > n ? ` … (+${arr.length - n})` : "");

if (regressions.length >= PANNE_THRESHOLD) {
  console.log("VERDICT: PANNE");
  console.log(`🔴 PANNE DE DÉPLOIEMENT EDGE : ${regressions.length} fonctions tombées (déployées avant, absentes maintenant).`);
  console.log(`   → ${enLigne.length}/${expected.length} en ligne seulement.`);
  console.log(`   → Absentes : ${fmt(regressions)}`);
  console.log(`   ⇒ ACTION : demander à Lovable un REDÉPLOIEMENT COMPLET des edge functions.`);
  console.log(`   (re-mesurer d'abord : un redeploy en cours remonte tout seul — cf mémoire edge_functions_deploiement_perdu)`);
} else if (regressions.length > 0 || bootErrors.length > 0) {
  console.log("VERDICT: WARN");
  if (regressions.length) console.log(`⚠️ ${regressions.length} fonction(s) tombée(s) : ${fmt(regressions)} → prompt Lovable de redéploiement ciblé.`);
  if (bootErrors.length) console.log(`⚠️ ${bootErrors.length} fonction(s) en erreur de démarrage (BOOT_ERROR) : ${fmt(bootErrors)} → redéploiement ciblé Lovable.`);
  console.log(`   ${enLigne.length}/${expected.length} en ligne.`);
} else {
  console.log("VERDICT: OK");
  console.log(`🧩 Déploiement edge : ${enLigne.length}/${expected.length} en ligne ✅`);
}

if (neuvesNonDeployees.length) {
  console.log(`ℹ️ ${neuvesNonDeployees.length} fonction(s) présente(s) dans le repo mais jamais vue(s) en ligne (neuves à déployer ?) : ${fmt(neuvesNonDeployees)}`);
}
if (indetermines.length) {
  console.log(`ℹ️ ${indetermines.length} indéterminée(s) (réseau) — non comptées : ${fmt(indetermines)}`);
}

process.exit(0);
