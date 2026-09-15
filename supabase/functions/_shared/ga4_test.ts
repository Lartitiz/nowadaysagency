import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {fetchGa4Month} from './ga4.ts';
const originalFetch=globalThis.fetch;
function report(value:string|null,dimension:string|null=null,rowsOverride?:unknown) {
 return {metricHeaders:[{name:dimension?'sessions':'totalUsers'}],...(dimension?{dimensionHeaders:[{name:dimension}]}:{}),
 metadata:{timeZone:'Europe/Paris'},rows:rowsOverride??(value===null?[]:[{metricValues:[{value}],...(dimension?{dimensionValues:[{value:dimension==='sessionSource'?'instagram':'Organic Search'}]}:{})}])};
}
function mock(responses:unknown[]) {let i=0;globalThis.fetch=(()=>{const data=responses[i++];return Promise.resolve(new Response(JSON.stringify(data),{status:(data as any)?.error?503:200}));}) as typeof fetch;}
const auth={mode:'user',accessToken:'fixture'} as const;
Deno.test('GA4 observed zero and valid empty report remain zero',async()=>{try {mock([report('0'),report(null,'sessionDefaultChannelGroup'),report(null,'sessionSource')]);const m=await fetchGa4Month('123','2026-08-01',auth);assertEquals([m.ga4Users,m.websiteVisitors,m.trafficSearch,m.trafficSocial,m.trafficInstagram],[0,0,0,0,0]);assertEquals(m.observation.reportState,'complete');assertEquals(m.observation.periodState,'complete');}finally{globalThis.fetch=originalFetch;}});
Deno.test('GA4 failed report is null, not a false zero; other reports survive',async()=>{try {mock([{error:{message:'offline'}},report('12','sessionDefaultChannelGroup'),report('7','sessionSource')]);const m=await fetchGa4Month('123','2026-08-01',auth);assertEquals(m.ga4Users,null);assertEquals(m.trafficSearch,12);assertEquals(m.trafficInstagram,7);assertEquals(m.observation.reportState,'partial');}finally{globalThis.fetch=originalFetch;}});
Deno.test('GA4 all failed reports reject, never success with six zeroes',async()=>{try {mock([{error:{}},{error:{}},{error:{}}]);await assertRejects(()=>fetchGa4Month('123','2026-08-01',auth));}finally{globalThis.fetch=originalFetch;}});
Deno.test('GA4 missing/malformed values and paginated/truncated reports stay unavailable',async()=>{try {mock([{},report('','sessionDefaultChannelGroup'),{...report('4','sessionSource'),rowCount:200}]);await assertRejects(()=>fetchGa4Month('123','2026-08-01',auth));}finally{globalThis.fetch=originalFetch;}});
Deno.test('GA4 thresholds do not manufacture observed zeros',async()=>{try {mock([{...report(null),metadata:{timeZone:'Europe/Paris',subjectToThresholding:true}},report('0','sessionDefaultChannelGroup'),report('0','sessionSource')]);const m=await fetchGa4Month('123','2026-08-01',auth);assertEquals(m.ga4Users,null);assertEquals(m.trafficSocial,0);}finally{globalThis.fetch=originalFetch;}});
Deno.test('GA4 rejects invalid calendar month before calling Google',async()=>{await assertRejects(()=>fetchGa4Month('123','2026-13-01',auth));});
Deno.test('GA4 keeps property-local period and actual units for current month',async()=>{try {const d=new Date();const month=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`;mock([report('20'),report('31','sessionDefaultChannelGroup'),report('9','sessionSource')]);const m=await fetchGa4Month('123',month,auth);assertEquals(m.observation.periodState,'partial');assertEquals(m.observation.timeZone,'Europe/Paris');assertEquals(m.observation.startDate,month);assertEquals(m.websiteVisitors,20);assertEquals(m.trafficSearch,31);}finally{globalThis.fetch=originalFetch;}});

Deno.test('Google token resolution refuses a former workspace member and read failures',async()=>{
 const {resolveGoogleUserToken}=await import('./ga4.ts');
 const helpers={decryptConnTokens:async()=>{},encryptToken:async(v:string|null)=>v};
 const db=(membership:unknown,error:unknown=null)=>({from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:table==='workspace_members'?membership:{id:'conn',access_token:'service_account'},error})};return q;}});
 await assertRejects(()=>resolveGoogleUserToken(db(null),'u','A',helpers));
 await assertRejects(()=>resolveGoogleUserToken(db({role:'owner'},new Error('offline')),'u',null,helpers));
 const result=await resolveGoogleUserToken(db({role:'owner'}),'u','A',helpers);assertEquals(result.accessToken,null);assertEquals((result as any).serviceAccount,true);
});
