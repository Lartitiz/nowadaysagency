import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergePhotoTags } from "./photo-tags.ts";

Deno.test("le cas réel du 14/08 : un packshot ne garde pas le décor de sa source", () => {
  // Photo source : ordinateur sur un bureau décoré pour Noël.
  const avant = ["packshot", "saisonnier", "noel", "atelier", "coulisses", "workspace"];
  // Après détourage, la vision ne voit plus qu'un objet sur fond blanc.
  const vision = ["ordinateur portable", "fond blanc", "bureau"];

  assertEquals(mergePhotoTags(avant, vision), [
    "packshot",
    "ordinateur portable",
    "fond blanc",
    "bureau",
  ]);
});

Deno.test("la provenance survit, même absente de ce que voit l'IA", () => {
  assertEquals(mergePhotoTags(["portrait-pro"], ["visage", "fond beige"]), [
    "portrait-pro",
    "visage",
    "fond beige",
  ]);
});

Deno.test("un tag de scène encore vrai revient par l'IA, pas par héritage", () => {
  // « atelier » n'est pas hérité : il est présent parce que la vision l'a revu.
  assertEquals(mergePhotoTags(["atelier", "noel"], ["atelier", "argile"]), [
    "atelier",
    "argile",
  ]);
});

Deno.test("aucun tag de provenance : rien n'est hérité", () => {
  assertEquals(mergePhotoTags(["noel", "saisonnier"], ["bol", "argile"]), ["bol", "argile"]);
});

Deno.test("normalisation : casse, espaces, doublons, tags vides ou trop longs", () => {
  assertEquals(
    mergePhotoTags(["  PACKSHOT "], ["  Bol  ", "bol", "", "   ", "x".repeat(31), "Argile"]),
    ["packshot", "bol", "argile"],
  );
});

Deno.test("plafond à 6 tags, la provenance passe en premier", () => {
  const vision = ["a", "b", "c", "d", "e", "f", "g"];
  assertEquals(mergePhotoTags(["mockup"], vision), ["mockup", "a", "b", "c", "d", "e"]);
});

Deno.test("entrées absentes ou mal typées ne cassent rien", () => {
  assertEquals(mergePhotoTags(null, undefined), []);
  assertEquals(mergePhotoTags(undefined, [42, null, "bol"] as unknown[]), ["bol"]);
  assertEquals(mergePhotoTags("pas un tableau" as unknown as string[], ["bol"]), ["bol"]);
});
