import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { reelCalendarCaption } from '../../supabase/functions/_shared/reel-caption';

function calendarHandler(draft: string) {
  const source = readFileSync('src/components/calendar/CalendarPostDialog.tsx', 'utf8');
  const file = ts.createSourceFile('CalendarPostDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handlePublishInstagram') callback = node.initializer!.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const previous = {type:'reel', script:[{section:'hook',timing:'0-3',texte_parle:'Script conservé'}],caption:{text:'Ancienne légende',cta:'Question'},hashtags:['#atelier']};
  const deps = {
    user:{id:'user-A'},workspaceId:'workspace-A',instagramPublishDisabledReason:null,
    igVideo:'https://project.test/storage/v1/object/public/calendar-media/video.mp4',igValidImages:[],
    contentDraft:draft,theme:'Mon Reel',editingPost:{story_sequence_detail:previous},
    savedPreviewContent:{...previous,caption:{text:'Légende enregistrée dans le viewer',cta:'Nouvelle question'}},
    reelCalendarCaption,publishReelToInstagram:vi.fn().mockResolvedValue({postId:'post-A'}),
    publishToInstagram:vi.fn(),markPostPublished:vi.fn(),setPublishingInstagram:vi.fn(),
    toast:{info:vi.fn(),success:vi.fn(),error:vi.fn()},isNotConnectedError:()=>false,friendlyError:String,
  };
  const code=ts.transpileModule('const run='+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return {deps,run:new Function(...Object.keys(deps),code+';return run;')(...Object.values(deps))};
}

describe('cross-lot calendar caption after a confirmed structured edit',()=>{
  it('publishes the freshly reconciled caption, never the stale parent copy or generated script',async()=>{
    const {run,deps}=calendarHandler('[0-3] HOOK\nScript conservé');
    await run();
    expect(deps.publishReelToInstagram).toHaveBeenCalledWith(expect.objectContaining({caption:'Légende enregistrée dans le viewer\n\nNouvelle question\n\n#atelier',workspaceId:'workspace-A',userId:'user-A',videoUrl:deps.igVideo}));
    expect(deps.publishToInstagram).not.toHaveBeenCalled();
    expect(deps.markPostPublished).toHaveBeenCalledWith('post-A');
  });
  it('preserves a caption explicitly edited in the calendar text field',async()=>{
    const {run,deps}=calendarHandler('Texte personnalisé à publier');
    await run();
    expect(deps.publishReelToInstagram).toHaveBeenCalledWith(expect.objectContaining({caption:'Texte personnalisé à publier'}));
  });
});
