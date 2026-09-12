import { ideaFormatToCreerFormat, type IdeaForCalendar } from './idea-to-calendar';

/** Restore saved output without calling the generation endpoints. */
export function resumeIdea(idea: IdeaForCalendar) {
  let data: any = idea.content_data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (!data && idea.content_draft?.trim().startsWith('{')) {
    try { data = JSON.parse(idea.content_draft); } catch { /* plain draft below */ }
  }
  const format = ideaFormatToCreerFormat(idea.format);
  if (!format || format === 'actu') return null;
  let raw = data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length ? data : null;
  // Calendar → idea saves a wrapper around the original structured content.
  if (raw?.story_sequence_detail || raw?.carousel) {
    const detail = raw.story_sequence_detail || raw.carousel;
    raw = { ...raw, ...detail, ...(raw.content ? { edited_text: raw.content } : {}) };
  }
  if (!raw && idea.content_draft?.trim() && !/^[{[]/.test(idea.content_draft.trim())) {
    raw = { content: idea.content_draft, edited_text: idea.content_draft };
  }
  if (!raw) return null;
  if (format === 'carousel' && idea.updated_at !== undefined) raw = { ...raw, _carousel_base_updated_at: idea.updated_at };
  return { format, raw };
}
