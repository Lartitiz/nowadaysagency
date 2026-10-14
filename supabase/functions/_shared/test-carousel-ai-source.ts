// Outil de test UNIQUEMENT — jamais importé par du code de prod.
//
// Quelques tests lisent le TEXTE de carousel-ai pour vérifier un câblage
// (ordre de deux appels, champs d'un outil, signature d'un prompt). Avant le
// découpage de carousel-ai/index.ts (fiche 2 de docs/robustesse/gros-fichiers.md,
// lot 0b), ils lisaient index.ts seul et cassaient dès qu'on déplaçait le code.
// Ils lisent maintenant tout le code de carousel-ai, sous-dossiers compris,
// hors tests et hors layout.ts (la mise en forme, lue à part par ces tests).

const CAROUSEL_AI = new URL("../carousel-ai/", import.meta.url);

function walk(dir: URL, out: string[]) {
  const entries = [...Deno.readDirSync(dir)].sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.isDirectory) {
      if (e.name !== "__snapshots__") walk(new URL(`${e.name}/`, dir), out);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith("_test.ts")) {
      const rel = new URL(e.name, dir).href.slice(CAROUSEL_AI.href.length);
      if (rel !== "layout.ts") out.push(rel);
    }
  }
}

/** Fichiers lus (chemins relatifs à carousel-ai/), index.ts en premier. */
export function carouselAiSourceFiles(): string[] {
  const out: string[] = [];
  walk(CAROUSEL_AI, out);
  return out.sort((a, b) => (a === "index.ts" ? -1 : b === "index.ts" ? 1 : a.localeCompare(b)));
}

/** Code de carousel-ai mis bout à bout (hors tests et hors layout.ts). */
export function carouselAiSource(): string {
  return carouselAiSourceFiles().map((f) => Deno.readTextFileSync(new URL(f, CAROUSEL_AI))).join("\n");
}
