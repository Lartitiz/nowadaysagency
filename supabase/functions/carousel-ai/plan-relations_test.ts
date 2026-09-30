import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildConfirmedStructureBlock } from "./confirmed-structure.ts";
Deno.test("les liens précis du plan atteignent le prompt du rédacteur historique",()=>{
  const prompt=buildConfirmedStructureBlock([{slide_number:2,role:"argument",title_suggestion:"Titre",strategic_note:"Note",contribution:"APPORT_TEST",inherits:"REPRISE_TEST",develops:"AVANCEE_TEST",source_ids:["SOURCE_TEST"],image_role:"ROLE_IMAGE_TEST"}],{scenarioOrigin:"user_validated"});
  for(const value of ["APPORT_TEST","REPRISE_TEST","AVANCEE_TEST","SOURCE_TEST","ROLE_IMAGE_TEST"])assert(prompt.includes(value),value);
});
