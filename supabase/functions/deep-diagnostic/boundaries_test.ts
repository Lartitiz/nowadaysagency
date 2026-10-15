// Frontières à l'intérieur de deep-diagnostic (fiche 12 de
// docs/robustesse/gros-fichiers.md, posé au lot 1 du découpage d'index.ts ;
// même esprit que carousel-ai/boundaries_test.ts).
//
// Ce test garde le rangement :
//   1. aucun fichier n'importe index.ts (dépendance circulaire) ;
//   2. routes.ts, tool.ts, fallback.ts et prompts.ts n'importent aucun autre
//      fichier du dossier (morceaux sans état) ; evidence.ts n'importe que routes.ts ;
//   3. seuls fast-diagnostic.ts (logUsage) et index.ts (checkQuota) importent
//      _shared/plan-limiter.ts ;
//   4. seul fast-diagnostic.ts importe _shared/anthropic.ts (tool.ts a le
//      droit au type AnthropicTool, en `import type`).

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DIR = new URL("./", import.meta.url);
const INDEX = new URL("index.ts", DIR).href;
const PLAN_LIMITER = new URL("../_shared/plan-limiter.ts", DIR).href;
const ANTHROPIC = new URL("../_shared/anthropic.ts", DIR).href;

/** Fichiers de test et harnais de test : hors règles (ils importent index.ts exprès). */
const HORS_REGLES = new Set(["contract_harness.ts"]);

function localImports(src: string): { spec: string; typeOnly: boolean }[] {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of src.matchAll(/(import\s+type\s|import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    out.push({ spec: m[2] || m[3], typeOnly: (m[1] ?? "").startsWith("import type") });
  }
  return out;
}

const files: string[] = [];
for await (const e of Deno.readDir(DIR)) {
  if (e.isFile && e.name.endsWith(".ts") && !e.name.endsWith("_test.ts") && !HORS_REGLES.has(e.name)) files.push(e.name);
}
files.sort();

const importsOf = async (file: string) => {
  const url = new URL(file, DIR);
  return localImports(await Deno.readTextFile(url)).map(({ spec, typeOnly }) => ({ href: new URL(spec, url).href, typeOnly }));
};
const nom = (href: string) => href.startsWith(DIR.href) ? href.slice(DIR.href.length) : href;

Deno.test("frontières deep-diagnostic — les fichiers sortis d'index.ts sont bien trouvés", () => {
  for (const f of ["routes.ts", "tool.ts", "parse.ts", "evidence.ts", "fallback.ts", "prompts.ts", "fast-diagnostic.ts", "sources.ts"]) {
    assert(files.includes(f), `fichiers trouvés : ${files.join(", ")}`);
  }
});

for (const file of files.filter((f) => f !== "index.ts")) {
  Deno.test(`frontières deep-diagnostic — ${file} n'importe pas index.ts`, async () => {
    for (const { href } of await importsOf(file)) {
      assert(href !== INDEX, `${file} importe index.ts : dépendance circulaire.`);
    }
  });
}

const AUTORISES_DANS_LE_DOSSIER: Record<string, string[]> = {
  "routes.ts": [], "tool.ts": [], "fallback.ts": [], "prompts.ts": [], "evidence.ts": ["routes.ts"],
};
for (const [file, autorises] of Object.entries(AUTORISES_DANS_LE_DOSSIER)) {
  if (!files.includes(file)) continue;
  Deno.test(`frontières deep-diagnostic — ${file} n'importe ${autorises.length ? autorises.join(", ") + " seulement" : "aucun fichier du dossier"}`, async () => {
    for (const { href } of await importsOf(file)) {
      if (!href.startsWith(DIR.href)) continue;
      assert(autorises.includes(nom(href)), `${file} importe ${nom(href)} : ce morceau doit rester sans dépendance locale.`);
    }
  });
}

for (const file of files) {
  Deno.test(`frontières deep-diagnostic — ${file} : plan-limiter et anthropic aux bons endroits`, async () => {
    for (const { href, typeOnly } of await importsOf(file)) {
      if (href === PLAN_LIMITER) {
        assert(["index.ts", "fast-diagnostic.ts"].includes(file), `${file} importe plan-limiter.ts : quota et crédits restent dans index.ts (checkQuota) et fast-diagnostic.ts (logUsage).`);
      }
      if (href === ANTHROPIC) {
        assert(file === "fast-diagnostic.ts" || (file === "tool.ts" && typeOnly),
          `${file} importe anthropic.ts : seul l'appel du diagnostic parle à Claude.`);
      }
    }
  });
}
