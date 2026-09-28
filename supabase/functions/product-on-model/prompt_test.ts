import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Fidélité produit (28/09/2026) : l'interdit « logos » ne doit viser que ce qui
 * est AJOUTÉ à la scène — jamais le logo du produit de la cliente. On relit le
 * source : buildPrompt n'est pas exporté (index.ts démarre le serveur).
 */
Deno.test("le prompt mannequin garde le logo du produit et n'interdit que les logos ajoutés", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(!/added text, logos, watermarks/.test(src), "l'ancien interdit ambigu « logos » est revenu");
  assert(/ADDED to the scene/.test(src), "l'interdit doit préciser « ajouté à la scène »");
  assert(/KEEP ON THE PRODUCT: its own logo/.test(src), "la consigne de conservation du logo produit a disparu");
});
