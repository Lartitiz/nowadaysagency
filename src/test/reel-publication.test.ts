import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { instagramPublishDisabledReason, extractInstagramCaption } from '@/features/creer/publish-guards';
import { isDurableReelUrl, reelSourceKey } from '@/lib/reel-publication';
const video = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/calendar-media/reels-montes/u1/reel.mp4`;
const raw = { sections:[{texte_parle:'Script',texte_overlay:'Overlay',timing:'0-3 sec'}],caption:{text:'Ma légende',cta:'Et toi ?'},hashtags:['#atelier'] };
function handler(overrides: Record<string,unknown>={}) {
 const source = readFileSync('src/pages/CreerUnifie.tsx','utf8');
 const sf = ts.createSourceFile('creator.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let code='';
 function visit(n:ts.Node) { if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='handlePublishInstagram') code=n.initializer!.getText(sf);ts.forEachChild(n,visit); }visit(sf);
 const deps = {
  instagramInFlight:{current:false},reelScope:'workspace-A:creation-A',activeReelScope:{current:'workspace-A:creation-A'},
  session:{user:{id:'u1'}},publishInstagramDisabledReason:null,carouselCloudEnabled:false,
  extractInstagramCaption,result:{raw},selectedFormat:'reel',reelMp4Url:video,workspaceId:'workspace-A',
  isCarouselPublish:false, publishableImageUrl:'https://example.test/cover.jpg',
  publishReelToInstagram:vi.fn().mockResolvedValue({postId:'ig-1'}),
  publishImageToInstagram:vi.fn(),publishRenderedCarouselToInstagram:vi.fn(),
  recordImmediatePublication:vi.fn().mockResolvedValue(true),setPublishingInstagram:vi.fn(),
  toast:{error:vi.fn(),info:vi.fn(),success:vi.fn()}, ...overrides,
 };
 const js=ts.transpileModule('const run='+code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return {run:new Function(...Object.keys(deps),js+'; return run;')(...Object.values(deps)),deps};
}
describe('A3 corrected creator publication behavior',()=>{
 it('cover alone, no video, temporary renderer, signed or wrong-domain URL cannot authorize a Reel',()=>{
  for(const value of [null,'blob:video','https://renderer.test/video.mp4',video+'?token=x',video.replace(new URL(video).hostname,'other.test')]) {
   expect(isDurableReelUrl(value)).toBe(false);
   expect(instagramPublishDisabledReason({selectedFormat:'reel',isCarousel:false,visualSlidesCount:0,publishableImageUrl:'https://cover.test/a.jpg',reelMp4Url:value})).toContain('MP4');
  }
  expect(instagramPublishDisabledReason({selectedFormat:'reel',isCarousel:false,visualSlidesCount:0,publishableImageUrl:null,reelMp4Url:video})).toBeNull();
 });
 it('real creator handler sends video, full caption and space/account; tracks success only after response',async()=>{
  let finish!:(r:any)=>void;const gate=new Promise(r=>finish=r);
  const {run,deps}=handler({publishReelToInstagram:vi.fn(()=>gate)});
  const pending=run();await run();
  expect(deps.publishReelToInstagram).toHaveBeenCalledTimes(1);
  expect(deps.publishReelToInstagram).toHaveBeenCalledWith({videoUrl:video,caption:'Ma légende\n\nEt toi ?\n\n#atelier',workspaceId:'workspace-A',userId:'u1'});
  expect(deps.publishImageToInstagram).not.toHaveBeenCalled();expect(deps.recordImmediatePublication).not.toHaveBeenCalled();
  finish({postId:'ig-1'});await pending;
  expect(deps.recordImmediatePublication).toHaveBeenCalledWith({canal:'instagram',caption:'Ma légende\n\nEt toi ?\n\n#atelier',postId:'ig-1'});
 });
 it('guard is also enforced on action; errors do not record a success',async()=>{
  const blocked=handler({publishInstagramDisabledReason:'MP4 manquant'});await blocked.run();expect(blocked.deps.publishReelToInstagram).not.toHaveBeenCalled();
  const failed=handler({publishReelToInstagram:vi.fn().mockRejectedValue(new Error('Résultat incertain'))});await failed.run();
  expect(failed.deps.recordImmediatePublication).not.toHaveBeenCalled();expect(failed.deps.toast.success).not.toHaveBeenCalled();expect(failed.deps.toast.error).toHaveBeenCalledWith('Résultat incertain');
 });
 it.each(['workspace-B:creation-A','workspace-A:creation-B','unmounted'])('late confirmation does not change the new editor %s',async target=>{
  let finish!:(r:any)=>void;const gate=new Promise(r=>finish=r);const {run,deps}=handler({publishReelToInstagram:vi.fn(()=>gate)});
  const pending=run();deps.activeReelScope.current=target;finish({postId:'ig-old'});await pending;
  expect(deps.recordImmediatePublication).toHaveBeenCalledWith(expect.objectContaining({postId:'ig-old'}));
  expect(deps.toast.success).not.toHaveBeenCalled();expect(deps.setPublishingInstagram).not.toHaveBeenCalledWith(false);
 });
 it('caption edits retain render identity, script/timing/overlay edits invalidate it',()=>{
  expect(reelSourceKey({...raw,caption:{text:'edited'}})).toBe(reelSourceKey(raw));
  for(const field of ['texte_parle','texte_overlay','timing']) expect(reelSourceKey({...raw,sections:[{...raw.sections[0],[field]:'changed'}]})).not.toBe(reelSourceKey(raw));
 });
});
