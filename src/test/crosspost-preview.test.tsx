import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('@/hooks/use-story-export', () => ({ useStoryExport: () => ({ hasFrames: false, frameCount: 0 }) }));
vi.mock('@/components/exports/StoryExportButtons', () => ({ StoryExportButtons: () => null }));
vi.mock('@/components/AiGeneratedMention', () => ({ default: () => null }));
import { ContentPreview } from '@/components/ContentPreview';
import { crosspostEnvelope } from '@/lib/crosspost-content';
import { resumeIdea } from '@/lib/resume-idea';
import { buildCalendarContent } from '@/features/creer/build-calendar-content';
const versions = {
  linkedin: { full_text: 'Post LinkedIn intégral' },
  instagram: { slides: [{ title: 'Titre slide', body: 'Corps slide' }], caption: { hook: 'Légende entière' } },
  reel: { script: 'Script parlé complet' },
  stories: { story_sequence: [{ text: 'Ma story complète', sticker: { type:'poll', label:'Ton choix', options:['Oui','Non'] } }] },
};
describe('saved idea and calendar rich previews', () => {
  it.each([
    ['linkedin','Post LinkedIn intégral','post'], ['instagram','Corps slide','carousel'],
    ['reel','Script parlé complet','reel'], ['stories','Ma story complète','story_serie'],
  ])('opens %s in idea -> editor -> calendar without generation', (key,text,format) => {
    const envelope=crosspostEnvelope({ versions },key,{ source_text: 'Source conservée', source_files: [{ bucket:'crosspost-sources',path:'workspace/a/file.pdf',name:'original.pdf' }] });
    const view=render(<ContentPreview contentData={envelope} contentType={key==='reel'?'reel':undefined} />);
    expect(screen.getByText(text, { exact: false })).toBeTruthy();
    expect(screen.getByText('original.pdf')).toBeTruthy();
    const restored=resumeIdea({ titre:'Sujet',format,content_data:envelope })!;
    const calendar=buildCalendarContent(restored.format,restored.raw);
    view.rerender(<ContentPreview contentData={calendar.storyDetail} />);
    expect(screen.getByText(text, { exact: false })).toBeTruthy();
    expect(calendar.storyDetail._crosspost.result.versions).toEqual(versions);
  });
  it('does not crash on a legacy Reel wrapper when the idea forces contentType=reel', () => {
    render(<ContentPreview contentType="reel" contentData={{type:'crosspost',target_channel:'reel',text:'Ancien script'}} />);
    expect(screen.getByText('Ancien script', { exact: false })).toBeTruthy();
  });
  it('keeps script edits and original independently across repeated saves', () => {
    const raw=resumeIdea({titre:'Sujet',format:'reel',content_data:crosspostEnvelope({versions},'reel',{})})!.raw;
    raw.script[0].texte_parle='Script corrigé';
    const calendar=buildCalendarContent('reel',raw);
    expect(calendar.contentDraft).toContain('Script corrigé');
    expect(calendar.storyDetail._crosspost.result.versions.reel.script).toBe('Script parlé complet');
    const reopened=resumeIdea({titre:'Sujet',format:'reel',content_data:calendar.storyDetail})!.raw;
    expect(reopened.script[0].texte_parle).toBe('Script corrigé');
  });
});
