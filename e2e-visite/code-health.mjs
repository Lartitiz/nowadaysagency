#!/usr/bin/env node
// Santé du CODE (pas du produit) — ajouté 17/08/2026 suite à la peur de Laetitia
// du "mur" en vibe coding. La visite quotidienne + cron-health testent le
// COMPORTEMENT en marche de l'app (régressions, coûts, intégrité infra) ; ce
// script teste la SANTÉ DU CODE lui-même, ce qu'aucune sonde comportementale
// ne peut voir : dépendances vulnérables/obsolètes, dette gelée (knip),
// duplication. Cadence hebdo (routine-hebdo-lundi) : ces signaux bougent lentement,
// une lecture quotidienne serait du bruit.
//
// Ne bloque JAMAIS le run appelant : chaque section est indépendante (une
// panne dans l'une n'empêche pas les autres), et le script sort toujours en 0.
// Le premier run sert de RÉFÉRENCE (pas d'alarme) ; les runs suivants ne
// signalent que les DELTAS vs la référence — même discipline que
// edges-a-redeployer.mjs / edge-deploy-health.mjs (sinon 99 vulnérabilités
// connues et gelées finiraient lues comme du bruit chaque semaine, cf. le
// piège "sonde qui crie chaque matin" déjà vécu sur ce projet).
//
// Usage : node e2e-visite/code-health.mjs (depuis la racine du repo, worktree
// avec node_modules installé). Le fichier de référence vit HORS du worktree :
// ~/.nowadays-visite/code-health-baseline.json (surchargeable via
// NOWADAYS_CODE_HEALTH_STORE, utile pour tester sans toucher la vraie référence).

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const STORE_PATH =
  process.env.NOWADAYS_CODE_HEALTH_STORE ||
  join(homedir(), ".nowadays-visite", "code-health-baseline.json");

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveBaseline(next) {
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(next, null, 2));
  } catch (e) {
    console.log(`   ⚠️ référence non sauvegardée (${e.message}) — prochain run comparera à l'ancienne`);
  }
}

async function runWithTimeout(cmd, args, opts, timeoutMs) {
  const child = execFileAsync(cmd, args, { ...opts, maxBuffer: 1024 * 1024 * 50 });
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([child, timeout]);
}

// Certains CLI (bun audit dès qu'il y a des vulnérabilités) sortent en code
// non-zéro alors que leur stdout contient bien le JSON attendu — on le
// récupère depuis l'erreur plutôt que de traiter ça comme un échec réel.
async function runToleratingNonZero(cmd, args, opts, timeoutMs) {
  try {
    return await runWithTimeout(cmd, args, opts, timeoutMs);
  } catch (e) {
    if (typeof e.stdout === "string" && e.stdout.trim().length > 0) {
      return { stdout: e.stdout, stderr: e.stderr };
    }
    throw e;
  }
}

// Isole le cache npm de ce run : évite les EEXIST/EACCES de contention quand
// plusieurs sessions tournent en parallèle sur la machine (vécu 17/08 — le
// cache ~/.npm partagé se corrompt sous accès concurrent).
const ISOLATED_NPM_ENV = { ...process.env, npm_config_cache: join("/tmp", "npm-cache-code-health") };

// ── Section 1 : dépendances (bun audit --json) ─────────────────────────────
async function auditDeps() {
  const { stdout } = await runToleratingNonZero("bun", ["audit", "--json"], { cwd: REPO_ROOT }, 60_000);
  const advisories = JSON.parse(stdout);
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  const criticalOrHigh = [];
  for (const [pkg, vulns] of Object.entries(advisories)) {
    for (const v of vulns) {
      if (counts[v.severity] !== undefined) counts[v.severity]++;
      if (v.severity === "critical" || v.severity === "high") {
        criticalOrHigh.push(`${pkg} (${v.severity}) — ${v.title}`);
      }
    }
  }
  return { counts, criticalOrHigh, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

function printDeps(deps, baseline) {
  console.log("🔐 Dépendances (bun audit)");
  if (!deps) {
    console.log("   non déterminé (audit a échoué ou dépassé le délai) — étape sautée");
    return null;
  }
  const { counts, criticalOrHigh, total } = deps;
  const prev = baseline?.deps?.counts;
  const deltaCrit = prev ? counts.critical - prev.critical : null;
  const deltaHigh = prev ? counts.high - prev.high : null;
  console.log(
    `   ${total} vulnérabilités connues : ${counts.critical} critiques, ${counts.high} hautes, ${counts.moderate} moyennes, ${counts.low} basses.`
  );
  if (prev === undefined || prev === null) {
    console.log("   (1re mesure — sert de référence, rien à comparer)");
  } else if (deltaCrit > 0 || deltaHigh > 0) {
    console.log(`   🔴 NOUVEAU vs dernière mesure : ${deltaCrit > 0 ? `+${deltaCrit} critique(s) ` : ""}${deltaHigh > 0 ? `+${deltaHigh} haute(s)` : ""}`);
  } else if (deltaCrit < 0 || deltaHigh < 0) {
    console.log(`   ✅ amélioration vs dernière mesure (${deltaCrit} critique(s), ${deltaHigh} haute(s))`);
  } else {
    console.log("   = stable vs dernière mesure, rien de neuf");
  }
  if (criticalOrHigh.length) {
    console.log("   Détail critique/haute :");
    for (const line of criticalOrHigh.slice(0, 8)) console.log(`     - ${line}`);
    if (criticalOrHigh.length > 8) console.log(`     … et ${criticalOrHigh.length - 8} de plus`);
  }
  return deps;
}

// ── Section 2 : code mort / dépendances non déclarées (knip) ───────────────
async function runKnip() {
  try {
    const { stdout } = await runToleratingNonZero(
      "npx",
      ["--yes", "knip@5.88.1", "--no-progress", "--reporter", "json"],
      { cwd: REPO_ROOT, env: ISOLATED_NPM_ENV },
      120_000
    );
    const report = JSON.parse(stdout);
    const issueCount = (report.issues || []).reduce((sum, f) => {
      return (
        sum +
        (f.files ? 1 : 0) +
        (f.dependencies?.length || 0) +
        (f.devDependencies?.length || 0) +
        (f.unlisted?.length || 0) +
        (f.binaries?.length || 0)
      );
    }, 0);
    return { newIssues: issueCount, ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function frozenDebtSize() {
  try {
    const raw = readFileSync(join(REPO_ROOT, "knip.jsonc"), "utf8");
    // knip.jsonc a des commentaires // — JSON.parse strict échoue, on ne veut
    // que la taille des tableaux ignore/ignoreDependencies, un decompte de
    // lignes-guillemets top-niveau suffit sans vrai parseur JSONC.
    const ignoreMatch = raw.match(/"ignore"\s*:\s*\[([\s\S]*?)\]/);
    const ignoreDepsMatch = raw.match(/"ignoreDependencies"\s*:\s*\[([\s\S]*?)\]/);
    const countStrings = (block) => (block ? (block.match(/"[^"]+"/g) || []).length : 0);
    return {
      fichiersGeles: countStrings(ignoreMatch?.[1]),
      depsGelees: countStrings(ignoreDepsMatch?.[1]),
    };
  } catch {
    return null;
  }
}

function printKnip(knip, baseline) {
  console.log("🧹 Code mort / dépendances non déclarées (knip)");
  if (!knip.ok) {
    console.log(`   non déterminé (${knip.error}) — étape sautée`);
    return null;
  }
  const prevNew = baseline?.knip?.newIssues;
  if (knip.newIssues === 0) {
    console.log("   0 nouvelle dette (au-delà de la dette gelée existante) — CI locale aussi verte sur ce point");
  } else {
    console.log(`   🔴 ${knip.newIssues} nouveau(x) signalement(s) au-delà de la dette gelée — voir 'npm run knip' pour le détail`);
  }
  if (prevNew !== undefined && prevNew !== knip.newIssues) {
    console.log(`   (dernière mesure : ${prevNew})`);
  }
  const frozen = frozenDebtSize();
  if (frozen) {
    console.log(
      `   Pour mémoire, dette GELÉE (backlog connu, pas nouveau, cf knip.jsonc) : ${frozen.fichiersGeles} fichiers morts ignorés, ${frozen.depsGelees} dépendances ignorées.`
    );
  }
  return knip;
}

// ── Section 3 : duplication (jscpd) ─────────────────────────────────────────
async function runJscpd() {
  const outDir = join("/tmp", `jscpd-code-health-${Date.now()}`);
  await runWithTimeout(
    join(REPO_ROOT, "node_modules", ".bin", "jscpd"),
    ["src/", "supabase/functions/", "--reporters", "json", "--output", outDir, "--min-lines", "5", "--min-tokens", "50", "--silent"],
    { cwd: REPO_ROOT },
    120_000
  );
  const report = JSON.parse(readFileSync(join(outDir, "jscpd-report.json"), "utf8"));
  const top = [...report.duplicates]
    .sort((a, b) => b.firstFile.end - b.firstFile.start - (a.firstFile.end - a.firstFile.start))
    .slice(0, 3)
    .map((d) => `${d.firstFile.name}:${d.firstFile.start}-${d.firstFile.end} ≈ ${d.secondFile.name}:${d.secondFile.start}-${d.secondFile.end}`);
  return { percentage: report.statistics.total.percentage, clones: report.statistics.total.clones, top };
}

function printJscpd(dup, baseline) {
  console.log("🪞 Duplication de code (jscpd, src/ + supabase/functions/)");
  if (!dup) {
    console.log("   non déterminé (scan a échoué ou dépassé le délai) — étape sautée");
    return null;
  }
  const prevPct = baseline?.duplication?.percentage;
  console.log(`   ${dup.percentage.toFixed(2)}% de lignes dupliquées, ${dup.clones} clones détectés.`);
  if (prevPct === undefined || prevPct === null) {
    console.log("   (1re mesure — sert de référence, rien à comparer)");
  } else {
    const delta = dup.percentage - prevPct;
    if (delta > 0.5) {
      console.log(`   🔴 en hausse de ${delta.toFixed(2)} points vs dernière mesure`);
    } else if (delta < -0.5) {
      console.log(`   ✅ en baisse de ${Math.abs(delta).toFixed(2)} points vs dernière mesure`);
    } else {
      console.log("   ≈ stable vs dernière mesure");
    }
  }
  if (dup.top.length) {
    console.log("   Plus gros doublons :");
    for (const line of dup.top) console.log(`     - ${line}`);
  }
  return dup;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const baseline = loadBaseline();
  console.log("🩹 Santé du code (hebdo)");

  let deps = null;
  try {
    deps = await auditDeps();
  } catch (e) {
    deps = null;
    console.log(`🔐 Dépendances (bun audit)\n   non déterminé (${e.message}) — étape sautée`);
  }
  if (deps) printDeps(deps, baseline);

  let knip = null;
  try {
    knip = await runKnip();
  } catch (e) {
    knip = { ok: false, error: e.message };
  }
  printKnip(knip, baseline);

  let dup = null;
  try {
    dup = await runJscpd();
  } catch (e) {
    dup = null;
    console.log(`🪞 Duplication de code\n   non déterminé (${e.message}) — étape sautée`);
  }
  if (dup) printJscpd(dup, baseline);

  const warn =
    (deps && baseline?.deps?.counts && (deps.counts.critical > baseline.deps.counts.critical || deps.counts.high > baseline.deps.counts.high)) ||
    (knip?.ok && knip.newIssues > 0) ||
    (dup && baseline?.duplication?.percentage != null && dup.percentage - baseline.duplication.percentage > 0.5);

  console.log(`\nVERDICT: ${warn ? "WARN" : "OK"}`);

  saveBaseline({
    updatedAt: new Date().toISOString(),
    deps: deps ? { counts: deps.counts } : baseline?.deps,
    knip: knip?.ok ? { newIssues: knip.newIssues } : baseline?.knip,
    duplication: dup ? { percentage: dup.percentage } : baseline?.duplication,
  });

  process.exit(0);
}

main().catch((e) => {
  console.log(`🩹 Santé du code — échec inattendu (${e.message}), étape sautée sans bloquer le run`);
  process.exit(0);
});
