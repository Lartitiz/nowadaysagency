/** The free-text editor owns the current SEO copy; an explicit empty edit is meaningful. */
export function pinterestCurrentText(raw: { title?: string; description?: string; edited_text?: unknown } | null | undefined) {
  if (typeof raw?.edited_text !== 'string') {
    const title = raw?.title || '';
    const description = raw?.description || '';
    return { title, description, copy: `${title}\n\n${description}` };
  }
  const copy = raw.edited_text;
  // These labels are emitted by the existing Pinterest editor. Without labels,
  // keep the whole edit as the description instead of reviving old SEO fields.
  const sections = copy.match(/^(?:📌\s*)?TITRE\s*:[ \t]*\r?\n?([\s\S]*?)\r?\n\s*(?:📝\s*)?DESCRIPTION\s*:[ \t]*\r?\n?([\s\S]*)$/i);
  return sections
    ? { title: sections[1].trim(), description: sections[2], copy }
    : { title: '', description: copy, copy };
}
