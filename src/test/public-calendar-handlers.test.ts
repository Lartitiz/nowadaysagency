import { expect, it, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { projectCalendarPost, scopeCalendarPosts } from "../../supabase/functions/_shared/calendar-share";
function handler(name:string, db:unknown) {
 let serve: (req:Request)=>Promise<Response>;
 const source=fs.readFileSync(`supabase/functions/${name}/index.ts`,"utf8").replace(/^import .*;\s*$/gm,"");
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 vm.runInNewContext(code,{Deno:{serve:(f:typeof serve)=>{serve=f},env:{get:()=>"test"}},createClient:()=>db,getCorsHeaders:()=>({}),projectCalendarPost,scopeCalendarPosts,Response,Request,URL,Date,console});
 return (req:Request)=>serve(req);
}
for (const name of ["public-calendar-comment","public-calendar-edit"]) {
 it(`${name}: forwards token scope and request receipt; never reports a failed/empty write as success`, async()=>{
  for (const result of [{data:null,error:{message:"fail"}},{data:null,error:null},{data:{error:"post_not_found",status:404},error:null}]) {
   const rpc=vi.fn().mockResolvedValue(result);
   const res=await handler(name,{rpc})(new Request("https://fiction.invalid",{method:"POST",body:JSON.stringify({token:"fiction",calendar_post_id:"p",post_id:"p",content:"Hello",value:"ready",field:"status",author_name:"Test",request_id:"r"})}));
   expect(res.status).toBe(result.data?404:500);
   expect((await res.json()).error).toBeTruthy();
   expect(rpc).toHaveBeenCalledWith("public_calendar_write",expect.objectContaining({p_token:"fiction",p_post_id:"p",p_request_id:"r"}));
  }
 });
}
it("public read fails on post/comment read errors, preserving absence versus failure",async()=>{
 for(const failedTable of ["calendar_shares","calendar_posts","calendar_comments"]){
 const db={from:(table:string)=>{let single=false;const q:any={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,order:()=>q,maybeSingle:()=>{single=true;return q},then:(r:any)=>Promise.resolve({data:single?(table==="calendar_shares"?{id:"s",user_id:"u",is_active:true}:{}):table==="calendar_posts"?[{id:"p"}]:[],error:table===failedTable?{message:"read failed"}:null}).then(r)};return q}};
 const res=await handler("public-calendar",db)(new Request("https://fiction.invalid?token=fiction&period=all"));
 expect(res.status).toBe(500);expect(await res.json()).toEqual({error:"internal"});
 }
});
