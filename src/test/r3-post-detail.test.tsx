import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContentPreview } from '@/components/ContentPreview';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/use-story-export', () => ({ useStoryExport: () => ({ hasFrames: false }) }));
vi.mock('@/components/exports/StoryExportButtons', () => ({ StoryExportButtons: () => null }));
const current = 'QA POST — Texte retouché.\nDeuxième ligne conservée.';
const raw = { format: 'caption_photo', content: 'Ancien texte généré', edited_text: current,
  accroche: 'Ancienne accroche', pillar: 'Pilier interne', objectif: 'confiance', _source_id: 'source-private',
  _photo_refs: [{ id: 'photo-qa', storagePath: 'private-photo-path' }] };
afterEach(cleanup);

describe('Actual idea detail ContentPreview for photo captions and posts', () => {
  it.each([undefined, 'post', 'caption_photo'])('renders only current text with format %s, no technical fields', (contentType) => {
    const { container } = render(<ContentPreview contentData={raw} contentType={contentType} contentDraft={JSON.stringify(raw)} />);
    expect(screen.getByText(current, { exact: true, normalizer: (s) => s })).toBeTruthy();
    for (const hidden of ['Ancien texte généré', 'Ancienne accroche', 'Pilier interne', 'confiance', 'source-private', 'caption_photo', 'edited text', 'content']) {
      expect(container.textContent).not.toContain(hidden);
    }
  });
  it.each([false, true])('honours explicit empty edit without exposing original text or metadata, editable=%s', (editable) => {
    const { container } = render(<ContentPreview contentData={{ ...raw, edited_text: '' }} editable={editable} onContentChange={vi.fn()} />);
    for (const hidden of ['Ancien texte généré', 'Ancienne accroche', 'Pilier interne', 'confiance', 'source-private', 'caption_photo', 'edited text', 'content']) {
      expect(container.textContent).not.toContain(hidden);
    }
    expect(container.textContent).not.toContain(current);
    if (editable) expect(screen.getByRole('button', { name: 'Cliquer pour éditer' })).toBeTruthy();
  });
  it('reads historical serialized photo content through the same real preview', () => {
    render(<ContentPreview contentData={null} contentDraft={JSON.stringify(raw)} />);
    expect(screen.getByText(current, { exact: true, normalizer: (s) => s })).toBeTruthy();
    expect(screen.queryByText('Ancien texte généré')).toBeNull();
  });
  it('shows an unedited post text without rendering its internal fields', () => {
    const { edited_text, ...original } = raw;
    const { container } = render(<ContentPreview contentData={original} />);
    expect(screen.getByText('Ancien texte généré')).toBeTruthy();
    expect(container.textContent).not.toContain('Pilier interne');
    expect(container.textContent).not.toContain('caption_photo');
  });
  it('keeps an explicit empty original post empty in read-only mode', () => {
    const { container } = render(<ContentPreview contentType="post" contentData={{ content: '', _source_id: 'hidden-source' }} />);
    expect(container.textContent).not.toContain('hidden-source');
  });
  it('edits the current text only, preserves raw fields in the receipt, then reopens the confirmed value', async () => {
    let stored = structuredClone(raw);
    const save = vi.fn(async (edit) => {
      expect(edit).toMatchObject({ path: ['edited_text'], before: current, value: 'Après édition' });
      stored = { ...stored, edited_text: edit.value };
      return { saved: true as const, content: stored, row: { id: 'qa-post', content_data: stored } };
    });
    const view = render(<ContentPreview key="one" contentData={raw} editable onContentChange={save} />);
    fireEvent.click(screen.getByText(current, { exact: true, normalizer: (s) => s }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Après édition' } });
    fireEvent.blur(screen.getByRole('textbox'));
    await screen.findByText('✓ Modifié');
    expect(save).toHaveBeenCalledTimes(1);
    expect(stored.content).toBe(raw.content);
    expect(stored._photo_refs).toEqual(raw._photo_refs);
    view.rerender(<ContentPreview key="two" contentData={stored} />);
    expect(screen.getByText('Après édition')).toBeTruthy();
    expect(screen.queryByText(raw.content)).toBeNull();
  });
});
