// Frontière entre fonctions de TEXTE et fonctions de DESIGN (lot 9,
// 14/10/2026 ; voir docs/creation-contenu/CARTE.md, section 6). Même esprit
// que creative-flow/boundaries_test.ts.
//
// Les fonctions de design (mise en forme des carrousels, épingle visuelle
// Pinterest, image d'une slide, studio visuel) ne doivent pas embarquer la
// chaîne d'écriture des textes : sinon une retouche « pour LinkedIn » dans
// redac-gate ou correction-pass change aussi, sans qu'on le voie, la mise en
// forme d'un carrousel ou une épingle.
//
// Ce test suit les imports (directs ET indirects, `import(...)` compris) de
// chaque fichier d'une fonction de design, et échoue si un module d'écriture
// est atteint :
//   1. directement : jamais permis ;
//   2. par un intermédiaire : permis seulement si cet intermédiaire est dans
//      LIENS_INDIRECTS_AUTORISES, avec sa raison.
// La liste blanche est elle-même vérifiée : une exception qui ne sert plus
// (lien supprimé, ou qui ne mène plus à l'écriture) fait échouer le test,
// pour qu'elle soit retirée.
//
// Un test rouge ici : passe par un module neutre (déplace la fonction utile
// hors du module d'écriture), ou ajoute l'exception justifiée ci-dessous.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTIONS_DIR = new URL("../", import.meta.url);
const SHARED_DIR = new URL("./", import.meta.url);

/** Fonctions de design surveillées. */
const FONCTIONS_DESIGN = ["carousel-visual", "pinterest-visual", "carousel-slide-image", "visual-studio"];

/** Modules d'écriture des textes (dans `_shared/`). */
const MODULES_ECRITURE = ["redac-gate", "correction-pass", "carousel-model", "format-briefs", "copywriting-prompts"];

/**
 * Liens indirects voulus : fonction de design → module `_shared` qu'elle
 * importe directement et qui, lui, mène à l'écriture. On ne descend pas
 * derrière ces modules.
 */
const LIENS_INDIRECTS_AUTORISES: Record<string, Record<string, string>> = {
  "pinterest-visual": {
    "audience-address-pass":
      "l'épingle visuelle écrit aussi du texte (titre, description) : elle passe le contrôle tu / vous, " +
      "qui réécrit les phrases fautives avec correction-pass (→ carousel-model, reel-postprocess → redac-gate)",
  },
};

function localImports(src: string): string[] {
  const out: string[] = [];
  // from "./x.ts", import("./x.ts") et import "./x.ts" (import sans nom).
  const re = /(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|^\s*import\s*['"](\.[^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) {
    out.push(m[1] || m[2] || m[3]);
  }
  return out;
}

const sharedModule = (href: string): string | null =>
  href.startsWith(SHARED_DIR.href) && href.endsWith(".ts") ? href.slice(SHARED_DIR.href.length, -3) : null;

const shortName = (href: string) => href.slice(FUNCTIONS_DIR.href.length);

async function readOrNull(href: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(new URL(href));
  } catch {
    return null;
  }
}

/** Fichiers d'entrée d'une fonction : ses .ts hors tests. */
async function entryFiles(fn: string): Promise<string[]> {
  const dir = new URL(`${fn}/`, FUNCTIONS_DIR);
  const out: string[] = [];
  for await (const e of Deno.readDir(dir)) {
    if (e.isFile && e.name.endsWith(".ts") && !e.name.endsWith("_test.ts")) out.push(new URL(e.name, dir).href);
  }
  return out.sort();
}

/**
 * Parcours des imports depuis `starts`. Ne descend pas derrière les modules
 * de `stopAt`. Renvoie, pour chaque fichier atteint, le fichier qui l'a importé.
 */
async function walk(starts: string[], stopAt: Set<string> = new Set()): Promise<Map<string, string | null>> {
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const s of starts) {
    parent.set(s, null);
    queue.push(s);
  }
  while (queue.length) {
    const file = queue.shift()!;
    const mod = sharedModule(file);
    if (mod && stopAt.has(mod)) continue;
    const src = await readOrNull(file);
    if (src === null) continue;
    for (const spec of localImports(src)) {
      const target = new URL(spec, file).href;
      if (parent.has(target)) continue;
      parent.set(target, file);
      queue.push(target);
    }
  }
  return parent;
}

function chain(parent: Map<string, string | null>, end: string): string {
  const out: string[] = [];
  for (let f: string | null | undefined = end; f; f = parent.get(f)) out.unshift(shortName(f));
  return out.join(" → ");
}

const reachedWriting = (parent: Map<string, string | null>) =>
  [...parent.keys()].filter((f) => MODULES_ECRITURE.includes(sharedModule(f) ?? ""));

Deno.test("frontière texte / design — les modules d'écriture existent toujours", async () => {
  for (const mod of MODULES_ECRITURE) {
    assert(await readOrNull(new URL(`${mod}.ts`, SHARED_DIR).href) !== null, `_shared/${mod}.ts introuvable : mets à jour MODULES_ECRITURE.`);
  }
});

for (const fn of FONCTIONS_DESIGN) {
  Deno.test(`frontière texte / design — ${fn} n'importe pas directement un module d'écriture`, async () => {
    const entries = await entryFiles(fn);
    assert(entries.length > 0, `${fn}/ ne contient aucun fichier .ts`);
    for (const file of entries) {
      for (const spec of localImports((await readOrNull(file))!)) {
        const mod = sharedModule(new URL(spec, file).href);
        assert(
          !mod || !MODULES_ECRITURE.includes(mod),
          `${shortName(file)} importe _shared/${mod}.ts, un module d'écriture des textes. ` +
            `Une fonction de design ne doit pas dépendre de la chaîne de rédaction : déplace ce dont elle a besoin dans un module neutre.`,
        );
      }
    }
  });

  Deno.test(`frontière texte / design — ${fn} n'atteint l'écriture que par les liens autorisés`, async () => {
    const autorises = new Set(Object.keys(LIENS_INDIRECTS_AUTORISES[fn] ?? {}));
    const parent = await walk(await entryFiles(fn), autorises);
    const fautifs = reachedWriting(parent).map((f) => chain(parent, f));
    assert(
      fautifs.length === 0,
      `${fn} atteint un module d'écriture des textes par un lien non déclaré :\n  ${fautifs.join("\n  ")}\n` +
        `Coupe ce lien, ou ajoute l'intermédiaire voulu dans LIENS_INDIRECTS_AUTORISES avec sa raison.`,
    );
  });
}

for (const [fn, liens] of Object.entries(LIENS_INDIRECTS_AUTORISES)) {
  for (const [mod, raison] of Object.entries(liens)) {
    Deno.test(`frontière texte / design — l'exception ${fn} → ${mod} sert encore`, async () => {
      assert(FONCTIONS_DESIGN.includes(fn), `${fn} n'est pas dans FONCTIONS_DESIGN.`);
      assert(raison.trim().length > 20, `L'exception ${fn} → ${mod} doit dire pourquoi elle existe.`);
      const gateway = new URL(`${mod}.ts`, SHARED_DIR).href;
      const entries = await entryFiles(fn);
      let direct = false;
      for (const file of entries) {
        if (localImports((await readOrNull(file))!).some((spec) => new URL(spec, file).href === gateway)) direct = true;
      }
      assert(direct, `${fn} n'importe plus _shared/${mod}.ts : retire cette exception de LIENS_INDIRECTS_AUTORISES.`);
      const derriere = reachedWriting(await walk([gateway]));
      assert(
        derriere.length > 0,
        `_shared/${mod}.ts ne mène plus à aucun module d'écriture : retire cette exception de LIENS_INDIRECTS_AUTORISES.`,
      );
    });
  }
}
