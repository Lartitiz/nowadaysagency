import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts';
Deno.env.set('SUPABASE_URL','https://fixture.invalid');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fixture-key');Deno.env.set('RESEND_API_KEY','fixture-resend');
let handler: (r:Request)=>Promise<Response>;
const serve = Deno.serve;
(Deno as any).serve=(h:any)=>{handler=h;return {finished:Promise.resolve()};};
await import('./index.ts');
(Deno as any).serve=serve;
const originalFetch=globalThis.fetch;
function req(){return new Request('https://edge.invalid/send-email',{method:'POST',headers:{Authorization:'Bearer fixture-key','Content-Type':'application/json'},body:JSON.stringify({to:'fiction@example.invalid',subject:'fixture',html:'fixture',user_id:'u',sequence_id:'seq'})});}
for(const scenario of ['tips-off','reminders-off','ritual-off','unsubscribed','unsubscribe-error','preference-error','transaction']){
 Deno.test(`send-email handler: ${scenario}`,async()=>{
  let sends=0;
  globalThis.fetch=async(input)=>{
   const url=String(input instanceof Request?input.url:input);
   const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
   if(url.startsWith('https://api.resend.com/')){sends++;return json({id:'fake-send'});}
   if(url.includes('/email_unsubscribes'))return scenario==='unsubscribe-error'?json({message:'unreadable'},500):json(scenario==='unsubscribed'?{id:'unsub'}:null);
   if(url.includes('/email_sequences'))return json({trigger_event:scenario==='transaction'?'payment_failed':scenario==='reminders-off'?'inactive_7d':scenario==='ritual-off'?'weekly_digest':'not_activated'});
   if(url.includes('/profiles'))return scenario==='preference-error'?json({message:'read failed'},500):json({notification_tips:false,notification_reminders:false,weekly_ritual_enabled:false});
   if(url.includes('/email_sends'))return json([]);
   throw new Error('Unexpected URL '+url);
  };
  try{const result=await handler(req());const data=await result.json();assertEquals(sends,scenario==='transaction'?1:0);assertEquals(result.status,scenario.endsWith('error')?500:200);if(!scenario.endsWith('error')&&scenario!=='transaction')assertEquals(data.skipped,true);}finally{globalThis.fetch=originalFetch;}
 });
}
