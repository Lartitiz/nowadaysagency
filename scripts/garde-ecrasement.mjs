#!/usr/bin/env node
// Garde anti-écrasement (08/10/2026).
//
// Lovable écrit directement sur `main` (478 des 915 commits du 28/09 au 08/10)
// et `main` n'est pas protégée. Une fusion Lovable partie d'une branche ancienne
// peut donc EFFACER une correction déjà mergée, sans qu'aucun commit ne semble
// toucher le fichier (vécu le 06/08 sur nowadays-siteweb, PR #39 ; cf. mémoire
// reference_lovable_merge_ecrase_pr). Les tests ne le voient pas : le code
// effacé emporte souvent ses propres tests avec lui.
//
// Principe : pour chaque commit de `main` qui n'est PAS une PR (commit Lovable,
// fusion, édition directe), on prend les lignes qu'il SUPPRIME par rapport à
// son premier parent, et on demande à `git blame` qui les avait écrites. Si ce
// sont des PR mergées depuis moins de N jours (30 par défaut), on le signale.
// Une ligne simplement déplacée (supprimée ici, ajoutée ailleurs dans le même
// commit) n'est pas comptée.
//
// La garde ne bloque rien : une suppression peut être voulue (édition dans
// Lovable). Elle PRÉVIENT, avec la liste exacte de ce qui a disparu.
//
// Usage :
//   node scripts/garde-ecrasement.mjs --range <avant>..<après>   (CI, sur push)
//   node scripts/garde-ecrasement.mjs --backtest 30              (rejouer l'historique)
// Options : --days 30 (fenêtre des PR protégées), --min 3 (lignes par PR avant alerte),
//           --report <fichier.md> (rapport écrit seulement s'il y a une alerte).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

/** Fichiers régénérés par les outils : leurs changements ne sont pas des écrasements. */
export const IGNORED_PATHS = [
  "bun.lock", "bun.lockb", "package-lock.json", "deno.lock",
  "src/integrations/supabase/types.ts",
];

/** Commit squash d'une PR GitHub : « Titre (#1234) ». */
export function prNumberOf(subject) {
  const m = /\(#(\d+)\)\s*$/.exec(subject || "");
  return m ? Number(m[1]) : null;
}

/** Fusion d'une PR ou d'une branche de travail (relue + testée) : pas un écrasement Lovable. */
export function isReviewedMerge(subject) {
  return /^Merge (pull request|PR) #\d+|^Merge (remote-tracking )?branch /.test(subject || "");
}

/**
 * Gravité d'une suppression :
 * - "overwrite" : la version de Lovable ne contenait PAS la PR (branche partie
 *   d'avant) → elle l'a écrasée sans la voir. C'est le cas du 06/08 : alerte.
 * - "edit" : Lovable avait la PR sous les yeux et l'a modifiée → sans doute une
 *   demande faite dans Lovable : simple mention.
 */
export function severityOf(lovableSawPr) {
  return lovableSawPr ? "edit" : "overwrite";
}

/** Ligne qui porte du sens (pas une accolade, une ligne vide ou de la ponctuation seule). */
export function meaningful(text) {
  const t = (text || "").trim();
  return t.length >= 4 && /[\p{L}\p{N}]/u.test(t);
}

const norm = (t) => (t || "").replace(/\s+/g, " ").trim();

/**
 * Diff unifié (`git diff -U0 --no-renames`) → par fichier, les lignes supprimées
 * (numéro dans la version d'AVANT + texte) et les textes ajoutés.
 */
export function parseUnifiedDiff(text) {
  const files = [];
  let cur = null;
  let oldLine = 0;
  for (const line of (text || "").split("\n")) {
    if (line.startsWith("diff --git ")) {
      cur = { file: null, removed: [], added: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("--- ")) {
      const p = line.slice(4);
      cur.file = p === "/dev/null" ? null : p.replace(/^a\//, "");
      continue;
    }
    if (line.startsWith("+++ ")) {
      if (!cur.file) {
        const p = line.slice(4);
        cur.file = p === "/dev/null" ? null : p.replace(/^b\//, "");
        cur.created = true;
      }
      continue;
    }
    const h = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
    if (h) { oldLine = Number(h[1]); continue; }
    if (line.startsWith("-")) { cur.removed.push({ line: oldLine, text: line.slice(1) }); oldLine++; continue; }
    if (line.startsWith("+")) { cur.added.push(line.slice(1)); continue; }
  }
  return files.filter((f) => f.file && !f.created);
}

/**
 * Cœur pur : lignes supprimées, écrites par une PR récente, et pas ré-ajoutées
 * ailleurs dans le même commit. Groupé par PR.
 * - `blameOf(file, lines)` → sha de l'auteur de chaque ligne (même ordre) ;
 * - `prOf(sha)` → { number, title } si ce sha est une PR protégée, sinon null.
 */
export function findOverwrites(files, { blameOf, prOf, minLines = 3, ignored = IGNORED_PATHS }) {
  const addedAnywhere = new Set(files.flatMap((f) => f.added.map(norm)).filter(Boolean));
  const byPr = new Map();
  for (const f of files) {
    if (ignored.includes(f.file)) continue;
    const kept = f.removed.filter((r) => meaningful(r.text) && !addedAnywhere.has(norm(r.text)));
    if (!kept.length) continue;
    const shas = blameOf(f.file, kept.map((r) => r.line));
    kept.forEach((r, i) => {
      const pr = shas[i] ? prOf(shas[i]) : null;
      if (!pr) return;
      const entry = byPr.get(pr.number) || { ...pr, lines: 0, files: new Map() };
      entry.lines++;
      const samples = entry.files.get(f.file) || [];
      if (samples.length < 4) samples.push(norm(r.text).slice(0, 140));
      entry.files.set(f.file, samples);
      byPr.set(pr.number, entry);
    });
  }
  return [...byPr.values()]
    .filter((e) => e.lines >= minLines)
    .map((e) => ({ ...e, files: [...e.files.entries()].map(([file, samples]) => ({ file, samples })) }))
    .sort((a, b) => b.lines - a.lines);
}

/** Rapport lisible (issue GitHub). */
export function formatReport(commit, findings) {
  const total = findings.reduce((n, f) => n + f.lines, 0);
  const out = [
    `**${total} ligne(s)** écrite(s) par des corrections récentes ont été **supprimées** par le commit \`${commit.sha.slice(0, 8)}\` — « ${commit.subject} » (${commit.author}).`,
    "",
    "Ce n'est pas forcément une erreur (une modification faite dans Lovable peut être voulue), mais c'est exactement la forme que prend une fusion Lovable qui annule une correction déjà mergée. **À vérifier :**",
    "",
  ];
  for (const f of findings) {
    out.push(`### #${f.number} — ${f.title} (${f.lines} ligne(s))`);
    for (const { file, samples } of f.files) {
      out.push(`- \`${file}\``);
      for (const s of samples) out.push(`  - \`${s.replace(/`/g, "'")}\``);
    }
    out.push("");
  }
  out.push(
    "**Comment trancher** : si la suppression n'était pas voulue, rétablir le code de la PR (ré-appliquer son diff sur `main`), puis fermer cette alerte. Si elle était voulue, fermer simplement l'alerte.",
    "",
    "_Garde anti-écrasement — `scripts/garde-ecrasement.mjs`._",
  );
  return out.join("\n");
}

// ── Partie git (non testée unitairement : rejouée sur l'historique réel) ──

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

function commitInfo(sha) {
  const [s, subject, author, ct] = git(["log", "-1", "--format=%H%x00%s%x00%an%x00%ct", sha]).trim().split("\0");
  return { sha: s, subject, author, time: Number(ct) };
}

/** Commits de la plage, sur la ligne principale (premier parent), du plus ancien au plus récent. */
function commitsOf(range) {
  const out = git(["rev-list", "--first-parent", "--reverse", range]).trim();
  return out ? out.split("\n") : [];
}

function blameLines(base, file, lines) {
  const shaByLine = new Map();
  // Plages contiguës pour limiter les appels.
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    try {
      const out = git(["blame", "--porcelain", "-L", `${sorted[i]},${sorted[j]}`, base, "--", file]);
      for (const l of out.split("\n")) {
        const m = /^([0-9a-f]{40}) \d+ (\d+)/.exec(l);
        if (m) shaByLine.set(Number(m[2]), m[1]);
      }
    } catch { /* fichier introuvable dans la base : ignoré */ }
    i = j + 1;
  }
  return lines.map((n) => shaByLine.get(n) || null);
}

export function analyzeCommit(sha, { days = 30, minLines = 3 } = {}) {
  const commit = commitInfo(sha);
  if (prNumberOf(commit.subject) || isReviewedMerge(commit.subject)) return { commit, skipped: "pr", findings: [] };
  const parents = git(["rev-list", "--parents", "-n", "1", sha]).trim().split(" ").slice(1);
  if (!parents.length) return { commit, skipped: "root", findings: [] };
  const parent = parents[0];
  // Version de travail de Lovable : 2e parent d'une fusion, sinon le parent lui-même.
  const lovableSide = parents[1] || parents[0];
  const sawPr = (prSha) => {
    try { execFileSync("git", ["merge-base", "--is-ancestor", prSha, lovableSide]); return true; } catch { return false; }
  };
  const diff = git(["diff", "-U0", "--no-color", "--no-renames", "--no-ext-diff", parent, sha]);
  const files = parseUnifiedDiff(diff);
  const cache = new Map();
  const prOf = (blamed) => {
    if (cache.has(blamed)) return cache.get(blamed);
    let res = null;
    try {
      const info = commitInfo(blamed);
      const number = prNumberOf(info.subject);
      if (number && commit.time - info.time <= days * 86400) res = { number, sha: blamed, title: info.subject.replace(/\s*\(#\d+\)\s*$/, "") };
    } catch { /* sha inconnu */ }
    cache.set(blamed, res);
    return res;
  };
  const findings = findOverwrites(files, { blameOf: (file, lines) => blameLines(parent, file, lines), prOf, minLines })
    .map((f) => ({ ...f, severity: severityOf(sawPr(f.sha)) }));
  return { commit, findings };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function main() {
  const days = Number(arg("--days", "30"));
  const minLines = Number(arg("--min", "3"));
  const backtest = arg("--backtest", null);
  const range = arg("--range", null);
  const reportPath = arg("--report", null);
  let shas;
  if (backtest) {
    const since = `${Number(backtest)} days ago`;
    const out = git(["rev-list", "--first-parent", "--reverse", `--since=${since}`, "HEAD"]).trim();
    shas = out ? out.split("\n") : [];
  } else if (range) {
    const [from] = range.split("..");
    if (/^0+$/.test(from)) { console.log("Nouvelle branche : rien à comparer."); return; }
    shas = commitsOf(range);
  } else {
    console.error("Usage : --range <avant>..<après> | --backtest <jours>");
    process.exit(64);
  }
  const alerts = [];
  const mentions = [];
  let analyzed = 0;
  for (const sha of shas) {
    const res = analyzeCommit(sha, { days, minLines });
    if (res.skipped) continue;
    analyzed++;
    const over = res.findings.filter((f) => f.severity === "overwrite");
    const edits = res.findings.filter((f) => f.severity === "edit");
    if (over.length) alerts.push({ ...res, findings: over });
    if (edits.length) mentions.push({ ...res, findings: edits });
  }
  console.log(`🛡️ Garde anti-écrasement : ${analyzed} commit(s) hors PR analysé(s), ${alerts.length} écrasement(s), ${mentions.length} modification(s) de PR faite(s) dans Lovable.`);
  for (const [label, list] of [["🔴 ÉCRASEMENT", alerts], ["🟡 modifiée dans Lovable", mentions]]) {
    for (const a of list) {
      console.log(`\n${label} — ${a.commit.sha.slice(0, 8)} « ${a.commit.subject} » (${a.commit.author}) :`);
      for (const f of a.findings) console.log(`   #${f.number} ${f.title} — ${f.lines} ligne(s) supprimée(s) : ${f.files.map((x) => x.file).join(", ")}`);
    }
  }
  if (reportPath && alerts.length) {
    writeFileSync(reportPath, alerts.map((a) => formatReport(a.commit, a.findings)).join("\n\n---\n\n"));
    // Titre de l'alerte : le commit FAUTIF, pas la tête de main au moment du lancement.
    const first = alerts[0].commit;
    writeFileSync(`${reportPath}.title`, `${first.sha.slice(0, 8)} « ${first.subject.slice(0, 60)} »`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
