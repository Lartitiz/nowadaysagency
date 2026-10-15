import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Fiche 17 de docs/robustesse/gros-fichiers.md (lot 3) : un fichier de corps
   de src/features/creer/generator/bodies/ n'importe jamais celui d'un autre
   format (même règle que creative-flow/boundaries_test.ts côté serveur). Seul
   context.ts (le type partagé) est autorisé. */

const DIR = join(__dirname, "../features/creer/generator/bodies");
const FORMATS = readdirSync(DIR).filter((f) => f.endsWith(".ts") && f !== "context.ts");

describe("frontières des corps de demande", () => {
  it("trouve les 5 formats", () => {
    expect(FORMATS.sort()).toEqual(["carousel.ts", "linkedin.ts", "post.ts", "reel.ts", "story.ts"]);
  });
  for (const file of FORMATS) {
    it(`${file} n'importe aucun autre format`, () => {
      const src = readFileSync(join(DIR, file), "utf8");
      const locaux = [...src.matchAll(/from\s+["'](?:@\/features\/creer\/generator\/bodies\/|\.\/)([\w-]+)["']/g)].map((m) => m[1]);
      expect(locaux.filter((m) => m !== "context")).toEqual([]);
    });
  }
});
