#!/usr/bin/env node
// Classement des fichiers par risque de régression (docs/robustesse/gros-fichiers.md).
//
// Score = (lignes / 100) × (1 + commits / 10) × (1 + corrections / 10)
//   - lignes      : taille actuelle (`wc -l`) ;
//   - commits     : commits qui ont touché le fichier depuis --depuis (90 jours par défaut) ;
//   - corrections : parmi eux, ceux dont le message contient fix, corrige, corrigé,
//                   régression ou revert.
// Un gros fichier qu'on ne touche jamais pèse peu ; un gros fichier modifié et
// corrigé sans arrêt monte en tête.
//
// Limite : les commits Lovable s'appellent tous « Changes ». Ils comptent dans
// « commits », jamais dans « corrections ».
//
// Usage :
//   git fetch --unshallow origin main   # si le clone est peu profond (chiffres faux sinon)
//   node scripts/gros-fichiers.mjs [--depuis 2026-07-16] [--top 40]
//
// Lecture seule. Ne dépend d'aucun paquet.

import { execFileSync } from "node:child_process";
import { mesurer } from "./cliquet-dette.mjs";

const CORRECTION = /\bfix|corrig|r[ée]gression|revert/i;

export function score({ lignes, commits, corrections }) {
  return Math.round((lignes / 100) * (1 + commits / 10) * (1 + corrections / 10));
}

/** Compte commits et corrections par fichier à partir de `git log --format=@@%s --name-only`. */
export function compterCommits(sortieGitLog) {
  const commits = {};
  const corrections = {};
  for (const bloc of sortieGitLog.split("@@").slice(1)) {
    const [sujet, ...fichiers] = bloc.split("\n");
    const estCorrection = CORRECTION.test(sujet);
    for (const f of new Set(fichiers.filter(Boolean))) {
      commits[f] = (commits[f] ?? 0) + 1;
      if (estCorrection) corrections[f] = (corrections[f] ?? 0) + 1;
    }
  }
  return { commits, corrections };
}

function main() {
  const args = process.argv.slice(2);
  const val = (nom, defaut) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : defaut);
  const depuis = val("--depuis", new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10));
  const top = Number(val("--top", "40"));

  if (execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() === "true") {
    console.error("⚠️  Clone peu profond : lance d'abord `git fetch --unshallow origin main`.");
  }
  const log = execFileSync(
    "git",
    ["log", `--since=${depuis}`, "--no-merges", "--format=@@%s", "--name-only", "--", "src", "supabase/functions"],
    { encoding: "utf8", maxBuffer: 1 << 30 },
  );
  const { commits, corrections } = compterCommits(log);
  const lignes = Object.entries(mesurer(".")).map(([f, m]) => ({
    fichier: f,
    lignes: m.lignes,
    commits: commits[f] ?? 0,
    corrections: corrections[f] ?? 0,
  }));
  for (const l of lignes) l.score = score(l);
  lignes.sort((a, b) => b.score - a.score || b.lignes - a.lignes);

  console.log(`Depuis le ${depuis}\n`);
  console.log("| # | Fichier | Lignes | Commits | Corrections | Score |");
  console.log("|---|---|---:|---:|---:|---:|");
  lignes.slice(0, top).forEach((l, i) => {
    console.log(`| ${i + 1} | \`${l.fichier}\` | ${l.lignes} | ${l.commits} | ${l.corrections} | ${l.score} |`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
