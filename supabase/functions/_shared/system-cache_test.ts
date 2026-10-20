// Limite du cache du prompt système (audit de coût du 20/10/2026).
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/system-cache_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripCacheBreak, stripCacheBreakFromMessages, SYSTEM_CACHE_BREAK, systemBlocks } from "./system-cache.ts";

Deno.test("sans marqueur : un seul bloc en cache (comportement d'avant)", () => {
  assertEquals(systemBlocks("règles", "+outil"), [{ type: "text", text: "règles+outil", cache_control: { type: "ephemeral" } }]);
});

Deno.test("avec marqueur : partie fixe en cache, partie cliente sans cache, marqueur retiré", () => {
  const blocs = systemBlocks(`RÈGLES${SYSTEM_CACHE_BREAK}FICHE${SYSTEM_CACHE_BREAK}SUITE`, "+outil");
  assertEquals(blocs, [
    { type: "text", text: "RÈGLES", cache_control: { type: "ephemeral" } },
    { type: "text", text: "FICHESUITE+outil" },
  ]);
  assertEquals(blocs.map((b) => b.text).join(""), "RÈGLESFICHESUITE+outil", "le modèle lit le même texte");
});

Deno.test("marqueur en tête : aucun cache (appel unique avec données de la cliente)", () => {
  assertEquals(systemBlocks(`${SYSTEM_CACHE_BREAK}PAGE DU SITE`), [{ type: "text", text: "PAGE DU SITE" }]);
});

Deno.test("system recopié dans un message : marqueur retiré", () => {
  assertEquals(stripCacheBreak(`a${SYSTEM_CACHE_BREAK}b`), "ab");
  const msgs = stripCacheBreakFromMessages([
    { role: "user", content: `x${SYSTEM_CACHE_BREAK}y` },
    { role: "user", content: [{ type: "text", text: `p${SYSTEM_CACHE_BREAK}q` }, { type: "image", source: {} }] },
  ]);
  assertEquals(msgs[0].content, "xy");
  assertEquals((msgs[1].content as any)[0].text, "pq");
});
