import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildConfirmedStructureBlock } from "./confirmed-structure.ts";
const plan = [{slide_number:1,role:"hook",title_suggestion:"Titre du plan",strategic_note:"Note",photo_index:3,slide_type:"photo_full",story_beat:"Motif suivant",photo_observation:"Fleur visible"}];
Deno.test("le plan automatique conserve la répartition mais libère le propos et les titres", () => {
  const text = buildConfirmedStructureBlock(plan,{scenarioOrigin:"automatic",narrativeThread:"Visite des photos",withStoryBeat:true});
  assert(text.includes("FIL AUTOMATIQUE À RÉÉVALUER"));
  assert(text.includes("réécris librement le fil, les rôles, les titres"));
  assert(text.includes("conserve nombre, ordre, types et photos"));
  assert(text.includes("Photo n°3 (photo_full)"));
  assert(!text.includes("IMPOSÉE PAR L'UTILISATEUR"));
  assert(!text.includes("affiner légèrement"));
});
for (const scenarioOrigin of [undefined,"user_validated","user_authored"]) Deno.test(`validation explicite ou legacy préservée : ${scenarioOrigin}`, () => {
  const text = buildConfirmedStructureBlock(plan,{scenarioOrigin,narrativeThread:"Fil validé",withStoryBeat:true});
  assert(text.includes("STRUCTURE IMPOSÉE PAR L'UTILISATEUR"));
  assert(text.includes("RÉCIT VALIDÉ À EXÉCUTER"));
  assert(text.includes("Ne change NI l’ordre NI les rôles NI le nombre"));
  assert(!text.includes("réécris librement"));
});
Deno.test("aucun plan n'impose une fausse validation", () => { assertEquals(buildConfirmedStructureBlock(null),""); });
