// Frontière DESIGN / ÉCRITURE des carrousels (lot 8 « séparation écriture /
// design », 14/10/2026 ; voir docs/creation-contenu/CARTE.md, section 6).
//
// carousel-ai écrit le texte, carousel-visual le met en forme. Ce test garde
// les deux côtés séparés, en lisant les imports :
//   1. un module de DESIGN n'importe aucun module d'ÉCRITURE, sauf les
//      exceptions de IMPORTS_AUTORISES (chacune justifiée) ;
//   2. les modules NEUTRES (infrastructure) n'importent ni l'un ni l'autre :
//      sinon ils ouvriraient un passage caché entre les deux ;
//   3. les modules d'écriture atteints par carousel-visual, même indirectement,
//      sont exactement ceux qu'ouvrent les exceptions (un nouveau chemin
//      caché fait échouer le test) ;
//   4. dans carousel-ai, seul layout.ts importe des modules de design (plus
//      les exceptions de CARROUSEL_AI_AUTORISES) ;
//   5. tout module partagé atteint par carousel-ai ou carousel-visual est
//      rangé dans une des trois listes ci-dessous.
//
// Un test rouge ici : passe par layout.ts (côté carousel-ai), déplace le code
// commun dans un module neutre, ou ajoute l'exception avec sa raison.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTIONS = new URL("../", import.meta.url);

/** Mise en forme : composition HTML, gabarits, schémas, disposition, couleurs, tailles. */
const DESIGN = new Set([
  "carousel-design-plan", "carousel-sense-design", "contrast-guard", "font-size-guard", "format-render",
  "invented-text-guard", "mix-layout-formatting", "mix-schema-render", "mix-slide-layouts",
  "photo-art-direction", "photo-editorial", "photo-format-types", "photo-formatting", "photo-overlay-templates",
  "photo-template-assign", "photo-visual-guards", "pptx-invariants", "recraft-illustration",
  "schema-formatting", "schema-limit", "schema-telemetry", "verbatim-guard",
]);

/** Écriture : consignes, rédaction, relectures, juges du fil, mesures du texte. */
const WRITING = new Set([
  "angle-families", "audience-address", "audience-address-pass", "base-prompts", "carousel-cover",
  "carousel-draft-stream", "carousel-editorial-contract", "carousel-editorial-review", "carousel-editorial-snapshot",
  "carousel-length", "carousel-model", "carousel-plan-format", "carousel-progression", "carousel-thread",
  "content-clarity", "content-quality", "copywriting-prompts", "correction-pass", "depth-research", "editorial-voice",
  "lived-case", "previous-hooks", "recent-briefs", "recent-passages", "redac-gate", "reel-postprocess",
  "series-context", "socle", "text-structure-guard", "user-context",
]);

/** Neutres : infrastructure commune (appels IA, quota, sécurité, JSON, images, structure du récit). */
const NEUTRAL = new Set([
  "anthropic", "anthropic-stream", "auth", "cors", "guard-demo", "image-utils", "input-validators",
  "parse-ai-json", "photo-slide-structure", "plan-limiter", "rate-limiter", "request-pipeline", "scraping",
  "workspace-guard",
]);

/**
 * Exceptions voulues : fichier de design → modules d'écriture qu'il a le droit
 * d'importer, et pourquoi. Les clés sans « / » sont des modules de _shared.
 */
const IMPORTS_AUTORISES: Record<string, Record<string, string>> = {
  "schema-formatting": {
    "carousel-editorial-snapshot": "poser un schéma périme le reçu de relecture du fil : progressionMaterial est une projection pure du texte (aucune règle d'écriture, aucun appel IA)",
  },
  "photo-template-assign": {
    "carousel-editorial-snapshot": "poser un gabarit périme le reçu de relecture du fil : même projection pure que pour les schémas",
  },
  "schema-limit": {
    "carousel-editorial-review": "carouselEditorialFields liste les champs texte d'une slide : le plafond des schémas lit cette liste pour ne jamais toucher au texte",
  },
  "carousel-sense-design": {
    socle: "TEXT_SENSE_RULES est la règle commune « le design montre l'idée » du socle, réexportée à texte égal",
  },
  "carousel-visual/index.ts": {
    "carousel-editorial-contract": "COMPOSE est le contrat de l'étape de composition ; il vit avec les autres étapes du contrat éditorial (STAGES) dont il partage la version",
    socle: "LISIBLE_TAILLE_CORPS et LISIBLE_TAILLES_TITRES : tailles de lecture fixées par le socle commun, appliquées au rendu",
  },
};

/** Fichiers de carousel-ai (hors layout.ts) qui importent un module de design, et pourquoi. */
const CARROUSEL_AI_AUTORISES: Record<string, Record<string, string>> = {
  // Vide depuis le lot 8b (14/10/2026) : le mot de couverture du récit continu
  // (cover_accent) est validé dans layout.ts.
};

const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** Chemin relatif à supabase/functions/ des imports locaux d'un fichier. */
async function localImports(rel: string): Promise<string[]> {
  const file = new URL(rel, FUNCTIONS);
  const src = await Deno.readTextFile(file);
  const out: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const target = new URL(m[1] || m[2], file).href;
    if (target.endsWith(".ts")) out.push(target.slice(FUNCTIONS.href.length));
  }
  return out;
}

/**
 * Nom de module de _shared (sans .ts), ou null pour un autre fichier. Un
 * sous-module (`_shared/correction-pass/prompts.ts`, découpage des gros
 * fichiers) prend le rang de son module d'origine (`correction-pass`).
 */
const sharedName = (rel: string): string | null => rel.startsWith("_shared/") ? rel.slice(8, -3).split("/")[0] : null;

async function reachable(entry: string): Promise<Set<string>> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.shift()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const dep of await localImports(rel)) queue.push(dep);
  }
  return seen;
}

const CAROUSEL_AI = (await reachable("carousel-ai/index.ts"));
const CAROUSEL_VISUAL = (await reachable("carousel-visual/index.ts"));

Deno.test("frontière design / écriture — chaque module partagé du carrousel est rangé", () => {
  for (const rel of [...CAROUSEL_AI, ...CAROUSEL_VISUAL]) {
    const name = sharedName(rel);
    if (!name) continue;
    assert(DESIGN.has(name) || WRITING.has(name) || NEUTRAL.has(name),
      `_shared/${name}.ts n'est rangé nulle part : ajoute-le à DESIGN, WRITING ou NEUTRAL dans ce fichier.`);
  }
  for (const name of DESIGN) assert(!WRITING.has(name) && !NEUTRAL.has(name), `${name} est rangé deux fois`);
  for (const name of WRITING) assert(!NEUTRAL.has(name), `${name} est rangé deux fois`);
});

for (const name of [...DESIGN].sort()) {
  Deno.test(`frontière design / écriture — _shared/${name}.ts n'importe pas l'écriture`, async () => {
    for (const dep of await localImports(`_shared/${name}.ts`)) {
      const target = sharedName(dep);
      assert(!dep.startsWith("carousel-ai/"), `_shared/${name}.ts importe ${dep} : un module de design ne dépend pas de la rédaction.`);
      if (!target || !WRITING.has(target)) continue;
      assert(IMPORTS_AUTORISES[name]?.[target],
        `_shared/${name}.ts importe _shared/${target}.ts (écriture). Déplace ce dont il a besoin dans un module neutre, ` +
          `ou ajoute l'exception justifiée dans IMPORTS_AUTORISES.`);
    }
  });
}

Deno.test("frontière design / écriture — carousel-visual/index.ts n'importe l'écriture que par les exceptions", async () => {
  for (const dep of await localImports("carousel-visual/index.ts")) {
    const target = sharedName(dep);
    assert(!dep.startsWith("carousel-ai/"), `carousel-visual importe ${dep}`);
    if (target && WRITING.has(target)) {
      assert(IMPORTS_AUTORISES["carousel-visual/index.ts"]?.[target], `carousel-visual/index.ts importe _shared/${target}.ts (écriture) sans exception déclarée.`);
    }
  }
});

Deno.test("frontière design / écriture — les modules neutres n'importent ni design ni écriture", async () => {
  for (const name of NEUTRAL) {
    for (const dep of await localImports(`_shared/${name}.ts`)) {
      const target = sharedName(dep);
      assert(!target || NEUTRAL.has(target), `_shared/${name}.ts (neutre) importe _shared/${target}.ts : passage caché entre design et écriture.`);
    }
  }
});

Deno.test("frontière design / écriture — l'écriture atteinte par carousel-visual = celle des exceptions", async () => {
  // Fermeture des modules d'écriture ouverts par les exceptions.
  const opened = new Set<string>();
  for (const targets of Object.values(IMPORTS_AUTORISES)) {
    for (const t of Object.keys(targets)) for (const rel of await reachable(`_shared/${t}.ts`)) opened.add(rel);
  }
  const writingReached = [...new Set([...CAROUSEL_VISUAL].map(sharedName))].filter((n): n is string => !!n && WRITING.has(n)).sort();
  const writingOpened = [...opened].map(sharedName).filter((n): n is string => !!n && WRITING.has(n));
  for (const name of writingReached) {
    assert(writingOpened.includes(name), `carousel-visual atteint _shared/${name}.ts (écriture) par un chemin non déclaré.`);
  }
  // Repère lisible : la liste attendue aujourd'hui.
  assertEquals(writingReached, ["angle-families", "carousel-editorial-contract", "carousel-editorial-review", "carousel-editorial-snapshot", "socle"]);
});

/** Fichiers de carousel-ai hors tests, sous-dossiers compris (steps/, modes/ depuis le découpage d'index.ts, fiche 2). */
async function carouselAiFiles(dir = "", out: string[] = []): Promise<string[]> {
  for await (const e of Deno.readDir(new URL(`carousel-ai/${dir}`, FUNCTIONS))) {
    if (e.isDirectory && e.name !== "__snapshots__") await carouselAiFiles(`${dir}${e.name}/`, out);
    else if (e.isFile && e.name.endsWith(".ts") && !e.name.endsWith("_test.ts")) out.push(`${dir}${e.name}`);
  }
  return out.sort();
}

Deno.test("frontière design / écriture — dans carousel-ai, seul layout.ts importe le design", async () => {
  const files = await carouselAiFiles();
  assert(files.includes("index.ts") && files.some((f) => f.includes("/")), `fichiers trouvés : ${files.join(", ")}`);
  for (const file of files) {
    if (file === "layout.ts") continue;
    for (const dep of await localImports(`carousel-ai/${file}`)) {
      const target = sharedName(dep);
      if (!target || !DESIGN.has(target)) continue;
      assert(CARROUSEL_AI_AUTORISES[file]?.[target],
        `carousel-ai/${file} importe _shared/${target}.ts (design). Passe par carousel-ai/layout.ts, ` +
          `ou ajoute l'exception justifiée dans CARROUSEL_AI_AUTORISES.`);
    }
    // normalizeOverlayStyles (style des overlays) vit dans un module neutre de structure : il passe aussi par layout.ts.
    const src = await Deno.readTextFile(new URL(`carousel-ai/${file}`, FUNCTIONS));
    assert(!/import \{[^}]*\bnormalizeOverlayStyles\b[^}]*\} from "(?:\.\.\/)+_shared\//.test(src), `carousel-ai/${file} importe normalizeOverlayStyles en direct : passe par layout.ts.`);
  }
});

Deno.test("frontière design / écriture — layout.ts n'importe aucun module de rédaction", async () => {
  for (const dep of await localImports("carousel-ai/layout.ts")) {
    const target = sharedName(dep);
    assert(target && (DESIGN.has(target) || NEUTRAL.has(target)), `carousel-ai/layout.ts importe ${dep} : la mise en forme ne dépend pas de l'écriture.`);
  }
});
