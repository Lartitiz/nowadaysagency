#!/usr/bin/env node
// Cliquet anti-dette (lot G1, 14/10/2026).
//
// Les régressions viennent surtout des gros fichiers « fourre-tout »
// (docs/robustesse/gros-fichiers.md). Ce script gèle leur taille : comme un
// cliquet, ça peut descendre, pas monter.
//
// La CI échoue si :
//   - un fichier de la référence grossit (plus de lignes qu'enregistré) ;
//   - un fichier de la référence gagne des `as any` / `: any` ;
//   - un fichier hors référence dépasse SEUIL lignes.
//
// Référence : scripts/cliquet-dette.baseline.json (lignes au sens de `wc -l`
// et nombre de `as any` / `: any`, pour chaque fichier de plus de SEUIL lignes).
// Périmètre : src/ et supabase/functions/, hors tests, snapshots et
// src/integrations/supabase/types.ts (généré).
//
// Usage :
//   node scripts/cliquet-dette.mjs                            → vérifie (CI)
//   node scripts/cliquet-dette.mjs --update                   → fait BAISSER la référence
//                                                               (fichiers qui ont maigri)
//   node scripts/cliquet-dette.mjs --update --accepter-hausse → accepte aussi une hausse
//                                                               (seulement si c'est voulu)
//
// Lecture seule sans --update. Ne dépend d'aucun paquet.

import fs from "node:fs";
import path from "node:path";

export const SEUIL = 800;
export const RACINES = ["src", "supabase/functions"];
export const FICHIER_REFERENCE = "scripts/cliquet-dette.baseline.json";
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;

const CMD = "node scripts/cliquet-dette.mjs";
const CMD_BAISSE = `${CMD} --update`;
const CMD_HAUSSE = `${CMD} --update --accepter-hausse`;

/** Fichiers hors périmètre : tests, snapshots, types générés par Supabase. */
export function estExclu(fichier) {
  const f = fichier.split(path.sep).join("/");
  return (
    /(^|\/)__snapshots__\//.test(f) ||
    /\.snap$/.test(f) ||
    /_test\.(ts|tsx|js|mjs)$/.test(f) ||
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(f) ||
    /^src\/test\//.test(f) ||
    f === "src/integrations/supabase/types.ts"
  );
}

/** Nombre de lignes, comme `wc -l` (nombre de retours à la ligne). */
export function compterLignes(texte) {
  let n = 0;
  for (let i = 0; i < texte.length; i++) if (texte.charCodeAt(i) === 10) n++;
  return n;
}

/** Nombre de `as any` et de `: any` (y compris `: any[]`, pas `: anything`). */
export function compterAny(texte) {
  const asAny = texte.match(/\bas\s+any\b/g)?.length ?? 0;
  const deuxPoints = texte.match(/:\s*any\b/g)?.length ?? 0;
  return asAny + deuxPoints;
}

function lister(dossier, racine, sortie) {
  let entrees;
  try {
    entrees = fs.readdirSync(path.join(racine, dossier), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = `${dossier}/${e.name}`;
    if (e.isDirectory()) lister(rel, racine, sortie);
    else if (EXTENSIONS.test(e.name) && !estExclu(rel)) sortie.push(rel);
  }
}

/** Mesure tous les fichiers du périmètre : { "chemin": { lignes, any } }. */
export function mesurer(racine = ".", racines = RACINES) {
  const fichiers = [];
  for (const r of racines) lister(r, racine, fichiers);
  const mesures = {};
  for (const f of fichiers.sort()) {
    const texte = fs.readFileSync(path.join(racine, f), "utf8");
    mesures[f] = { lignes: compterLignes(texte), any: compterAny(texte) };
  }
  return mesures;
}

/**
 * Compare l'état actuel à la référence.
 * - erreurs   : ce qui fait échouer la CI ;
 * - baisses   : fichiers qui ont maigri (la référence peut descendre) ;
 * - disparus  : fichiers de la référence qui n'existent plus.
 */
export function comparer(reference, mesures, seuil = reference.seuil ?? SEUIL) {
  const ref = reference.fichiers ?? {};
  const erreurs = [];
  const baisses = [];
  const disparus = [];

  for (const [f, avant] of Object.entries(ref)) {
    const maintenant = mesures[f];
    if (!maintenant) {
      disparus.push(f);
      continue;
    }
    if (maintenant.lignes > avant.lignes) {
      erreurs.push({ type: "grossit", fichier: f, avant: avant.lignes, apres: maintenant.lignes });
    }
    if (maintenant.any > avant.any) {
      erreurs.push({ type: "any", fichier: f, avant: avant.any, apres: maintenant.any });
    }
    if (maintenant.lignes < avant.lignes || maintenant.any < avant.any) {
      baisses.push({ fichier: f, avant, apres: maintenant });
    }
  }

  for (const [f, m] of Object.entries(mesures)) {
    if (!ref[f] && m.lignes > seuil) {
      erreurs.push({ type: "nouveau", fichier: f, apres: m.lignes });
    }
  }

  return { erreurs, baisses, disparus };
}

/**
 * Nouvelle référence.
 * Sans accepterHausse : chaque valeur ne peut que BAISSER (une hausse garde
 * l'ancienne valeur et reste en erreur), aucun nouveau fichier n'entre.
 * Avec accepterHausse : la référence reprend l'état actuel des fichiers de
 * plus de `seuil` lignes.
 * Dans les deux cas, un fichier disparu ou repassé sous le seuil sort.
 */
export function nouvelleReference(reference, mesures, { accepterHausse = false } = {}) {
  const seuil = reference.seuil ?? SEUIL;
  const ref = reference.fichiers ?? {};
  const fichiers = {};
  const candidats = accepterHausse
    ? Object.keys(mesures).filter((f) => mesures[f].lignes > seuil)
    : Object.keys(ref).filter((f) => mesures[f] && mesures[f].lignes > seuil);
  for (const f of candidats.sort()) {
    const m = mesures[f];
    fichiers[f] =
      accepterHausse || !ref[f]
        ? { lignes: m.lignes, any: m.any }
        : { lignes: Math.min(m.lignes, ref[f].lignes), any: Math.min(m.any, ref[f].any) };
  }
  return { seuil, fichiers };
}

/** Message en français, pour la CI et pour le terminal. */
export function formaterRapport({ erreurs, baisses, disparus }, seuil = SEUIL) {
  const l = [];
  if (erreurs.length) {
    l.push("❌ Cliquet anti-dette : des gros fichiers ont grossi.");
    l.push("");
    for (const e of erreurs) {
      if (e.type === "grossit") {
        l.push(`  • ${e.fichier} : ${e.avant} → ${e.apres} lignes (+${e.apres - e.avant})`);
      } else if (e.type === "any") {
        l.push(`  • ${e.fichier} : ${e.avant} → ${e.apres} « any » (+${e.apres - e.avant}, typage perdu)`);
      } else {
        l.push(`  • ${e.fichier} : nouveau fichier de ${e.apres} lignes (seuil : ${seuil})`);
      }
    }
    l.push("");
    l.push("Pourquoi : les régressions viennent surtout de ces fichiers « fourre-tout ».");
    l.push("Leur taille est gelée (docs/robustesse/gros-fichiers.md).");
    l.push("");
    l.push("Que faire :");
    l.push("  1. De préférence, découper : mettre le code ajouté dans un fichier à part");
    l.push("     (un fichier = une mission), importé par le gros fichier.");
    l.push("     Pour un « any » : typer la valeur au lieu d'écrire « as any » / « : any ».");
    l.push("  2. Seulement si la hausse est voulue (ou si le fichier a juste été renommé");
    l.push("     ou déplacé), mettre la référence à jour et la committer avec le code :");
    l.push(`       ${CMD_HAUSSE}`);
    l.push("     La hausse se verra dans le diff de scripts/cliquet-dette.baseline.json.");
  }
  if (baisses.length || disparus.length) {
    if (l.length) l.push("");
    l.push("🎉 Des gros fichiers ont maigri : on peut verrouiller le gain.");
    for (const b of baisses) {
      l.push(`  • ${b.fichier} : ${b.avant.lignes} → ${b.apres.lignes} lignes, ${b.avant.any} → ${b.apres.any} « any »`);
    }
    for (const f of disparus) l.push(`  • ${f} : n'existe plus`);
    l.push(`Pour faire baisser la référence : ${CMD_BAISSE}`);
  }
  if (!l.length) l.push("✅ Cliquet anti-dette : aucun gros fichier n'a grossi.");
  return l.join("\n");
}

function lireReference(racine) {
  const chemin = path.join(racine, FICHIER_REFERENCE);
  if (!fs.existsSync(chemin)) return { seuil: SEUIL, fichiers: {} };
  return JSON.parse(fs.readFileSync(chemin, "utf8"));
}

function ecrireReference(racine, reference) {
  const chemin = path.join(racine, FICHIER_REFERENCE);
  fs.writeFileSync(chemin, JSON.stringify(reference, null, 2) + "\n");
}

function main() {
  const args = process.argv.slice(2);
  const racine = process.cwd();
  const reference = lireReference(racine);
  const mesures = mesurer(racine);
  const seuil = reference.seuil ?? SEUIL;

  if (args.includes("--update")) {
    const accepterHausse = args.includes("--accepter-hausse");
    const nouvelle = nouvelleReference(reference, mesures, { accepterHausse });
    ecrireReference(racine, nouvelle);
    const n = Object.keys(nouvelle.fichiers).length;
    console.log(`Référence mise à jour (${n} fichiers de plus de ${seuil} lignes) : ${FICHIER_REFERENCE}`);
    const reste = comparer(nouvelle, mesures);
    if (reste.erreurs.length) {
      console.log("");
      console.log(formaterRapport({ ...reste, baisses: [], disparus: [] }, seuil));
      process.exit(1);
    }
    return;
  }

  const resultat = comparer(reference, mesures);
  const rapport = formaterRapport(resultat, seuil);
  console.log(rapport);
  // En CI, le message s'affiche aussi dans le résumé du lancement.
  if (resultat.erreurs.length && process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Cliquet anti-dette\n\n```\n" + rapport + "\n```\n");
  }
  if (resultat.erreurs.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
