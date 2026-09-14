import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ContentPreview } from '@/components/ContentPreview';
import { previewContent, type ContentReceipt } from '@/lib/content-preview-save';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/hooks/use-story-export',()=>({useStoryExport:()=>({hasFrames:false})}));
vi.mock('@/components/exports/StoryExportButtons',()=>({StoryExportButtons:()=>null}));
vi.mock('@/components/crosspost/CrosspostSources',()=>({default:()=>null}));
afterEach(cleanup);
function deferred<T>() { let resolve!:(v:T)=>void, reject!:(v:any)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject}; }
function edit(text:string,value:string){fireEvent.click(screen.getByText(text)); const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value}});fireEvent.blur(input);return input;}
const receipt=(content:any):ContentReceipt=>({saved:true,content,row:{id:'A'}});

describe('ContentPreview waits for persistence',()=>{
 it('shows pending, prevents duplicate blur/click and preserves failed input for retry',async()=>{
  const pending=deferred<ContentReceipt>();const save=vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(receipt('Texte à conserver'));
  render(<ContentPreview contentData={null} contentDraft="Ancien texte" editable onContentChange={save}/>);
  const input=edit('Ancien texte','Texte à conserver');fireEvent.blur(input);fireEvent.click(screen.getByRole('button',{name:'Valider'}));
  expect(save).toHaveBeenCalledTimes(1);expect(screen.getByText('Enregistrement…')).toBeTruthy();expect(screen.queryByText('✓ Modifié')).toBeNull();expect(input).toHaveValue('Texte à conserver');
  await act(async()=>pending.reject(new Error('Réseau indisponible')));
  expect(input).toHaveValue('Texte à conserver');expect(screen.getByRole('alert')).toHaveTextContent('Réseau');
  fireEvent.click(screen.getByRole('button',{name:'Réessayer'}));await screen.findByText('✓ Modifié');expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByText('Texte à conserver')).toBeTruthy();
 });
 it('rejects a callback that resolves without an explicit receipt',async()=>{
  render(<ContentPreview contentData="Old" editable onContentChange={vi.fn().mockResolvedValue(undefined)}/>);
  edit('Old','Draft');await screen.findByRole('alert');expect(screen.getByRole('textbox')).toHaveValue('Draft');expect(screen.queryByText('✓ Modifié')).toBeNull();
 });
 it('Escape cancels an unsent edit and never submits on the subsequent blur',()=>{
  const save=vi.fn();render(<ContentPreview contentData="Old" editable onContentChange={save}/>);
  fireEvent.click(screen.getByText('Old'));const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:'abandon'}});fireEvent.keyDown(input,{key:'Escape'});fireEvent.blur(input);
  expect(save).not.toHaveBeenCalled();expect(screen.getByText('Old')).toBeTruthy();
 });
 it('Escape during a pending save does not pretend to cancel an already sent write',async()=>{
  const gate=deferred<ContentReceipt>();render(<ContentPreview contentData="Old" editable onContentChange={()=>gate.promise}/>);
  const input=edit('Old','New');fireEvent.keyDown(input,{key:'Escape'});expect(screen.getByText('Enregistrement…')).toBeTruthy();await act(async()=>gate.resolve(receipt('New')));expect(screen.getByText('New')).toBeTruthy();
 });
 const cases:any[]=[
  ['reel',{script:[{section:'hook',texte_parle:'Script'}]},'Script',['script','0','texte_parle']],
  ['reel',{script:[],hashtags:['#old'],caption:{text:'Caption'}},'#old',['hashtags']],
  ['stories',{stories:[{text:'Story',sticker:{label:'Vote',options:['Oui','Non']}}]},'Oui / Non',['stories','0','sticker','options']],
  ['stories',{sequence:[{text:'Story'}]},'Story',['sequence','0','text']],
  ['carousel',{slides:[{title:'Titre',body:'Corps'}],caption:{body:'Caption'}},'Titre',['slides','0','title']],
  ['carousel_photo',{type:'carousel_photo',slides:[{overlay_text:'Overlay'}]},'Overlay',['slides','0','overlay_text']],
  ['carousel_mix',{type:'carousel_mix',slides:[{title:'Titre',body:'Corps'}]},'Titre',['slides','0','title']],
  ['post_instagram',{content:'Contenu',text:'legacy'},'Contenu',['content']],
  ['post_linkedin',{contenu:'Contenu'},'Contenu',['contenu']],
  [undefined,{titre:'Titre complet',description:'Description'},'Description',['description']],
  [undefined,{type:'crosspost',target_channel:'linkedin',version:{full_text:'LinkedIn'},source_id:'keep'},'LinkedIn',['full_text']],
 ];
 it.each(cases)('retains %s edits on failure, then accepts explicit empty fields (%s)',async(type,data,label,path)=>{
  const gate=deferred<ContentReceipt>();let confirmed=previewContent(data,undefined,type);const save=vi.fn().mockReturnValueOnce(gate.promise).mockImplementationOnce(async(e)=>{
   confirmed=structuredClone(confirmed);let node=confirmed;for(const key of e.path.slice(0,-1))node=node[key];node[e.path.at(-1)]=e.value;return receipt(confirmed);
  });
  render(<ContentPreview contentData={data} contentType={type} editable onContentChange={save}/>);
  edit(label,'');expect(save.mock.calls[0][0].path).toEqual(path);expect(screen.queryByText('✓ Modifié')).toBeNull();
  await act(async()=>gate.reject(new Error('Échec')));expect(screen.getByRole('textbox')).toHaveValue('');
  fireEvent.click(screen.getByRole('button',{name:'Réessayer'}));await screen.findByText('✓ Modifié');expect(screen.queryByRole('textbox')).toBeNull();
  expect(confirmed && path.reduce((n:any,k:string)=>n[k],confirmed)).toEqual(path.at(-1)==='options'||path.at(-1)==='hashtags'?[]:'');
 });
 it('does not let another field receipt overwrite an unsaved draft',async()=>{
  const gate=deferred<ContentReceipt>();const data={slides:[{title:'Titre',body:'Corps'}]};render(<ContentPreview contentData={data} editable onContentChange={()=>gate.promise}/>);
  edit('Titre','Titre enregistré');fireEvent.click(screen.getByText('Corps'));const inputs=screen.getAllByRole('textbox');fireEvent.change(inputs[1],{target:{value:'Brouillon conservé'}});
  await act(async()=>gate.resolve(receipt({slides:[{title:'Titre enregistré',body:'Corps'}]})));
  expect(screen.getByRole('textbox')).toHaveValue('Brouillon conservé');
 });
 it('isolates a closed/reopened preview from the old promise',async()=>{
  const gate=deferred<ContentReceipt>();const view=render(<ContentPreview key="A:1" contentData="A" editable onContentChange={()=>gate.promise}/>);
  edit('A','A ancien retour');view.rerender(<ContentPreview key="B:2" contentData="B" editable onContentChange={()=>gate.promise}/>);
  view.rerender(<ContentPreview key="A:3" contentData="A" editable onContentChange={()=>gate.promise}/>);
  await act(async()=>gate.resolve(receipt('A ancien retour')));expect(screen.getByText('A')).toBeTruthy();expect(screen.queryByText('✓ Modifié')).toBeNull();
 });
});

describe('Real IdeasPage callback, deferred persistence',()=>{
 function callback(){const source=readFileSync('src/pages/IdeasPage.tsx','utf8');const sf=ts.createSourceFile('IdeasPage.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let body='';
  function visit(n:ts.Node){if(ts.isJsxAttribute(n)&&n.name.getText(sf)==='onContentChange'&&n.initializer&&ts.isJsxExpression(n.initializer)&&n.initializer.expression)body=n.initializer.expression.getText(sf);ts.forEachChild(n,visit);}visit(sf);
  expect(body).toContain('savePreviewEdit');return ts.transpileModule('const apply = '+body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 }
 it.each(['same','B','closed','A-B-A','workspace','unmounted'])('reconciles only the captured visit: %s',async(scenario)=>{
  const a={id:'A',content_draft:'Contenu A'},b={id:'B',content_draft:'Contenu B'};let selected:any=a,ideas:any[]=[a,b];const visit={current:1},mounted={current:true};const gate=deferred<ContentReceipt>();const save=vi.fn((_target: any, _edit: any)=>gate.promise);
  const apply=new Function('savePreviewEdit','selectedIdea','visit','mounted','column','value','setIdeas','setSelectedIdea',callback()+';return apply;')(save,a,visit,mounted,'workspace_id','space-A',(fn:any)=>{ideas=fn(ideas)},(fn:any)=>{selected=fn(selected)});
  const saving=apply({path:[],before:'Contenu A',value:'Nouveau A'});
  if(scenario==='B'){visit.current++;selected=b;}if(scenario==='closed'){visit.current++;selected=null;}if(scenario==='A-B-A'){visit.current+=2;selected=a;}
  if(scenario==='workspace'||scenario==='unmounted'){mounted.current=false;selected=b;}
  gate.resolve({saved:true,content:'Nouveau A',row:{...a,content_draft:'Nouveau A'}});await saving;
  expect(save.mock.calls[0][0]).toMatchObject({id:'A',scope:{column:'workspace_id',value:'space-A'}});
  expect(selected).toEqual(scenario==='same'?{...a,content_draft:'Nouveau A'}:scenario==='closed'?null:scenario==='A-B-A'?a:b);
  expect(ideas[0].content_draft).toBe(mounted.current?'Nouveau A':'Contenu A');expect(ideas[1]).toEqual(b);
 });
});
