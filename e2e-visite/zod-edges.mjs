// Version de zod importée par les edge functions (ajouté le 26/10/2026).
//
// Angle mort vu en PR #1813 : `bun audit` ne lit que bun.lock, donc le front.
// Les edges (Deno) importent zod par URL (`https://deno.land/x/zod@v3.22.4/mod.ts`),
// invisible pour l'audit. GHSA-mrhx-c7xc-m3w5 (épuisement mémoire sur gros
// tableaux en échec) touche zod < 4.6.6, et les edges valident des corps de
// requête côté serveur.
//
// Ligne ⚠️ chaque semaine tant qu'une version < 4.6.6 reste importée (risque
// connu et accepté le 26/10 : corps lu APRÈS l'auth, un manque de mémoire ne
// tue que la requête). Le verdict ne passe à WARN que si ça EMPIRE vs la
// référence (plus de fichiers vulnérables, ou une nouvelle version vulnérable),
// même discipline que le reste de code-health : pas de sonde qui crie chaque lundi.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const SEUIL = "4.6.6";

// deno.land/x/zod@v3.22.4, npm:zod@^4.6.7, esm.sh/zod@3.23.8, jsr:@zod/zod@4.1.0
const MOTIFS = [
  /deno\.land\/x\/zod@v?([0-9][^/"'\s]*)/g,
  /npm:zod@([~^]?[0-9][^/"'\s]*)/g,
  /esm\.sh\/zod@([~^]?[0-9][^/"'?\s]*)/g,
  /jsr:@zod\/zod@([~^]?[0-9][^/"'\s]*)/g,
];
// Import non épinglé (« npm:zod », « esm.sh/zod ») : version inconnue.
const SANS_VERSION = /(?:npm:zod|esm\.sh\/zod|jsr:@zod\/zod)(?=["'/?\s])/g;

export function extraireVersions(contenu) {
  const versions = new Set();
  for (const motif of MOTIFS) for (const m of contenu.matchAll(motif)) versions.add(m[1].replace(/^[~^]/, ""));
  if (contenu.match(SANS_VERSION)) versions.add("non épinglée");
  return [...versions];
}

/** -1, 0 ou 1. Ignore un suffixe de préversion (« 4.6.6-beta » compte comme 4.6.6). */
export function comparer(a, b) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

export function estVulnerable(version) {
  return version === "non épinglée" || comparer(version, SEUIL) < 0;
}

/** fichiers : [{ fichier, contenu }] → { parVersion: { "3.22.4": [fichiers] }, fichiersVulnerables } */
export function analyser(fichiers) {
  const parVersion = {};
  const vulnerables = new Set();
  for (const { fichier, contenu } of fichiers) {
    for (const v of extraireVersions(contenu)) {
      (parVersion[v] ||= []).push(fichier);
      if (estVulnerable(v)) vulnerables.add(fichier);
    }
  }
  return { parVersion, fichiersVulnerables: vulnerables.size };
}

function lister(dossier, acc) {
  for (const nom of readdirSync(dossier)) {
    if (nom === "node_modules" || nom.startsWith(".")) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) lister(chemin, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(nom) || nom === "deno.json" || nom === "deno.jsonc" || nom === "import_map.json") acc.push(chemin);
  }
  return acc;
}

export function lireDepot(root = process.cwd()) {
  const base = join(root, "supabase", "functions");
  if (!existsSync(base)) throw new Error("supabase/functions introuvable");
  const fichiers = lister(base, []).map((chemin) => ({ fichier: relative(base, chemin), contenu: readFileSync(chemin, "utf8") }));
  // Carte d'imports à la racine (un « zod » déclaré là s'applique à toutes les edges).
  for (const nom of ["deno.json", "deno.jsonc", "import_map.json"]) {
    const chemin = join(root, nom);
    if (existsSync(chemin)) fichiers.push({ fichier: nom, contenu: readFileSync(chemin, "utf8") });
  }
  return fichiers;
}

/** precedent = { fichiersVulnerables, versionsVulnerables } de la référence, ou undefined. */
export function rapport(res, precedent) {
  const lignes = ["🧬 zod dans les edge functions (hors bun audit)"];
  const versions = Object.keys(res.parVersion).sort((a, b) => (a === "non épinglée" ? -1 : b === "non épinglée" ? 1 : comparer(a, b)));
  const versionsVulnerables = versions.filter(estVulnerable);
  const resume = versions.map((v) => `${v} (${res.parVersion[v].length} fichier${res.parVersion[v].length > 1 ? "s" : ""})`).join(", ");
  if (!versions.length) {
    lignes.push("   aucun import de zod trouvé dans supabase/functions");
  } else if (!versionsVulnerables.length) {
    lignes.push(`   ✅ ${resume} — toutes ≥ ${SEUIL}`);
  } else {
    lignes.push(`   ⚠️ ${res.fichiersVulnerables} fichier(s) sur zod < ${SEUIL} (GHSA-mrhx-c7xc-m3w5, épuisement mémoire) : ${resume}`);
  }

  let empire = false;
  if (versionsVulnerables.length) {
    if (!precedent) {
      lignes.push("   (1re mesure — sert de référence)");
    } else {
      const nouvelles = versionsVulnerables.filter((v) => !(precedent.versionsVulnerables || []).includes(v));
      const delta = res.fichiersVulnerables - (precedent.fichiersVulnerables ?? 0);
      if (delta > 0 || nouvelles.length) {
        empire = true;
        lignes.push(`   🔴 NOUVEAU vs dernière mesure : ${delta > 0 ? `+${delta} fichier(s) vulnérable(s) ` : ""}${nouvelles.length ? `nouvelle(s) version(s) : ${nouvelles.join(", ")}` : ""}`.trimEnd());
      } else if (delta < 0) {
        lignes.push(`   ✅ amélioration vs dernière mesure (${delta} fichier(s))`);
      } else {
        lignes.push("   = connu et accepté le 26/10/2026 (corps lu après l'auth), inchangé — pas de vignette");
      }
    }
  }
  return {
    lignes,
    verdict: empire ? "WARN" : "OK",
    mesure: { fichiersVulnerables: res.fichiersVulnerables, versionsVulnerables },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const { lignes, verdict } = rapport(analyser(lireDepot()));
    console.log(lignes.join("\n"));
    console.log(`\nVERDICT: ${verdict}`);
  } catch (e) {
    console.log(`🧬 zod des edges — lecture impossible (${e.message})\n\nVERDICT: INCOMPLET`);
  }
  process.exit(0);
}
