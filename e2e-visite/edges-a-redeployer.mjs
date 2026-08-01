/**
 * Sonde « du code mergé qui n'est pas en ligne » — l'angle mort du 01/08/2026.
 *
 * Pourquoi elle existe : la PR #666 a mergé un correctif de l'Assistant, le
 * Publish Lovable a bien mis le FRONT en ligne… mais Publish ne redéploie PAS
 * les edge functions. Résultat : le front attendait des cartes que l'edge
 * n'émettait pas, et RIEN ne le disait. Ni la CI (le code est bon), ni les
 * tests (ils testent le code, pas le déployé), ni `edge-deploy-health.mjs`
 * (elle voit une fonction ABSENTE, pas une fonction PÉRIMÉE).
 *
 * C'est une rechute : le même trou a laissé traîner « redéployer analyze-brand »,
 * « le lot D de l'éradication parse texte », « redéployer cron-health »…
 *
 * Principe : purement GIT, zéro réseau, zéro login, zéro crédit.
 *   - pour chaque `supabase/functions/<nom>/`, on prend le dernier commit qui
 *     touche son dossier OU un module `_shared/` qu'elle importe (transitivement
 *     — un `_shared/` modifié ne redéploie PAS ses consommateurs, piège connu) ;
 *   - on compare au registre « dernier déploiement confirmé » ;
 *   - tout écart = fonction à redéployer.
 *
 * Registre hors worktree (comme edge-deploy-seen.json) : le cron tourne dans un
 * worktree frais chaque jour.
 *
 * Usage :
 *   node e2e-visite/edges-a-redeployer.mjs              → VERDICT: OK | WARN | SEED
 *   node e2e-visite/edges-a-redeployer.mjs --marque chat-guide [autre…]
 *   node e2e-visite/edges-a-redeployer.mjs --marque-tout
 *   node e2e-visite/edges-a-redeployer.mjs --seed <sha>  → (re)pose la référence
 *
 * Exit 0 toujours — c'est la routine qui juge le VERDICT imprimé.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const FUNCTIONS_DIR = path.join(REPO, "supabase", "functions");
// Surchargeable pour pouvoir tester la sonde sans toucher au vrai registre.
const STORE = process.env.NOWADAYS_EDGES_STORE
  || path.join(os.homedir(), ".nowadays-visite", "edges-deployed.json");
const STORE_DIR = path.dirname(STORE);

function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

/** Dernier commit touchant un chemin (vide si jamais touché). */
function lastCommitFor(relPaths) {
  try {
    return git("log", "-1", "--format=%H", "--", ...relPaths);
  } catch {
    return "";
  }
}

/** Modules `_shared/` importés par une fonction, en suivant les chaînes d'import. */
function sharedDepsOf(fnName) {
  const seen = new Set();
  const queue = [];

  const scanFile = (absFile) => {
    let src;
    try {
      src = fs.readFileSync(absFile, "utf8");
    } catch {
      return;
    }
    // import … from "../_shared/x.ts"  /  "./y.ts" à l'intérieur de _shared/
    for (const m of src.matchAll(/from\s+["']([^"']*_shared\/[A-Za-z0-9_.-]+\.ts)["']/g)) {
      const base = path.basename(m[1]);
      if (!seen.has(base)) {
        seen.add(base);
        queue.push(path.join(FUNCTIONS_DIR, "_shared", base));
      }
    }
    if (absFile.includes(`${path.sep}_shared${path.sep}`)) {
      for (const m of src.matchAll(/from\s+["']\.\/([A-Za-z0-9_.-]+\.ts)["']/g)) {
        const base = m[1];
        if (!seen.has(base)) {
          seen.add(base);
          queue.push(path.join(FUNCTIONS_DIR, "_shared", base));
        }
      }
    }
  };

  const fnDir = path.join(FUNCTIONS_DIR, fnName);
  for (const f of fs.readdirSync(fnDir).filter((f) => f.endsWith(".ts"))) {
    scanFile(path.join(fnDir, f));
  }
  while (queue.length) scanFile(queue.shift());

  return [...seen].map((base) => `supabase/functions/_shared/${base}`);
}

/** Empreinte de la SOURCE d'une fonction = dernier commit la concernant. */
function sourceShaOf(fnName) {
  const paths = [`supabase/functions/${fnName}/`, ...sharedDepsOf(fnName)];
  return lastCommitFor(paths);
}

function listFunctions() {
  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .map((d) => d.name)
    .filter((n) => fs.existsSync(path.join(FUNCTIONS_DIR, n, "index.ts")))
    .sort();
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return null;
  }
}

function writeStore(obj) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(obj, null, 1));
}

// ── Sous-commandes ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const fns = listFunctions();

if (argv[0] === "--seed") {
  const ref = argv[1];
  if (!ref) {
    console.log("Usage : --seed <sha ou ref git>");
    process.exit(0);
  }
  const store = {};
  for (const fn of fns) {
    const paths = [`supabase/functions/${fn}/`, ...sharedDepsOf(fn)];
    let sha = "";
    try {
      sha = git("log", "-1", "--format=%H", ref, "--", ...paths);
    } catch {
      /* jamais touchée avant cette ref */
    }
    store[fn] = sha;
  }
  writeStore(store);
  console.log(`Référence posée sur ${ref} pour ${fns.length} fonctions → ${STORE}`);
  process.exit(0);
}

if (argv[0] === "--marque" || argv[0] === "--marque-tout") {
  const store = readStore() || {};
  const cibles = argv[0] === "--marque-tout" ? fns : argv.slice(1);
  if (!cibles.length) {
    console.log("Usage : --marque <nom-de-fonction> [autre…]");
    process.exit(0);
  }
  for (const fn of cibles) {
    if (!fns.includes(fn)) {
      console.log(`⚠️ fonction inconnue, ignorée : ${fn}`);
      continue;
    }
    store[fn] = sourceShaOf(fn);
    console.log(`✅ ${fn} marquée comme déployée (${store[fn].slice(0, 8)})`);
  }
  writeStore(store);
  process.exit(0);
}

// ── Contrôle quotidien ────────────────────────────────────────────────────────
const store = readStore();

if (!store) {
  // Premier passage : on pose la référence sur l'état courant et on le DIT.
  // Sans ça, tout apparaîtrait « à redéployer » et la sonde crierait au loup.
  const seed = {};
  for (const fn of fns) seed[fn] = sourceShaOf(fn);
  writeStore(seed);
  console.log("VERDICT: SEED");
  console.log(
    `🌱 Registre de déploiement créé (${fns.length} fonctions) → ${STORE}\n` +
      "   Aucun écart ne peut être détecté aujourd'hui : la référence est l'état actuel.\n" +
      "   Dès demain, toute edge dont le code bouge sans redéploiement sera signalée.",
  );
  process.exit(0);
}

const enRetard = [];
const nouvelles = [];

for (const fn of fns) {
  const source = sourceShaOf(fn);
  if (!(fn in store)) {
    // Fonction neuve : jamais déployée, ce n'est pas une régression.
    // On l'enregistre pour ne la signaler qu'au PROCHAIN changement.
    store[fn] = source;
    nouvelles.push(fn);
    continue;
  }
  if (store[fn] !== source) {
    let quand = "";
    let sujet = "";
    try {
      quand = git("log", "-1", "--format=%ad", "--date=short", source);
      sujet = git("log", "-1", "--format=%s", source).slice(0, 90);
    } catch {
      /* commit introuvable (historique réécrit) */
    }
    enRetard.push({ fn, sha: source.slice(0, 8), quand, sujet });
  }
}

if (nouvelles.length) writeStore(store);

if (!enRetard.length) {
  console.log("VERDICT: OK");
  console.log(`🚚 Déploiement des edges à jour : ${fns.length} fonctions, aucun écart code/en-ligne.`);
  if (nouvelles.length) {
    console.log(`   (${nouvelles.length} nouvelle(s) fonction(s) enregistrée(s) : ${nouvelles.join(", ")})`);
  }
  process.exit(0);
}

console.log("VERDICT: WARN");
console.log(
  `🚚 ${enRetard.length} edge function(s) ont du code mergé qui n'est PAS en ligne ` +
    "(un Publish Lovable ne redéploie que le front) :\n",
);
for (const e of enRetard) {
  console.log(`  • ${e.fn}`);
  console.log(`      dernier changement : ${e.quand} ${e.sha} — ${e.sujet}`);
}
console.log(
  "\n→ Prompt Lovable : « Redéploie les edge functions suivantes sans modifier leur code : " +
    enRetard.map((e) => e.fn).join(", ") +
    " ». Une fois confirmé :\n" +
    `   node e2e-visite/edges-a-redeployer.mjs --marque ${enRetard.map((e) => e.fn).join(" ")}`,
);
process.exit(0);
