// Frontières à l'intérieur de carousel-ai (fiche 2 de
// docs/robustesse/gros-fichiers.md, posé au lot 1 du découpage d'index.ts ;
// même esprit que creative-flow/boundaries_test.ts).
//
// index.ts est découpé en fichiers : shared.ts (_deps, budgets de temps,
// outils communs), tools.ts (formats de sortie imposés à l'IA), puis, aux lots
// suivants, prompts.ts, outline.ts, steps/* (étapes communes à plusieurs
// parcours) et modes/* (un parcours : texte, mixte, photo). Ce test garde ce
// rangement :
//   1. aucun fichier n'importe index.ts (dépendance circulaire) ;
//   2. shared.ts et tools.ts n'importent ni mode ni étape (ils sont communs) ;
//   3. un fichier de modes/ n'importe pas un autre mode : le code commun à
//      deux parcours va dans steps/ ou shared.ts ;
//   4. chaque fichier sorti d'index.ts est décrit dans CARTE.md.
//
// Un test rouge ici : déplace le code partagé dans shared.ts ou steps/ plutôt
// que d'importer index.ts ou un autre mode.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DIR = new URL("./", import.meta.url);
const INDEX = new URL("index.ts", DIR).href;
const MODES = new URL("modes/", DIR).href;
const STEPS = new URL("steps/", DIR).href;

/** Modules locaux qui existaient avant le découpage (déjà décrits dans CARTE.md par leur nom). */
const MODULES_AVANT_DECOUPAGE = new Set([
  "confirmed-structure.ts", "continuous-narrative.ts", "final-photo-match.ts", "layout.ts", "photo-narrative.ts",
  "stock-ambient.ts", "structure-hedge.ts", "thread-local-repair.ts", "variant-writing.ts", "writer.ts", "writing-contract.ts",
]);

function localImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    out.push(m[1] || m[2]);
  }
  return out;
}

async function walk(dir: URL, prefix: string, out: string[]) {
  for await (const e of Deno.readDir(dir)) {
    if (e.isDirectory && e.name !== "__snapshots__") await walk(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`, out);
    else if (e.isFile && e.name.endsWith(".ts") && !e.name.endsWith("_test.ts")) out.push(`${prefix}${e.name}`);
  }
}
const files: string[] = [];
await walk(DIR, "", files);
files.sort();

const importsOf = async (file: string) => {
  const url = new URL(file, DIR);
  return localImports(await Deno.readTextFile(url)).map((spec) => new URL(spec, url).href);
};

Deno.test("frontières carousel-ai — les fichiers sortis d'index.ts sont bien trouvés", () => {
  for (const f of ["shared.ts", "tools.ts"]) assert(files.includes(f), `fichiers trouvés : ${files.join(", ")}`);
});

for (const file of files.filter((f) => f !== "index.ts")) {
  Deno.test(`frontières carousel-ai — ${file} n'importe pas index.ts`, async () => {
    for (const target of await importsOf(file)) {
      assert(target !== INDEX, `${file} importe index.ts : dépendance circulaire. Passe ce dont il a besoin dans shared.ts.`);
    }
  });
}

for (const file of ["shared.ts", "tools.ts"]) {
  Deno.test(`frontières carousel-ai — ${file} n'importe ni mode ni étape`, async () => {
    for (const target of await importsOf(file)) {
      assert(!target.startsWith(MODES) && !target.startsWith(STEPS), `${file} importe ${target.slice(DIR.href.length)} : le commun ne dépend d'aucun parcours.`);
    }
  });
}

for (const file of files.filter((f) => f.startsWith("modes/"))) {
  Deno.test(`frontières carousel-ai — ${file} n'importe pas un autre mode`, async () => {
    for (const target of await importsOf(file)) {
      if (!target.startsWith(MODES)) continue;
      assert(target === new URL(file, DIR).href, `${file} importe ${target.slice(DIR.href.length)} : un parcours ne dépend pas d'un autre. Mets le code commun dans steps/ ou shared.ts.`);
    }
  });
}

Deno.test("frontières carousel-ai — chaque fichier sorti d'index.ts est décrit dans CARTE.md", async () => {
  const carte = await Deno.readTextFile(new URL("../../../docs/creation-contenu/CARTE.md", import.meta.url));
  for (const file of files) {
    if (file === "index.ts" || MODULES_AVANT_DECOUPAGE.has(file)) continue;
    assert(carte.includes(`carousel-ai/${file}`), `carousel-ai/${file} n'apparaît pas dans docs/creation-contenu/CARTE.md : ajoute-le au tableau des fichiers de carousel-ai.`);
  }
});
