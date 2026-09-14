import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
const persistence=vi.hoisted(()=>({read:vi.fn(),save:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/content-preview-save',async importOriginal=>({...await importOriginal<any>(),readPreviewRow:persistence.read,savePreviewEdit:persistence.save}));
vi.mock('@/hooks/use-story-export',()=>({useStoryExport:()=>({hasFrames:false})}));
vi.mock('@/components/exports/StoryExportButtons',()=>({StoryExportButtons:()=>null}));
vi.mock('@/components/crosspost/CrosspostSources',()=>({default:()=>null}));
import { SavedContentPreview } from '@/components/SavedContentPreview';
const target={table:'calendar_posts' as const,id:'A',scope:{column:'workspace_id',value:'space-A'}};
const row=(text:string)=>({id:'A',story_sequence_detail:{script:[{section:'hook',texte_parle:text,id:'section'}]}});
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('Calendar saved preview reloads authoritative data each visit',()=>{
 it('reads current data at open; success survives close/reopen without any parent refresh',async()=>{
  let stored=row('Texte serveur');persistence.read.mockImplementation(async()=>stored);persistence.save.mockImplementation(async()=>{stored=row('Texte corrigé');return {saved:true,content:stored.story_sequence_detail,row:stored}});
  const onSaved=vi.fn(),onLoaded=vi.fn();const view=render(<SavedContentPreview key="visit1" target={target} editable onSaved={onSaved} onLoaded={onLoaded}/>);
  await screen.findByText('Texte serveur');fireEvent.click(screen.getByText('Texte serveur'));fireEvent.change(screen.getByRole('textbox'),{target:{value:'Texte corrigé'}});fireEvent.blur(screen.getByRole('textbox'));await screen.findByText('✓ Modifié');expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({row:stored}));
  view.rerender(<div/>);view.rerender(<SavedContentPreview key="visit2" target={target} editable onSaved={onSaved}/>);
  await screen.findByText('Texte corrigé');expect(onLoaded).toHaveBeenCalledWith(row('Texte serveur'));expect(persistence.read).toHaveBeenCalledTimes(2);expect(screen.queryByText('Texte serveur')).toBeNull();
 });
 it('offers retry for a failed read and never exposes an editable stale prop',async()=>{
  persistence.read.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(row('Récupéré'));
  render(<SavedContentPreview target={target} editable onSaved={vi.fn()}/>);await screen.findByRole('alert');expect(screen.queryByRole('textbox')).toBeNull();fireEvent.click(screen.getByText('Réessayer'));await screen.findByText('Récupéré');
 });
 it('does not send an old save receipt into a reopened viewer, and rereads it on the following visit',async()=>{
  const gate=deferred<any>();let stored=row('Texte serveur');persistence.read.mockImplementation(async()=>stored);persistence.save.mockReturnValueOnce(gate.promise);const onSaved=vi.fn();
  const view=render(<SavedContentPreview key="visit1" target={target} editable onSaved={onSaved}/>);await screen.findByText('Texte serveur');fireEvent.click(screen.getByText('Texte serveur'));fireEvent.change(screen.getByRole('textbox'),{target:{value:'Ancien retour'}});fireEvent.blur(screen.getByRole('textbox'));
  view.rerender(<SavedContentPreview key="visit2" target={target} editable onSaved={onSaved}/>);await screen.findByText('Texte serveur');stored=row('Ancien retour');await act(async()=>gate.resolve({saved:true,content:stored.story_sequence_detail,row:stored}));
  expect(onSaved).not.toHaveBeenCalled();expect(screen.getByText('Texte serveur')).toBeTruthy();expect(screen.queryByText('✓ Modifié')).toBeNull();
  view.rerender(<SavedContentPreview key="visit3" target={target} editable onSaved={onSaved}/>);await screen.findByText('Ancien retour');
 });
 it('ignores a delayed read after switching target and workspace',async()=>{
  const gate=deferred<any>();persistence.read.mockReturnValueOnce(gate.promise).mockResolvedValueOnce(row('Espace B'));
  const view=render(<SavedContentPreview key="A" target={target} editable onSaved={vi.fn()}/>);view.rerender(<SavedContentPreview key="B" target={{...target,id:'B',scope:{column:'workspace_id',value:'space-B'}}} editable onSaved={vi.fn()}/>);
  await screen.findByText('Espace B');await act(async()=>gate.resolve(row('Espace A')));expect(screen.getByText('Espace B')).toBeTruthy();expect(screen.queryByText('Espace A')).toBeNull();
 });
});
