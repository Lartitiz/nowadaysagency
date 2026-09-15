import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';
import ReelMontage from '@/components/creer/ReelMontage';
const mocks=vi.hoisted(()=>({submit:vi.fn(),poll:vi.fn(),archive:vi.fn(),suggest:vi.fn(),search:vi.fn()}));
vi.mock('@/hooks/use-branding',()=>({useBrandCharter:()=>({data:null})}));
vi.mock('@/lib/stock-videos',()=>({suggestStockKeywords:mocks.suggest,searchStockVideos:mocks.search}));
vi.mock('@/lib/reel-user-videos',()=>({listReelVideos:async()=>[{url:'https://clips.test/take.mp4',name:'Ma prise'}],loadVideoDuration:async()=>5,uploadReelVideo:vi.fn()}));
vi.mock('@/lib/reel-render',async()=>({...await vi.importActual('@/lib/reel-plan'),submitReelRender:mocks.submit,pollReelRender:mocks.poll,archiveReelMp4:mocks.archive}));
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
