import { describe, expect, it } from 'vitest';
import { resumeIdea } from '../lib/resume-idea';

describe('reprise des idées', () => {
  it('restaure le texte, les éditions et les visuels du carrousel sans génération', () => {
    const raw = { slides: [{ title: 'Lin français' }], edited_text: 'Ma correction', visual_html: [{ slide_number: 1, html: '<p>Lin</p>' }] };
    expect(resumeIdea({ titre: 'Lin', format: 'post_carrousel', content_data: raw })).toEqual({ format: 'carousel', raw });
  });
  it('restaure un contenu revenu du calendrier', () => {
    expect(resumeIdea({ titre: 'Lin', format: 'carousel', content_data: { content: 'Légende', story_sequence_detail: { slides: [{ title: 'Lin' }] } } })?.raw.slides).toEqual([{ title: 'Lin' }]);
  });
  it('ouvre le texte brut et les anciens JSON', () => {
    expect(resumeIdea({ titre: 'Lin', format: 'post', content_draft: 'Tissé à Lille' })?.raw.content).toBe('Tissé à Lille');
    expect(resumeIdea({ titre: 'Lin', format: 'post', content_draft: '{"content":"Lille"}' })?.raw.content).toBe('Lille');
  });
  it('une idée sans contenu reste une création', () => {
    expect(resumeIdea({ titre: 'Lin', format: 'post', content_data: {} })).toBeNull();
    expect(resumeIdea({ titre: 'Actu', format: 'actu', content_data: { titre: 'Actu' } })).toBeNull();
  });
});
