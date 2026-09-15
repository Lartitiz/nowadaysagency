import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {renderIdeaDraft} from '@/lib/render-idea-draft';
const source=readFileSync('src/pages/IdeasPage.tsx','utf8');
const extracted=source.slice(source.indexOf('function cleanSlideMarkers'),source.indexOf('/** Titre sans'));
const code=ts.transpileModule(extracted,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const preview=new Function(`${code};return getIdeaPreview;`)();
it('real list preview prefers the edited newsletter text, including an explicit empty edit',()=>{
 for(const edited_text of ['R1 NEWSLETTER SAUVÉE — Ligne 1.\nLigne 2 : accents éèà et FIN-R1-20260915.','']){
  const idea={content_data:{subject:'R1',body:'Ancien corps',edited_text},content_draft:'Ancien corps'};
  expect(preview(idea).text).toBe(edited_text.replace(/\n/g,' '));
  expect(renderIdeaDraft(JSON.stringify(idea.content_data),'newsletter')).toBe(edited_text);
 }
});
