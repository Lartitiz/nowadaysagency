import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureServeHandler } from "./test-edge-harness.ts";
import { signState } from "./oauth-state.ts";

// Fictional sessions and provider responses only; no real network or tokens.
for (const [key,value] of Object.entries({SUPABASE_URL:"https://r4-db.test",SUPABASE_ANON_KEY:"r4-anon",SUPABASE_SERVICE_ROLE_KEY:"r4-service",OAUTH_STATE_SECRET:"r4-state",ALLOWED_ORIGIN:"https://r4-app.test",INSTAGRAM_APP_ID:"r4-app",LINKEDIN_CLIENT_ID:"r4-app",LINKEDIN_CLIENT_SECRET:"r4-secret",CANVA_CLIENT_ID:"r4-app",CANVA_CLIENT_SECRET:"r4-secret"})) Deno.env.set(key,value);
Deno.env.delete("TOKEN_ENCRYPTION_KEY");
const cases: Record<string,Record<string,unknown>> = {
 "social-oauth-start":{platform:"linkedin"},"social-status":{},
 "social-instagram-publish":{imageUrl:"https://r4-media.test/photo.jpg"},
 "social-linkedin-publish":{text:"R4 test"},
 "social-pinterest-publish":{board_id:"r4-board",image_url:"https://r4-media.test/photo.jpg"},
 "social-pinterest-boards":{},"social-canva-import":{file_url:"https://r4-media.test/carousel.pptx"},
};
const handlers: Record<string,(r:Request)=>Promise<Response>>={};
for (const name of [...Object.keys(cases),"social-oauth-callback","social-disconnect"]) handlers[name]=await captureServeHandler(new URL(`../${name}/index.ts`,import.meta.url).href);
function fixture(access: "member"|"removed"|"error"|"removed-after-exchange", withConnection=true, role: string|null="editor") {
 const old=globalThis.fetch;const calls:{path:string;method:string;query:Record<string,string>}[]=[];
 globalThis.fetch=async(input,init)=>{
  const req=input instanceof Request?input:new Request(input,init);const u=new URL(req.url);calls.push({path:u.pathname,method:req.method,query:Object.fromEntries(u.searchParams)});
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
  if(u.hostname==='r4-db.test') {
   if(u.pathname==='/auth/v1/user')return json({id:'r4-user'});
   if(u.pathname==='/rest/v1/workspace_members') {
    assertEquals(u.searchParams.get('workspace_id'),'eq.r4-space');assertEquals(u.searchParams.get('user_id'),'eq.r4-user');
    return access==='error'?json({message:'PRIVATE R4 database error'},503):json(access==='member'||(access==='removed-after-exchange'&&!calls.some(c=>c.path==='/oauth/v2/accessToken'))?[{role}]:[]);
   }
   if(u.pathname==='/rest/v1/social_connections')return json(req.method==='GET'?(withConnection?[{id:'r4-conn',platform:'linkedin',platform_account_name:'R4 PRIVATE account',platform_account_id:'r4-member',access_token:'r4-fictional',refresh_token:'r4-fictional',workspace_id:'r4-space',user_id:'r4-user'}]:[]):[]);
   throw new Error('Unexpected database request '+u.pathname);
  }
  // A provider call must be observable even when its response refuses the operation.
  if(u.pathname==='/oauth/v2/accessToken')return json({access_token:'r4-fictional',expires_in:3600});
  if(u.pathname==='/v2/userinfo')return json({sub:'r4-member',name:'R4 TEST'});
  return json({error:{message:'R4 provider refused'},message:'R4 provider refused'},400);
 };
 return {calls,restore:()=>globalThis.fetch=old,providers:()=>calls.filter(c=>!c.path.startsWith('/auth/')&&!c.path.startsWith('/rest/')),writes:()=>calls.filter(c=>c.path.startsWith('/rest/')&&c.method!=='GET')};
}
const request=(name:string,workspace_id: string|null='r4-space')=>new Request('https://r4-edge.test/'+name,{method:'POST',headers:{Authorization:'Bearer r4-fictional','Content-Type':'application/json'},body:JSON.stringify({...cases[name],workspace_id})});
for(const name of Object.keys(cases)) for(const state of ['removed','error'] as const) Deno.test(`${name}: ${state} membership refuses before connection/provider/write`,async()=>{
 const f=fixture(state);try {
  const res=await handlers[name](request(name));const body=await res.text();
  assertEquals({status:res.status,providers:f.providers().length,writes:f.writes().length,connectionReads:f.calls.filter(c=>c.path==='/rest/v1/social_connections').length},{status:403,providers:0,writes:0,connectionReads:0});
  assert(!body.includes('PRIVATE R4'));assert(!body.includes('r4-fictional'));
 }finally{f.restore()}
});
for(const name of Object.keys(cases)) for(const workspace of ['r4-space',null]) Deno.test(`${name}: valid ${workspace?'member':'personal NULL'} scope reaches its normal operation`,async()=>{
 const f=fixture('member',false);try{
  const res=await handlers[name](request(name,workspace));await res.text();assert(res.status!==403);
  assertEquals(f.calls.filter(c=>c.path==='/rest/v1/workspace_members').length,workspace?1:0);
  if(name!=='social-oauth-start'){
    const reads=f.calls.filter(c=>c.path==='/rest/v1/social_connections');assertEquals(reads.length,1);
    assertEquals(reads[0].query.user_id,'eq.r4-user');
    assertEquals(reads[0].query.workspace_id,workspace?'eq.r4-space':'is.null');
  }
 }finally{f.restore()}
});
async function callbackRequest(workspace_id:string|null='r4-space'){
 const state=await signState({user_id:'r4-user',workspace_id,platform:'linkedin',origin:'https://r4-app.test',nonce:crypto.randomUUID(),ts:Date.now()},'r4-state');
 return new Request('https://r4-edge.test/social-oauth-callback?code=r4-code&state='+encodeURIComponent(state));
}
for(const state of ['removed','error'] as const) Deno.test(`OAuth callback: old signed state with ${state} membership does not exchange code or persist`,async()=>{
 const f=fixture(state);try{
  const res=await handlers['social-oauth-callback'](await callbackRequest());await res.text();
  assertEquals(new URL(res.headers.get('Location')!).searchParams.get('connected'),'error');
  assertEquals({providers:f.providers().length,writes:f.writes().length},{providers:0,writes:0});
 }finally{f.restore()}
});
for(const ws of ['r4-space',null])Deno.test(`OAuth callback: valid ${ws?'member':'personal'} preserves exchange and persistence`,async()=>{
 const f=fixture('member',false);try{
  const res=await handlers['social-oauth-callback'](await callbackRequest(ws));await res.text();
  assertEquals(new URL(res.headers.get('Location')!).searchParams.get('connected'),'linkedin');assertEquals(f.writes().length,1);
 }finally{f.restore()}
});
Deno.test('removed member can still revoke only their own connection',async()=>{
 const f=fixture('removed');try{
  const res=await handlers['social-disconnect'](new Request('https://r4-edge.test/social-disconnect',{method:'POST',headers:{Authorization:'Bearer r4-fictional','Content-Type':'application/json'},body:JSON.stringify({platform:'linkedin',workspace_id:'r4-space'})}));
  assertEquals(res.status,200);await res.text();assertEquals(f.writes().filter(c=>c.method==='DELETE').length,1);
  assertEquals(f.providers().length,0);
  const deletion=f.calls.find(c=>c.method==='DELETE')!;
  assertEquals(deletion.query.user_id,'eq.r4-user');assertEquals(deletion.query.workspace_id,'eq.r4-space');
 }finally{f.restore()}
});

Deno.test("OAuth callback: membership lost during provider exchange cannot save a connection",async()=>{
 const f=fixture("removed-after-exchange",false);try{
  const res=await handlers["social-oauth-callback"](await callbackRequest());await res.text();
  assertEquals(new URL(res.headers.get("Location")!).searchParams.get("connected"),"error");
  assertEquals(f.providers().length,2);assertEquals(f.writes().length,0);
 }finally{f.restore()}
});
for(const role of ["owner","manager","editor","viewer"])Deno.test(`social-status: current ${role} may read own connection status`,async()=>{
 const f=fixture("member",false,role);try{
  const res=await handlers["social-status"](request("social-status"));await res.text();assertEquals(res.status,200);
 }finally{f.restore()}
});

for(const name of ["social-instagram-publish","social-linkedin-publish","social-pinterest-publish"]) {
 for(const role of ["viewer",null])Deno.test(`${name}: ${role} role refuses publication even with own old connection`,async()=>{
  const f=fixture("member",true,role);try{
   const res=await handlers[name](request(name));await res.text();assertEquals(res.status,403);
   assertEquals(f.providers().length,0);assertEquals(f.writes().length,0);
   assertEquals(f.calls.some(c=>c.path==="/rest/v1/social_connections"),false);
  }finally{f.restore()}
 });
 for(const role of ["owner","manager","editor"])Deno.test(`${name}: ${role} retains publication access`,async()=>{
  const f=fixture("member",false,role);try{
   const res=await handlers[name](request(name));await res.text();assertEquals(res.status,400);
   assertEquals(f.calls.some(c=>c.path==="/rest/v1/social_connections"),true);
  }finally{f.restore()}
 });
}
