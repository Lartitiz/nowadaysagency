import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { allowedPhotoTreatments, planPhotoArtDirection, validatePhotoArtChoices, PHOTO_ART_RULES } from "./photo-art-direction.ts";
const slides = [{slide_number:1,photo_index:2,overlay_text:"Une phrase claire. Une suite utile.",overlay_position:"bottom_left"}];
const choice = {slide_number:1,treatment:"editorial",position:"top_left",emphasis:"Une suite utile.",reason:"L'objet est dans la partie basse.",surface:"veil",alignment:"left"};
Deno.test("direction photo : texte final, charte, pixels associés et références, sans mutation", async()=>{
  const original=structuredClone(slides), usage:any={}; let calls=0;
  const result=await planPhotoArtDirection(slides,{moodboard_description:"NOTE_VALIDÉE",visual_donts:"INTERDIT",template_layout_description:"COMPOSITION_VALIDÉE"},[{base64:"non-envoye"},{base64:"cGhvdG8="}],usage,async(o,s)=>{
    calls++; const content:any[]=o.messages[0].content as any[];
    assertEquals(content.filter(c=>c.type==="image"&&c.source.type==="base64").map(c=>c.source.data),["cGhvdG8="]);
    assert(content[0].text.includes("NOTE_VALIDÉE"));assert(content[0].text.includes("COMPOSITION_VALIDÉE"));assert(content[0].text.includes("INTERDIT"));
    assert(content.some(c=>c.source?.url==="https://example.com/reference.png"));
    assertEquals(o.maxRetries,0);assertEquals(o.abortTimeoutMs,25000);
    Object.assign(s!,{model:"claude-sonnet-4-6",total_tokens:12});return JSON.stringify({choices:[choice]});
  },["https://example.com/reference.png"]);
  assertEquals(calls,1);assertEquals(slides,original);assertEquals(result.status,"completed");assertEquals(result.choices[0].emphasis,choice.emphasis);assertEquals(usage.total_tokens,12);
});
Deno.test("direction photo : aucune IA pour une photo brute ; échec explicite sans faux plan",async()=>{
  const raw=await planPhotoArtDirection([{photo_index:1}],{},[],{},async()=>{throw Error("should not call")});assertEquals(raw.status,"skipped");
  const failed=await planPhotoArtDirection(slides,{},[],{},async()=>{throw Error("private detail")});assertEquals(failed.status,"unavailable");assertEquals(failed.choices,[]);assert(!JSON.stringify(failed).includes("private detail"));
});
Deno.test("direction photo : pas de forme inventée, avant/après ou liste sans données",()=>{
  for(const treatment of ["before_after","list","steps","number"]) assertThrows(()=>validatePhotoArtChoices(JSON.stringify({choices:[{...choice,treatment}]}),slides,new Set([2])));
  assertEquals(allowedPhotoTreatments({...slides[0],points:["A","B"]},0,1),["list"]);
  assert(PHOTO_ART_RULES.includes("Aucune représentation avant/après"));
});
Deno.test("direction photo : références ambiguës refusées, extrait inventé ignoré",()=>{
  for(const choices of [[],[choice,choice],[{...choice,slide_number:9}]]) assertThrows(()=>validatePhotoArtChoices(JSON.stringify({choices}),slides,new Set([2])));
  assertEquals(validatePhotoArtChoices(JSON.stringify({choices:[{...choice,emphasis:"Une promesse inventée"}]}),slides,new Set([2]))[0].emphasis,null);
});
Deno.test("direction photo : sans pixels et avec position verrouillée, pas de déplacement",()=>{
  assertEquals(validatePhotoArtChoices(JSON.stringify({choices:[choice]}),slides,new Set())[0].position,"bottom_left");
  assertEquals(validatePhotoArtChoices(JSON.stringify({choices:[choice]}),[{...slides[0],position_locked:true}],new Set([2]))[0].position,"bottom_left");
});
Deno.test("direction photo : la zone du sujet déplace un texte long hors du visage (13/11/2026)",()=>{
  const long=[{slide_number:1,photo_index:2,kicker:"Ce raisonnement pèse surtout avec un financement bancaire et une durée longue.",overlay_text:"Si vous financez en fonds propres sans échéance, ou si le lot peut être conservé, l’ordre compte moins.",overlay_position:"top_left"}];
  const face={...choice,emphasis:long[0].overlay_text,subject_top:34,subject_bottom:48};
  const [placed]=validatePhotoArtChoices(JSON.stringify({choices:[face]}),long,new Set([2]),new Map([[2,{width:1080,height:1350}]]));
  assertEquals(placed.position,"bottom_left");assertEquals(placed.placement?.preferred,"top_left");assertEquals(placed.placement?.moved,true);assertEquals(placed.placement?.conflict,false);
  // Sans zone du sujet : la préférence de l'IA reste (comportement d'avant).
  assertEquals(validatePhotoArtChoices(JSON.stringify({choices:[{...choice,subject_top:null,subject_bottom:null}]}),long,new Set([2]))[0].position,"top_left");
  // Couverture : toujours centrée, jamais déplacée.
  assertEquals(validatePhotoArtChoices(JSON.stringify({choices:[{...face,treatment:"opening",position:"center"}]}),long,new Set([2]))[0].position,"center");
  assert(PHOTO_ART_RULES.includes("subject_top"));
});
