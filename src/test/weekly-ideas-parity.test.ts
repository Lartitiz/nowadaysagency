import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {transpileModule} from 'typescript';
import {weeklyIdeas} from '@/lib/weekly-ideas';
it('frontend and real email pool match across ISO weeks and year boundary',()=>{
 const source=readFileSync('supabase/functions/email-trigger/index.ts','utf8').split('serve(async')[0].replace(/^import .*;\n/gm,'');
 const js=transpileModule(source,{compilerOptions:{target:99}}).outputText;
 const server=new Function(js+';return weeklyIdeas;')() as typeof weeklyIdeas;
 for(let i=0;i<380;i++){const day=new Date(Date.UTC(2026,0,i));expect(server(day)).toEqual(weeklyIdeas(day));}
});
