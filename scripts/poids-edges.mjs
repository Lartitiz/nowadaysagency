#!/usr/bin/env node
// Garde « poids des edge functions » (15/10/2026).
//
// Au déploiement, Lovable envoie pour chaque fonction TOUT son dossier + TOUT
// supabase/functions/_shared/ (tests et fichiers non importés compris) et
// refuse au-delà d'environ 4,5 Mo. Le 15/10, creative-flow (7,0 Mo) et
// carousel-ai (6,6 Mo) ont été refusées : les snapshots de tests (.snap, jusqu'à
// 2,1 Mo pièce) étaient rangés à côté du code. Ils vivent maintenant dans
// supabase/edge-tests/snapshots/ (voir supabase/edge-tests/snapshot.ts).
//
// Mesure = dossier de la fonction + _shared/, octet par octet : elle retombe
// exactement sur les chiffres affichés par Lovable (7,03 et 6,64 Mo).
// Échoue au-dessus de 4 Mo (marge sous la limite), prévient au-dessus de 3,5 Mo.
//
//   node scripts/poids-edges.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FUNCTIONS = path.join(ROOT, "supabase/functions");
const LIMIT = 4_000_000;
const WARN = 3_500_000;
const mb = (n) => `${(n / 1e6).toFixed(2)} Mo`;

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.isFile()) out.push({ file: path.relative(FUNCTIONS, p), size: fs.statSync(p).size });
  }
  return out;
}

const shared = listFiles(path.join(FUNCTIONS, "_shared"));
const sharedSize = shared.reduce((s, f) => s + f.size, 0);
const functions = fs
  .readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
  .filter((e) => fs.existsSync(path.join(FUNCTIONS, e.name, "index.ts")))
  .map((e) => {
    const files = [...listFiles(path.join(FUNCTIONS, e.name)), ...shared];
    return { name: e.name, files, size: files.reduce((s, f) => s + f.size, 0) };
  })
  .sort((a, b) => b.size - a.size);

console.log(`Poids envoyé à Lovable par edge function (dossier + _shared ${mb(sharedSize)}) ; plafond garde ${mb(LIMIT)}`);
for (const f of functions.slice(0, 5)) console.log(`  ${mb(f.size).padStart(9)}  ${f.name}`);

const tooBig = functions.filter((f) => f.size > LIMIT);
for (const f of functions.filter((f) => f.size > WARN && f.size <= LIMIT)) {
  console.log(`::warning::${f.name} pèse ${mb(f.size)} (plus de ${mb(WARN)}) : proche du refus Lovable.`);
}
if (tooBig.length) {
  for (const f of tooBig) {
    console.log(`\n✗ ${f.name} : ${mb(f.size)} > ${mb(LIMIT)}. Plus gros fichiers :`);
    for (const x of [...f.files].sort((a, b) => b.size - a.size).slice(0, 10)) {
      console.log(`    ${mb(x.size).padStart(9)}  ${x.file}`);
    }
  }
  console.log(
    "\nLovable refusera de déployer ces fonctions (limite ≈ 4,5 Mo, _shared compte en entier)." +
      "\nRanger les snapshots dans supabase/edge-tests/snapshots/ (helper supabase/edge-tests/snapshot.ts)," +
      "\nsortir les données de test/fixtures hors de supabase/functions/, ou alléger _shared/.",
  );
  process.exit(1);
}
console.log("✓ toutes les edge functions sont sous le plafond.");
