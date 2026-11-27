import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { studioLibraryName } from "./library-name.ts";

Deno.test("nom de bibliothèque : photo de départ + ce que l'image montre", () => {
  assertEquals(studioLibraryName("IMG_5315", { image_title: "bureau et plante verte" }), "IMG_5315 — bureau et plante verte");
});
Deno.test("nom de bibliothèque : n'empile plus « — Studio »", () => {
  assertEquals(studioLibraryName("IMG_5315 — Studio — Studio", { image_title: "petit salon." }), "IMG_5315 — petit salon");
});
Deno.test("nom de bibliothèque : sans titre, le premier changement confirmé, raccourci", () => {
  const name = studioLibraryName("Salon", { change: ["ajout d'un bureau en bois avec chaise contre le mur de droite de la pièce"] })!;
  assertEquals(name.startsWith("Salon — bureau en bois avec chaise"), true);
  assertEquals(name.endsWith("…"), true);
});
Deno.test("nom de bibliothèque : série numérotée, séance sans nom, rien à dire", () => {
  assertEquals(studioLibraryName("Bol", { image_title: "table d'été", series_size: 3, series_index: 1 }), "Bol — table d'été 2");
  assertEquals(studioLibraryName("", { image_title: "affiche marché de Noël" }), "Affiche marché de Noël");
  assertEquals(studioLibraryName("IMG_1", {}), null);
});
Deno.test("nom de bibliothèque : le verbe d'action du changement est retiré", () => {
  assertEquals(studioLibraryName("IMG_5315 — Studio", { image_title: "", change: ["Ajout d’une petite étagère murale discrète"] }), "IMG_5315 — petite étagère murale discrète");
  assertEquals(studioLibraryName("IMG_5315", { change: ["fond blanc uni"] }), "IMG_5315 — fond blanc uni");
});
