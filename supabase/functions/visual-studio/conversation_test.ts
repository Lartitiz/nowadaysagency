import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { activeReferences, explicitRoles, adviceTurn, independentRequest, dialogueHistory } from "./conversation.ts";
import { repairTargets, validTargets } from "./scene-workflow.ts";
import type { Reference } from "./media.ts";
const refs: Reference[] = [
  { id: "plate", photo_id: null, path: "plate", name: "img_5751", role: "style" },
  { id: "me", photo_id: null, path: "me", name: "img_5174", role: "subject" },
];
Deno.test("the user's exact French ordinal mapping overrides library kinds", () => {
  const roles = explicitRoles("J'aimerais qu'on puisse me voir dans un beau décor présentant ma nouvelle assiette. Donc, mon assiette, image 1, et moi, je suis dans l'image 2.", refs);
  assertEquals([...roles], [["plate", "product"], ["me", "person"]]);
  assertEquals([...explicitRoles("image 1 = produit ; image 2 = personne", refs)], [["plate", "product"], ["me", "person"]]);
  assertEquals([...explicitRoles("img_5751 est le produit. img_5174 c'est moi", refs)], [["plate", "product"], ["me", "person"]]);
  assertEquals([...explicitRoles("Moi présentant cette assiette", [{...refs[0],name:"Assiette"}])], []);
});
Deno.test("active selection survives clarification and honors explicit removal and fresh boundaries", () => {
  const messages = [{role:"user",text:"Mon produit",reference_ids:["plate"]},{role:"assistant",text:"Quelle pose ?",operation:"clarify"}];
  assertEquals(activeReferences({messages},refs),["plate"]);
  assertEquals(activeReferences({messages,source_metadata:{studio_context:{reference_ids:[],branch_id:null,start_index:0}}},refs),[]);
  assertEquals(activeReferences({messages:[...messages,{role:"user",text:"Nouvelle idée sans les anciennes photos",reference_ids:[]},{role:"assistant",text:"Quel format ?",operation:"clarify"}]},refs),[]);
});
Deno.test("advice intent is lightweight, corrections and fresh requests stay distinct", () => {
  for (const text of ["Qu’en penses-tu ?","Tu peux m’aider ?","Pourquoi cette lumière ?","Tu me conseilles quoi ?"]) assertEquals(adviceTurn(text),true);
  assertEquals(adviceTurn("Pourquoi pas, change le décor"),false);
  assertEquals(independentRequest("Nouvelle illustration sans les anciennes photos"),true);
  assertEquals(independentRequest("Mon assiette est nouvelle"),false);
});
Deno.test("branch dialogue retains short options and discards explicitly different branches",()=>{
  assertEquals(dialogueHistory([{role:"assistant",text:"1. Debout 2. Assise",viewed_version_id:"a"},{role:"user",text:"la deuxième",viewed_version_id:"a"},{role:"user",text:"Une autre branche",viewed_version_id:"b"}],0,"a").map(m=>m.content),["1. Debout 2. Assise","la deuxième"]);
});
Deno.test("partial mapping is completed without merging distinct identities",()=>{
  const exact = [{...refs[0],role:"product" as const},{...refs[1],role:"person" as const}];
  const target = {role:"person" as const,reference_ids:["me"],location:"Tenant l’assiette",instruction:"Reprendre le visage"};
  const repaired = repairTargets([target],exact,[],"Dans les mains");
  assertEquals(validTargets(repaired,exact),true);
  assertEquals(repaired[0],target);
  assertEquals(repaired[1].location,"Dans les mains");
  const people=[exact[1],{...exact[1],id:"other",role:"casting" as const}];
  assertEquals(validTargets(repairTargets([],people),people),false);
});
Deno.test("one explicitly mixed photo maps person and product to the same real input",()=>{
 const mixed:Reference[]=[{...refs[0],role:'person_product'}];
 const targets=repairTargets([],mixed);
 assertEquals(targets.map(t=>t.role),['person','product']);
 assertEquals(validTargets(targets,mixed),true);
 assertEquals(validTargets([targets[0]],mixed),false);
});
Deno.test("explicit grouping completes a partially mapped group even when its root has no group field",()=>{
 const people:Reference[]=[{...refs[1],role:'person'},{...refs[1],role:'person',id:'side',subject_group:'me'}];
 const target={role:'person' as const,reference_ids:['me'],location:'Au centre',instruction:'Conserver son identité'};
 const result=repairTargets([target],people);
 assertEquals(result.length,1);assertEquals(result[0].reference_ids,['me','side']);assertEquals(validTargets(result,people),true);
 assertEquals(independentRequest('Retouche ma nouvelle photo produit'),false);
});
