import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildDepthBlock } from "./depth-research.ts";

Deno.test("buildDepthBlock : vide si la recherche n'a rien donné", () => {
  assertEquals(buildDepthBlock(""), "");
  assertEquals(buildDepthBlock("   "), "");
  assertEquals(buildDepthBlock("VIDE"), "");
  assertEquals(buildDepthBlock("vide."), "");
});

Deno.test("buildDepthBlock : vide si la matière est trop courte pour être utile", () => {
  assertEquals(buildDepthBlock("Le grès cuit à 1280 °C."), "");
});

Deno.test("buildDepthBlock : enveloppe une vraie matière avec la consigne condiment", () => {
  const material = "Le prix d'une pièce artisanale intègre un taux de perte au four de 5 à 15 % selon les techniques (Ateliers d'Art de France, 2024). Le mécanisme : contrairement à l'industrie, la perte n'est pas mutualisée sur des milliers d'unités.";
  const block = buildDepthBlock(material);
  assertEquals(block.includes("MATIÈRE DE PROFONDEUR"), true);
  assertEquals(block.includes(material), true);
  assertEquals(block.includes("CONDIMENT"), true);
});
