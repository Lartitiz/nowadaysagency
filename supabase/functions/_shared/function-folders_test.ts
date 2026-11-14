// deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/function-folders_test.ts
//
// Une fonction ne peut importer que son propre dossier et _shared.
// Le déploiement (Lovable) n'embarque que ces deux-là : un import vers le dossier
// d'une AUTRE fonction passe les tests, la CI et `poids-edges`, puis bloque le
// déploiement. Vu le 14/11/2026 : content-coaching importait
// creative-flow/free-steps-cap.ts et carousel-ai/questions-address.ts (#1981),
// refusé par Lovable au redéploiement. Code commun → _shared.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join, normalize, relative, SEPARATOR } from "https://deno.land/std@0.224.0/path/mod.ts";

const FUNCTIONS_DIR = normalize(join(dirname(fromFileUrl(import.meta.url)), ".."));
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

function* tsFiles(dir: string): Generator<string> {
  for (const entry of Deno.readDirSync(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) yield* tsFiles(path);
    else if (/\.(ts|tsx|js)$/.test(entry.name) && !/_test\.ts$/.test(entry.name)) yield path;
  }
}

Deno.test("aucune fonction n'importe le dossier d'une autre fonction (seulement le sien et _shared)", () => {
  const offenders: string[] = [];
  for (const entry of Deno.readDirSync(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name === "_shared" || entry.name.startsWith(".")) continue;
    const own = join(FUNCTIONS_DIR, entry.name);
    for (const file of tsFiles(own)) {
      const text = Deno.readTextFileSync(file);
      for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[1] || m[2];
        const target = normalize(join(dirname(file), spec));
        const top = relative(FUNCTIONS_DIR, target).split(SEPARATOR)[0];
        if (top !== entry.name && top !== "_shared") offenders.push(`${relative(FUNCTIONS_DIR, file)} → ${spec}`);
      }
    }
  }
  assertEquals(offenders, [], "Déplacer le code commun dans _shared : le déploiement n'embarque que le dossier de la fonction et _shared.");
});
