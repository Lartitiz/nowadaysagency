// Garde-fou « numérotation » (régression « 1, 2, 3 » perdus) : aucune consigne
// de rédaction ou de correction du dépôt ne doit demander à l'IA de SUPPRIMER
// ou RETIRER la numérotation d'un contenu (cause de la régression : l'ancien
// circuit carrousel de creative-flow, et une ancienne version de
// correction-pass). Une procédure numérotée voulue par l'utilisatrice doit
// survivre à toutes les passes. Ce test balaie le code des edges, leurs
// snapshots de prompts et le front.
//
// Lancer : deno test --allow-read supabase/functions/_shared/numbering-guard_test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ROOTS = [
  new URL("../", import.meta.url), // supabase/functions/
  new URL("../../../src/", import.meta.url), // front (prompts éventuels côté client)
];
const SELF = new URL(import.meta.url).pathname;
// « Supprimer/Supprime/supprimez (toute) la numérotation », « retirer les numéros »,
// « enlève la numérotation »… (insensible à la casse et aux accents fréquents).
const FORBIDDEN = /\b(?:supprim|retir|enl[eè]v|[ée]limin)\w*\s+(?:toute\s+|toutes\s+)?(?:la\s+|les\s+|leur\s+|leurs\s+)?num[ée]ro(?:tation|s)\b/i;

async function* walk(dir: URL): AsyncGenerator<URL> {
  let entries: Deno.DirEntry[] = [];
  try {
    for await (const e of Deno.readDir(dir)) entries.push(e);
  } catch {
    return; // racine absente (ex. front non présent) : rien à balayer
  }
  entries = entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const u = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
    if (e.isDirectory) yield* walk(u);
    // Fichiers de test exclus (ils décrivent du code de parsing, pas des
    // consignes envoyées à l'IA) ; les snapshots de prompts restent balayés.
    else if (/\.(ts|tsx|snap)$/.test(e.name) && !/(_test|\.test|\.spec)\.tsx?$/.test(e.name)) yield u;
  }
}

Deno.test("aucun prompt de rédaction/correction ne demande de supprimer la numérotation", async () => {
  const hits: string[] = [];
  let scanned = 0;
  for (const root of ROOTS) {
    for await (const file of walk(root)) {
      if (file.pathname === SELF) continue;
      scanned++;
      const lines = (await Deno.readTextFile(file)).split("\n");
      lines.forEach((line, i) => {
        if (FORBIDDEN.test(line)) hits.push(`${file.pathname}:${i + 1}: ${line.trim().slice(0, 160)}`);
      });
    }
  }
  assert(scanned > 50, `balayage suspect : seulement ${scanned} fichiers lus`);
  assert(hits.length === 0, `Consigne « supprimer la numérotation » trouvée :\n${hits.join("\n")}`);
});

Deno.test("le motif détecte bien les formulations visées (auto-contrôle)", () => {
  for (const s of [
    "→ Supprimer la numérotation. Reformuler comme un moment",
    "supprime toute numérotation",
    "Retire les numéros des conseils",
    "enlève la numérotation",
  ]) assert(FORBIDDEN.test(s), s);
  for (const s of [
    "Garde une procédure et ses étapes lorsque cela sert le contenu demandé.",
    "un par ligne, sans numérotation, sans tiret",
    "NUMÉROTATION DE CONSEILS",
  ]) assert(!FORBIDDEN.test(s), s);
});
