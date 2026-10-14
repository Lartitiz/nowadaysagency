#!/usr/bin/env node
// Rayon d'impact des modules partagés des edge functions.
//
// Pour chaque fichier de supabase/functions/_shared, liste les edge functions
// qui l'importent, directement OU en passant par un autre module partagé
// (ex. linkedin-ai → redac-gate → carousel-editorial-review). C'est la
// donnée de la section « Rayon d'impact » de docs/creation-contenu/CARTE.md,
// et la base du rapport de CI scripts/impact-creation.mjs.
//
// Usage :
//   node scripts/carte-impact.mjs                 → tous les modules partagés
//   node scripts/carte-impact.mjs redac-gate      → un ou plusieurs modules
//
// Lecture seule : ne modifie rien, ne dépend d'aucun paquet.

import fs from "node:fs";
import path from "node:path";

const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Map « nom du module partagé (sans .ts) » → Set des edge functions qui l'atteignent. */
export function sharedUsage(root = "supabase/functions") {
  const cache = new Map();
  function transitiveDeps(file) {
    if (cache.has(file)) return cache.get(file);
    const deps = new Set();
    cache.set(file, deps);
    let src;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      return deps;
    }
    for (const m of src.matchAll(IMPORT_RE)) {
      const target = path.normalize(path.join(path.dirname(file), m[1] || m[2]));
      if (!target.endsWith(".ts")) continue;
      deps.add(target);
      for (const d of transitiveDeps(target)) deps.add(d);
    }
    return deps;
  }

  const functions = fs
    .readdirSync(root)
    .filter((d) => !d.startsWith("_") && fs.existsSync(path.join(root, d, "index.ts")));

  const usedBy = new Map();
  for (const fn of functions) {
    for (const dep of transitiveDeps(path.join(root, fn, "index.ts"))) {
      const rel = path.relative(path.join(root, "_shared"), dep);
      if (rel.startsWith("..")) continue;
      const name = rel.replace(/\.ts$/, "");
      if (!usedBy.has(name)) usedBy.set(name, new Set());
      usedBy.get(name).add(fn);
    }
  }
  return usedBy;
}

function main() {
  const usedBy = sharedUsage();
  const wanted = process.argv.slice(2);
  const rows = [...usedBy.entries()]
    .filter(([name]) => wanted.length === 0 || wanted.includes(name))
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

  for (const [name, fns] of rows) {
    console.log(`${name} (${fns.size}) : ${[...fns].sort().join(", ")}`);
  }
  for (const name of wanted) {
    if (!usedBy.has(name)) console.log(`${name} : aucune edge function ne l'importe`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
