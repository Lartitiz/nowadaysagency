import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';
import ReelMontage, { type ReelMontageProject } from '@/components/creer/ReelMontage';
const mocks=vi.hoisted(()=>({submit:vi.fn(),poll:vi.fn(),archive:vi.fn(),suggest:vi.fn(),search:vi.fn()}));
vi.mock('@/hooks/use-branding',()=>({useBrandCharter:()=>({data:null})}));
vi.mock('@/lib/stock-videos',()=>({suggestStockKeywords:mocks.suggest,searchStockVideos:mocks.search}));
vi.mock('@/lib/reel-user-videos',()=>({listReelVideos:async()=>[{url:'https://clips.test/take.mp4',name:'Ma prise'}],loadVideoDuration:async()=>5,uploadReelVideo:vi.fn()}));
vi.mock('@/lib/reel-render',async()=>({...await vi.importActual('@/lib/reel-plan'),submitReelRender:mocks.submit,pollReelRender:mocks.poll,archiveReelMp4:mocks.archive}));
vi.mock('@/features/studio-video/StudioVideoPanel',()=>({StudioVideoPanel:({onPickClip}:{onPickClip?:(job:{id:string;video_url:string;duration:number;source_name:string})=>void})=>
 <button onClick={()=>onPickClip?.({id:'studio-job',video_url:'https://clips.test/studio.mp4',duration:5,source_name:'Atelier'})}>Tester le clip Studio</button>}));
const sections=[{section:'hook',texte_parle:'Mon texte',texte_overlay:'Overlay',timing:'0-3 sec'}];
const video=`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/calendar-media/reels-montes/u1/reel.mp4`;
beforeEach(()=>{vi.clearAllMocks();mocks.submit.mockResolvedValue('project');mocks.poll.mockResolvedValue('https://renderer.test/temp.mp4');mocks.archive.mockResolvedValue(video);});
async function setup() {
 const onMp4Ready=vi.fn();const view=render(<ReelMontage sections={sections} onMp4Ready={onMp4Ready}/>);
 fireEvent.click(screen.getByRole('button',{name:/Je me filme/}));
 await waitFor(()=>expect(screen.getByLabelText('Reprendre une de mes vidéos')).toBeTruthy());
 fireEvent.change(screen.getByLabelText('Reprendre une de mes vidéos'),{target:{value:'https://clips.test/take.mp4'}});
 await waitFor(()=>expect(screen.getByText(/Ma vidéo · Ma prise/)).toBeTruthy());
 return {...view,onMp4Ready};
}
it('archived MP4 reaches publication only after archive; edited script keeps takes and download but invalidates publication',async()=>{
 const {rerender,onMp4Ready}=await setup();
 fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await waitFor(()=>expect(onMp4Ready).toHaveBeenLastCalledWith(video));
 expect(mocks.submit.mock.calls[0][0]).toMatchObject({mode:'filme'});
 expect(screen.getByRole('link')).toHaveAttribute('href',video);
 rerender(<ReelMontage sections={[{...sections[0],texte_overlay:'Changed'}]} onMp4Ready={onMp4Ready}/>);
 await waitFor(()=>expect(onMp4Ready).toHaveBeenLastCalledWith(null));
 expect(screen.getByText(/Ma vidéo · Ma prise/)).toBeTruthy();expect(screen.getByRole('link')).toHaveAttribute('href',video);
 expect(screen.getByText(/montage précédent/)).toBeTruthy();
});
it('failed archive retains temporary download but never authorizes publishing',async()=>{
 mocks.archive.mockRejectedValue(new Error('offline'));const {onMp4Ready}=await setup();
 fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await waitFor(()=>expect(screen.getByText(/Pas rangée dans ta bibliothèque/)).toBeTruthy());
 expect(onMp4Ready).toHaveBeenLastCalledWith(null);expect(onMp4Ready).not.toHaveBeenCalledWith(video);
 expect(screen.getByRole('link')).toHaveAttribute('href','https://renderer.test/temp.mp4');
});
it.each(['edit','unmount'])('late MP4 cannot attach after %s',async change=>{
 let finish!:(s:string)=>void;mocks.archive.mockImplementation(()=>new Promise(r=>finish=r));
 const {rerender,unmount,onMp4Ready}=await setup();fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await waitFor(()=>expect(mocks.archive).toHaveBeenCalled());
 if(change==='edit') rerender(<ReelMontage sections={[{...sections[0],texte_parle:'New'}]} onMp4Ready={onMp4Ready}/>);else unmount();
 await act(async()=>{finish(video);});expect(onMp4Ready).not.toHaveBeenCalledWith(video);
});

it('keeps the previous download when a second render fails', async () => {
 const {onMp4Ready}=await setup();
 fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await waitFor(()=>expect(onMp4Ready).toHaveBeenLastCalledWith(video));
 mocks.submit.mockRejectedValueOnce(new Error('R2 simulated renderer failure'));
 fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await screen.findByText('R2 simulated renderer failure');
 expect(screen.getByRole('link')).toHaveAttribute('href',video);
 expect(screen.getByText(/Ma vidéo · Ma prise/)).toBeTruthy();
 expect(onMp4Ready).toHaveBeenLastCalledWith(null);
});
it('finishes the initial stock search after changing mode and returning without a paid retry',async()=>{
 let finish!:(value:unknown)=>void;
 mocks.suggest.mockImplementation(()=>new Promise(r=>finish=r));
 mocks.search.mockResolvedValue([{id:22,url:'https://clips.test/stock.mp4',thumbnail:'https://clips.test/thumb.jpg',duration:5}]);
 render(<ReelMontage sections={sections}/>);
 fireEvent.click(screen.getByRole('button',{name:/Je ne me montre pas/}));
 await waitFor(()=>expect(mocks.suggest).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByRole('button',{name:'Changer'}));
 fireEvent.click(screen.getByRole('button',{name:/Je me filme/}));
 fireEvent.click(screen.getByRole('button',{name:'Changer'}));
 fireEvent.click(screen.getByRole('button',{name:/Je ne me montre pas/}));
 await act(async()=>finish({keywords:['atelier'],primary:'atelier'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Clip sélectionné'})).toBeTruthy());
 expect(mocks.suggest).toHaveBeenCalledOnce();
});
it('retries only archiving the completed render without submitting or polling again',async()=>{
 mocks.archive.mockRejectedValueOnce(new Error('archive unavailable'));
 const {onMp4Ready}=await setup();fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await screen.findByText(/Pas rangée dans ta bibliothèque/);
 fireEvent.click(screen.getByRole('button',{name:'Ranger cette vidéo'}));
 await waitFor(()=>expect(onMp4Ready).toHaveBeenLastCalledWith(video));
 expect(mocks.archive).toHaveBeenCalledTimes(2);expect(mocks.submit).toHaveBeenCalledOnce();expect(mocks.poll).toHaveBeenCalledOnce();
});
it.each(['edit','unmount'])('late archive retry is ignored after %s',async change=>{
 mocks.archive.mockRejectedValueOnce(new Error('archive unavailable'));
 const {onMp4Ready,rerender,unmount}=await setup();fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await screen.findByText(/Pas rangée dans ta bibliothèque/);
 let finish!:(url:string)=>void;mocks.archive.mockImplementation(()=>new Promise(r=>finish=r));
 fireEvent.click(screen.getByRole('button',{name:'Ranger cette vidéo'}));
 if(change==='edit')rerender(<ReelMontage sections={[{...sections[0],texte_parle:'Changed'}]} onMp4Ready={onMp4Ready}/>);else unmount();
 await act(async()=>finish(video));expect(onMp4Ready).not.toHaveBeenCalledWith(video);
});
it('offers a separate tab if CORS blocks download and keeps the montage visible',async()=>{
 const {onMp4Ready}=await setup();fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 await waitFor(()=>expect(onMp4Ready).toHaveBeenLastCalledWith(video));
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('CORS')));
 fireEvent.click(screen.getByRole('link',{name:'Télécharger le MP4'}));
 const fallback=await screen.findByRole('link',{name:'Ouvrir le MP4 dans un nouvel onglet'});
 expect(fallback).toHaveAttribute('target','_blank');expect(fallback).toHaveAttribute('rel','noopener noreferrer');
 expect(screen.getByText(/Ma vidéo · Ma prise/)).toBeTruthy();
 vi.unstubAllGlobals();
});
it('refuses to use a silent Studio clip as the voice-bearing face-camera take',async()=>{
 const project: ReelMontageProject={version:1,sectionTexts:['Mon texte'],montageMode:'filme',voiceMode:'recorded',
  clips:[{id:'studio-job',studioJobId:'job',url:'https://clips.test/studio.mp4',thumbnail:null,duration:5,source:'studio',label:'Atelier',seek:0}],
  cutaways:[null],voiceClips:[null]};
 render(<ReelMontage sections={sections} initialProject={project}/>);
 await act(async()=>{await Promise.resolve();});
 expect(screen.getByRole('alert')).toHaveTextContent(/Un clip du Studio est muet/);
 fireEvent.click(screen.getByRole('button',{name:'Assembler mon reel'}));
 expect(mocks.submit).not.toHaveBeenCalled();
});
it('chooses a Studio clip for one Reel passage and keeps its editable association',async()=>{
 mocks.suggest.mockResolvedValue({keywords:['atelier'],primary:'atelier'});
 mocks.search.mockResolvedValue([]);
 const project: ReelMontageProject={version:1,sectionTexts:['Mon texte'],montageMode:'cache',voiceMode:'silent',
  clips:[{id:'stock',url:'https://clips.test/stock.mp4',thumbnail:null,duration:5,source:'stock',label:'Fond',seek:0}],
  cutaways:[null],voiceClips:[null]};
 const onProjectChange=vi.fn();
 render(<ReelMontage sections={sections} workspaceId='space' initialProject={project} onProjectChange={onProjectChange}/>);
 fireEvent.click(screen.getByRole('button',{name:'Choisir un clip du Studio'}));
 fireEvent.click(await screen.findByRole('button',{name:'Tester le clip Studio'}));
 expect(await screen.findByText(/Prévisualisation pour ce passage/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Insérer dans ce passage'}));
 await waitFor(()=>expect(onProjectChange).toHaveBeenCalledWith(expect.objectContaining({
  cutaways:[expect.objectContaining({jobId:'studio-job',duration:3,start:0})],
  clips:[expect.objectContaining({id:'stock'})],
 })));
});
