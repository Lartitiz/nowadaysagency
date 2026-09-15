import { describe, expect, it } from 'vitest';
import { buildCalendarPostFromIdea } from '@/lib/idea-to-calendar';
import { resumeIdea } from '@/lib/resume-idea';

const raw = {
  carousel_type: 'mix', caption: { hook: 'Titre', body: '<p>Texte <strong>riche</strong></p>' },
  slides: [{ id: 's2', slide_type: 'text_only', title: 'Deux' }, { id: 's1', slide_type: 'photo_full', photo_index: 0 }],
  visual_urls: ['https://example.test/2.png', 'https://example.test/1.png'],
  photo_urls: ['https://example.test/original.png'], source_photo_ids: ['photo-id'],
  variants: [{ id: 'v1', content: 'Variante conservée' }], custom_metadata: { provenance: 'fixture R3' },
};

describe('R3 transfers preserve saved documents', () => {
  it('keeps generated media, variants and unknown metadata in calendar detail', () => {
    const source = structuredClone(raw);
    const post = buildCalendarPostFromIdea({ titre: 'R3', format: 'carousel', content_data: source });
    expect(post.story_sequence_detail).toMatchObject(raw);
    expect(post.media_urls).toEqual(raw.visual_urls);
    expect(source).toEqual(raw);
  });
  it('restores legacy structured JSON in content_draft just as resumeIdea does', () => {
    const idea = { titre: 'R3', format: 'carousel', content_draft: JSON.stringify(raw) };
    expect(resumeIdea(idea)?.raw.slides).toEqual(raw.slides);
    expect((buildCalendarPostFromIdea(idea).story_sequence_detail as any)?.slides).toEqual(raw.slides);
  });
  it('retains story timing when a calendar document is put back on a date', () => {
    const post = buildCalendarPostFromIdea({ titre: 'R3', format: 'story_serie', content_data: {
      story_sequence_detail: { type: 'stories', stories: [{ text: 'Un' }] }, stories_timing: '08:30',
    } });
    expect((post as any).stories_timing).toBe('08:30');
  });
  it('does not resurrect the saved caption when a wrapper draft is explicitly emptied', () => {
    const post = buildCalendarPostFromIdea({ titre: 'R3', format: 'post', content_draft: '', content_data: { content: 'Ancien texte', media_urls: raw.photo_urls } });
    expect(post.content_draft).toBe('');
    expect(resumeIdea({ titre: 'R3', format: 'post', content_draft: '', content_data: { content: 'Ancien texte' } })?.raw.edited_text).toBe('');
  });
});
