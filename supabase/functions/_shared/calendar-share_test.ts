import { projectCalendarPost, scopeCalendarPosts } from "./calendar-share.ts";
function assert(value: unknown) { if (!value) throw new Error("Assertion failed"); }
Deno.test("public projection: hidden text/media, explicit notes and description, no internal angle", () => {
 const p = {id:"p", theme:"Theme", date:"2026-09-14", canal:"instagram", format:"photo",status:"ready",notes:"private",objectif:"objective",angle:"internal",content_draft:"draft",accroche:"hook",media_urls:["private.jpg"]};
 const hidden = projectCalendarPost(p, {show_content_draft:false}) as Record<string,unknown>;
 for (const key of ["notes","objectif","angle","content_draft","accroche","media_urls"]) assert(!(key in hidden));
 assert(hidden.theme === "Theme");
 const shown = projectCalendarPost(p, {show_content_draft:true,show_columns:["notes","description"]}) as Record<string,unknown>;
 for (const key of ["notes","objectif","content_draft","accroche","media_urls"]) assert(key in shown);
 assert(!("angle" in shown));
});
Deno.test("same query scope for workspace, new personal, historical owner links and channels", () => {
 for (const [share, expected] of [
   [{user_id:"u",workspace_id:"A",canal_filter:"instagram"}, [["eq","user_id","u"],["eq","workspace_id","A"],["eq","canal","instagram"]]],
   [{user_id:"u",workspace_id:null}, [["eq","user_id","u"],["is","workspace_id",null]]],
   [{user_id:"u",workspace_id:null,legacy_owner_scope:true}, [["eq","user_id","u"]]],
 ] as const) {
   const calls: unknown[]=[];
   const query={eq:(k:string,v:string)=>{calls.push(["eq",k,v]);return query},is:(k:string,v:null)=>{calls.push(["is",k,v]);return query}};
   scopeCalendarPosts(query,share);
   assert(JSON.stringify(calls)===JSON.stringify(expected));
 }
});

Deno.test("draft projection removes private crosspost provenance and other-channel versions", () => {
 const draft = {type:"crosspost",target_channel:"instagram",version:{caption:"Public target",_crosspost:{source_text:"secret"}},result:{versions:{linkedin:"private version"}},source_text:"private source",source_files:["private.pdf"]};
 const shown=projectCalendarPost({content_draft:JSON.stringify(draft)}, {show_content_draft:true});
 const serialized=JSON.stringify(shown);
 assert(serialized.includes("Public target"));
 for(const secret of ["secret","private version","private source","private.pdf","_crosspost"]) assert(!serialized.includes(secret));
});
