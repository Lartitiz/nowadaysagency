// Frontières entre les briefs de _shared/format-briefs/ (découpage de
// format-briefs.ts, lot 1 du 14/10/2026 ; voir docs/robustesse/gros-fichiers.md,
// fiche 10). Même principe que creative-flow/boundaries_test.ts :
//   1. un brief n'importe aucun autre brief, sauf common.ts ;
//   2. aucun brief n'importe le sommaire ../format-briefs.ts (dépendance circulaire) ;
//   3. common.ts n'importe aucun brief ;
//   4. aucun brief n'importe position.ts : la prise de position est transverse,
//      c'est buildGeneratePrompt (creative-flow) qui l'ajoute ;
//   5. chaque brief est réexporté par le sommaire.
//
// Un test rouge ici : déplace le code partagé dans common.ts plutôt que
// d'importer un brief depuis un autre.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DIR = new URL("./", import.meta.url);
const SOMMAIRE = new URL("../format-briefs.ts", import.meta.url);

function localImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    out.push(m[1] || m[2]);
  }
  return out;
}

const briefFiles: string[] = [];
for await (const e of Deno.readDir(DIR)) {
  if (e.isFile && e.name.endsWith(".ts") && !e.name.endsWith("_test.ts")) briefFiles.push(e.name);
}
briefFiles.sort();

Deno.test("format-briefs/ — il y a bien des fichiers de brief", () => {
  assert(briefFiles.includes("common.ts"), "common.ts manque");
  assert(briefFiles.length >= 3, `format-briefs/ ne contient que ${briefFiles.join(", ")}`);
});

for (const file of briefFiles) {
  Deno.test(`format-briefs/${file} n'importe ni le sommaire ni un autre brief (sauf common.ts)`, async () => {
    const src = await Deno.readTextFile(new URL(file, DIR));
    for (const spec of localImports(src)) {
      const target = new URL(spec, new URL(file, DIR)).href;
      assert(target !== SOMMAIRE.href, `format-briefs/${file} importe format-briefs.ts : dépendance circulaire.`);
      if (!target.startsWith(DIR.href)) continue;
      const other = target.slice(DIR.href.length);
      if (other === file) continue;
      assert(file !== "common.ts", `common.ts importe ${other} : le commun ne doit dépendre d'aucun brief.`);
      assert(other !== "position.ts", `format-briefs/${file} importe position.ts : la prise de position est ajoutée par buildGeneratePrompt, pas par un brief.`);
      assert(other === "common.ts", `format-briefs/${file} importe format-briefs/${other} : un brief ne doit pas dépendre d'un autre. Déplace le code commun dans common.ts.`);
    }
  });
}

Deno.test("format-briefs/ — chaque brief est réexporté par le sommaire (common.ts excepté)", async () => {
  const sommaire = await Deno.readTextFile(SOMMAIRE);
  for (const file of briefFiles) {
    if (file === "common.ts") continue;
    assert(sommaire.includes(`export * from "./format-briefs/${file}";`), `format-briefs.ts ne réexporte pas format-briefs/${file}`);
  }
});
