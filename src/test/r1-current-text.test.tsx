import { describe, it, expect } from 'vitest';
import { newsletterFields, newsletterCopyText } from '@/lib/newsletter-copy';
import { buildCalendarContent } from '@/features/creer/build-calendar-content';
import { extractInstagramCaption, extractLinkedInText } from '@/features/creer/publish-guards';

describe('R1 current text survives explicit clearing', () => {
  it('does not restore the old newsletter body in preview or copy', () => {
    const raw={subject:'Objet R1',preview_text:'Aperçu',body:'Ancien corps',edited_text:''};
    expect(newsletterFields(raw).body).toBe('');
    expect(newsletterCopyText(raw)).toBe('Objet : Objet R1\n\nTexte d’aperçu : Aperçu');
  });
  it.each(['post','linkedin','newsletter','carousel'])('keeps an empty %s calendar draft', format => {
    expect(buildCalendarContent(format,{content:'Ancien',body:'Ancien corps',edited_text:''}).contentDraft).toBe('');
  });
  it('does not send old text to social output after clearing', () => {
    const raw={content:'Ancien',full_text:'Ancien LinkedIn',edited_text:''};
    expect(extractInstagramCaption(raw)).toBe('');
    expect(extractLinkedInText(raw)).toBe('');
  });
});
