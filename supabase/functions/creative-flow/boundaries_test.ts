// Frontières entre les formats de creative-flow (lot 4 « robustesse création
// de contenu », 13/10/2026 ; voir docs/creation-contenu/CARTE.md).
//
// Le lot 3 a rangé chaque format dans son fichier (formats/*.ts) pour qu'une
// modification de LinkedIn ne puisse pas toucher les stories. Ce test garde
// ce rangement :
//   1. un format n'importe PAS le fichier d'un autre format (sauf les
//      exceptions listées dans IMPORTS_AUTORISES, à justifier) ;
//   2. ni un format ni shared.ts n'importe index.ts (dépendance circulaire) ;
//   3. shared.ts n'importe aucun format (il est commun à tous) ;
//   4. chaque fichier de formats/ est décrit dans CARTE.md.
//
// Un test rouge ici : déplace le code partagé dans shared.ts plutôt que
// d'importer un format depuis un autre, ou ajoute l'exception avec sa raison.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DIR = new URL("./", import.meta.url);
const FORMATS_DIR = new URL("./formats/", import.meta.url);

/** Exceptions voulues : format → formats qu'il a le droit d'importer, et pourquoi. */
const IMPORTS_AUTORISES: Record<string, Record<string, string>> = {
  "recycle.ts": {
    "stories.ts": "le recyclage finit les stories recyclées avec la même chaîne que les stories (finalizeRecycledStories)",
    "carousel.ts": "le recyclage en carrousel applique le contrôle tu / vous du carrousel",
  },
};

function localImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    out.push(m[1] || m[2]);
  }
  return out;
}

const formatFiles: string[] = [];
for await (const e of Deno.readDir(FORMATS_DIR)) {
  if (e.isFile && e.name.endsWith(".ts") && !e.name.endsWith("_test.ts")) formatFiles.push(e.name);
}
formatFiles.sort();

Deno.test("frontières — il y a bien des fichiers de format", () => {
  assert(formatFiles.length >= 5, `formats/ ne contient que ${formatFiles.join(", ")}`);
});

for (const file of formatFiles) {
  Deno.test(`frontières — formats/${file} n'importe ni index.ts ni un autre format non autorisé`, async () => {
    const src = await Deno.readTextFile(new URL(file, FORMATS_DIR));
    for (const spec of localImports(src)) {
      const target = new URL(spec, new URL(file, FORMATS_DIR)).href;
      assert(target !== new URL("index.ts", DIR).href, `formats/${file} importe index.ts : dépendance circulaire. Passe ce dont il a besoin dans shared.ts.`);
      if (!target.startsWith(FORMATS_DIR.href)) continue;
      const other = target.slice(FORMATS_DIR.href.length);
      if (other === file) continue;
      assert(
        IMPORTS_AUTORISES[file]?.[other],
        `formats/${file} importe formats/${other} : un format ne doit pas dépendre d'un autre. ` +
          `Déplace le code commun dans shared.ts, ou ajoute l'exception justifiée dans IMPORTS_AUTORISES.`,
      );
    }
  });
}

Deno.test("frontières — shared.ts n'importe ni index.ts ni aucun format", async () => {
  const src = await Deno.readTextFile(new URL("shared.ts", DIR));
  for (const spec of localImports(src)) {
    const target = new URL(spec, new URL("shared.ts", DIR)).href;
    assert(target !== new URL("index.ts", DIR).href, "shared.ts importe index.ts : dépendance circulaire.");
    assert(!target.startsWith(FORMATS_DIR.href), `shared.ts importe ${spec} : le commun ne doit dépendre d'aucun format.`);
  }
});

Deno.test("frontières — chaque fichier de formats/ est décrit dans CARTE.md", async () => {
  const carte = await Deno.readTextFile(new URL("../../../docs/creation-contenu/CARTE.md", import.meta.url));
  for (const file of formatFiles) {
    assert(carte.includes(`formats/${file}`), `formats/${file} n'apparaît pas dans docs/creation-contenu/CARTE.md : ajoute-le au tableau « Organisation des fichiers ».`);
  }
});
