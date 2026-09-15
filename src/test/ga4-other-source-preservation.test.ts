// Runs the real LinkedIn callback against a persisted row that changed during the
// request. This is a handler regression, not an authenticated browser recipe.
import fs from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
const source=fs.readFileSync(process.env.STATS_SOURCE || 'src/pages/InstagramStats.tsx','utf8');
function callback(name:string) {
 const file=ts.createSourceFile('stats.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let expression='';
 const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(file)===name&&node.initializer&&ts.isCallExpression(node.initializer))expression=node.initializer.arguments[0].getText(file);ts.forEachChild(node,visit);};visit(file);
 if(!expression)throw new Error('Missing production callback '+name);
 return ts.transpileModule('return '+expression,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
it('LinkedIn refresh preserves a newer GA4 number/provenance and Instagram columns',async()=>{
 const snapshot={id:'row',month_date:'2026-09-01',ga4_users:12,reach:50,custom_data:{ig:'keep'}};
 const persisted:any={...snapshot,ga4_users:27,metric_provenance:{ga4_users:{source:'ga4',value:27}}};
 const update=vi.fn((patch:any)=>({eq:async()=>{Object.assign(persisted,patch);return {error:null};}}));
 const noop=vi.fn();const names=['user','workspaceId','currentMonthDate','allStats','setFetchingLiStats','invokeWithTimeout','toast','setLiStats','supabase','loadStats'];
 const values=[{id:'user'},'A','2026-09-01',[snapshot],noop,async()=>({data:{metrics:{followers:123}}}),{success:noop,error:noop,warning:noop},noop,{from:()=>({update}),functions:{invoke:async()=>({data:{metrics:{followers:123}}})}},async()=>{}];
 await new Function(...names,callback('fetchFromLinkedIn'))(...values)();
 expect(update).toHaveBeenCalledTimes(1);expect(persisted.ga4_users).toBe(27);expect(persisted.metric_provenance.ga4_users.value).toBe(27);expect(persisted.reach).toBe(50);expect(persisted.custom_data.li_stats.followers).toBe(123);
});
