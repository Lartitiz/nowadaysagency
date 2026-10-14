#!/usr/bin/env node
// Garde-fou « suppression de fichiers » (14/10/2026).
//
// Les fichiers du storage (photos, visuels, documents des clientes) ne sont PAS
// dans les sauvegardes quotidiennes de Lovable Cloud : restaurer la base ne les
// ramène pas (réponse de Lovable du 14/10/2026). Un code qui les efface par
// erreur = perte définitive.
//
// Ce script liste chaque endroit du code qui efface physiquement des fichiers
// (storage `.remove(`, `emptyBucket`, `deleteBucket`, `DELETE FROM storage.objects`)
// et fait échouer la CI si un endroit n'est pas dans la liste validée
// (scripts/garde-suppression-fichiers.json, avec la raison).
//
// Que faire si la CI échoue ici :
//   1. De préférence, NE PAS effacer : retirer logiquement (comme la
//      bibliothèque photo, `set_photo_library_visibility`) ;
//   2. Sinon, si l'effacement est voulu (fichier temporaire de CETTE tentative,
//      suppression demandée par l'utilisatrice, suppression de compte), ajouter
//      l'entrée au JSON avec sa raison, dans la même PR.
//
// Périmètre : src/, supabase/functions/ (hors tests), supabase/migrations/.
// Un endroit = fichier + nombre d'occurrences (pas de numéro de ligne, pour ne
// pas casser à chaque modification voisine).

import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LISTE = path.join(RACINE, "scripts/garde-suppression-fichiers.json");

const MOTIFS_CODE = [
  /storage\s*\.\s*from\([^)]*\)\s*\.\s*remove\s*\(/g,
  /\bstorage\s*\.\s*remove\s*\(/g,
  /\.\s*emptyBucket\s*\(/g,
  /\.\s*deleteBucket\s*\(/g,
];
const MOTIFS_SQL = [/delete\s+from\s+storage\.objects/gi, /storage\.delete_object/gi];

const estTest = (f) => /(_test\.ts|\.test\.tsx?|\.spec\.tsx?)$/.test(f) || f.includes(`${path.sep}test${path.sep}`);

function parcourir(dossier, exts, out = []) {
  if (!fs.existsSync(dossier)) return out;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") parcourir(p, exts, out);
    } else if (exts.some((x) => e.name.endsWith(x)) && !estTest(p)) out.push(p);
  }
  return out;
}

export function compter(texte, motifs) {
  // Les commentaires de code ne comptent pas (ex. la doc de ce garde-fou).
  const sansCommentaires = texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
  return motifs.reduce((n, m) => n + (sansCommentaires.match(m) || []).length, 0);
}

export function inventaire(racine = RACINE) {
  const trouve = {};
  const code = [
    ...parcourir(path.join(racine, "src"), [".ts", ".tsx"]),
    ...parcourir(path.join(racine, "supabase/functions"), [".ts"]),
  ];
  for (const f of code) {
    const n = compter(fs.readFileSync(f, "utf8"), MOTIFS_CODE);
    if (n) trouve[path.relative(racine, f)] = n;
  }
  for (const f of parcourir(path.join(racine, "supabase/migrations"), [".sql"])) {
    const n = compter(fs.readFileSync(f, "utf8"), MOTIFS_SQL);
    if (n) trouve[path.relative(racine, f)] = n;
  }
  return trouve;
}

export function comparer(trouve, valide) {
  const problemes = [];
  for (const [f, n] of Object.entries(trouve)) {
    const v = valide[f];
    if (!v) problemes.push(`  • ${f} : ${n} effacement(s) de fichiers NON validé(s)`);
    else if (n > v.occurrences) problemes.push(`  • ${f} : ${n} effacements au lieu de ${v.occurrences} validé(s)`);
  }
  return problemes;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const valide = JSON.parse(fs.readFileSync(LISTE, "utf8")).valides;
  const problemes = comparer(inventaire(), valide);
  if (!problemes.length) {
    console.log("✅ Garde suppression de fichiers : aucun nouvel effacement de fichiers.");
    process.exit(0);
  }
  console.log(`🔴 Garde suppression de fichiers : du code efface des fichiers du storage sans validation.

${problemes.join("\n")}

Pourquoi : les photos et fichiers des clientes ne sont PAS dans les sauvegardes
de Lovable Cloud — un effacement par erreur est définitif.

Que faire :
  1. De préférence, retirer logiquement au lieu d'effacer (modèle : bibliothèque
     photo, set_photo_library_visibility).
  2. Si l'effacement est voulu (fichier temporaire de CETTE tentative,
     suppression demandée par l'utilisatrice, suppression de compte), ajouter
     le fichier dans scripts/garde-suppression-fichiers.json avec sa raison.`);
  process.exit(1);
}
