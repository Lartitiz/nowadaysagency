import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {renderIdeaDraft} from '@/lib/render-idea-draft';
const source=readFileSync('src/pages/IdeasPage.tsx','utf8');
const extracted=source.slice(source.indexOf('function cleanSlideMarkers'),source.indexOf('/** « Série de stories'));
const code=ts.transpileModule(extracted,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const preview=new Function(`${code};return getIdeaPreview;`)();
it('real list preview prefers the edited newsletter text, including an explicit empty edit',()=>{
 for(const edited_text of ['R1 NEWSLETTER SAUVÉE — Ligne 1.\nLigne 2 : accents éèà et FIN-R1-20260915.','']){
  const idea={content_data:{subject:'R1',body:'Ancien corps',edited_text},content_draft:'Ancien corps'};
  expect(preview(idea).text).toBe(edited_text.replace(/\n/g,' '));
  expect(renderIdeaDraft(JSON.stringify(idea.content_data),'newsletter')).toBe(edited_text);
 }
});

it('never shows raw JSON in the list preview (QA 12/11/2026)', () => {
  const inner = { carousel_type: 'photo', chosen_angle: { title: 'La valeur invisible d\'un salon', description: 'On part du résultat final.' }, slides: [] };
  // Encodé deux fois.
  expect(preview({ preview_data: JSON.stringify(JSON.stringify(inner)) })).toEqual({ title: 'La valeur invisible d\'un salon', text: 'On part du résultat final.' });
  // Coupé par l'extrait de la base : le titre reste, jamais le JSON.
  const cut = JSON.stringify(inner).slice(0, 90);
  expect(preview({ preview_data: cut })).toEqual({ title: 'La valeur invisible d\'un salon' });
  // JSON rangé dans un champ texte.
  expect(preview({ content_data: { content: JSON.stringify(inner) }, accroche_short: '{"x":1}' }).text).toBeUndefined();
  // Texte normal inchangé.
  expect(preview({ content_draft: 'Un vrai texte' }).text).toBe('Un vrai texte');
});
