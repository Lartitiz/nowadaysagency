import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { alignedPassages, perPassageBlock } from "./per-passage.ts";

Deno.test("consigne reel : une requête par passage, numérotée, dans l'ordre", () => {
  const block = perPassageBlock(["Rien sur les plans.", "Puis on ouvre le mur : un conduit de cheminée."]);
  assertStringIncludes(block, "EXACTEMENT 2 requêtes");
  assertStringIncludes(block, "2. Puis on ouvre le mur : un conduit de cheminée.");
});

Deno.test("alignement : gardé tel quel, sans requête ajoutée en tête", () => {
  const got = alignedPassages(["empty floor plans", "old brick chimney"], ["plans vides", "vieille cheminée"], 2);
  assertEquals(got?.passages, ["empty floor plans", "old brick chimney"]);
  assertEquals(got?.labels["old brick chimney"], "vieille cheminée");
});

Deno.test("alignement refusé si le compte ne tombe pas juste ou si un passage est vide", () => {
  assertEquals(alignedPassages(["a", "b"], [], 3), null);
  assertEquals(alignedPassages(["a", " "], [], 2), null);
  assertEquals(alignedPassages("a", [], 1), null);
});
