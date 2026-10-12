// 12/10/2026 : le carrousel texte est écrit en texte libre ; un JSON pas strict
// faisait sauter en silence correction, relecture, schémas et télémétrie.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { strictJsonText } from "./carousel-model.ts";

Deno.test("texte du rédacteur : JSON valide inchangé, JSON récupérable réécrit, prose inchangée", () => {
  const valid = '{ "slides": [ {"title": "A"} ] }';
  assertEquals(strictJsonText(valid), valid);
  const repaired = strictJsonText('```json\n{"slides":[{"title":"A","body":"l1\nl2"},]}\n```');
  assertEquals(JSON.parse(repaired), { slides: [{ title: "A", body: "l1\nl2" }] });
  assertEquals(strictJsonText("Désolée, je ne peux pas."), "Désolée, je ne peux pas.");
});
