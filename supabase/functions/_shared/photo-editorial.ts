/** Exact source slices: no copywriting, duplicated pull quote or forced numbering. */
export interface PhotoTextPart { text: string; emphasis: boolean }
export function photoTextParts(text: string, finale = false, preferred?: string | null): PhotoTextPart[] {
  if (!text.trim()) return [{ text, emphasis: false }];
  const sentences = text.match(/[^.!?]+(?:[.!?]+[»”"']*(?:\s+|$)|$)/g);
  const safe = sentences && sentences.join("") === text ? sentences : [text];
  let start = -1, end = -1;
  const quote = /[«“][^»”\n]{12,150}[»”][.!?,;:]?/.exec(text);
  if (preferred && preferred.length <= 160 && text.includes(preferred) && text.indexOf(preferred) === text.lastIndexOf(preferred)) { start = text.indexOf(preferred); end = start + preferred.length; }
  else if (!finale && quote && quote.index < 100) { start = quote.index; end = start + quote[0].length; }
  else if (safe.length > 1) {
    const candidate = finale ? safe[safe.length - 1] : safe[0];
    if (candidate.trim().length >= 12 && candidate.trim().length <= 160) {
      start = finale ? text.length - candidate.length : 0;
      end = start + candidate.length;
    }
  }
  // La ponctuation qui suit l'extrait mis en valeur reste avec lui : sinon le
  // paragraphe suivant s'ouvrait sur « : », « , » ou « . » (vu en prod le 02/10/2026).
  if (start >= 0) {
    const tail = /^[\s\u00a0\u202f]*[,;:.!?…»”)]+[ \u00a0\u202f]*/.exec(text.slice(end));
    if (tail) end += tail[0].length;
    // Un extrait qui commence en milieu de phrase laissait le paragraphe
    // précédent finir sur « C'est » ou « , et » (vu en prod le 02/10/2026) :
    // on remonte au début de la phrase, tant que l'extrait reste lisible en grand.
    const before = text.slice(0, start);
    if (before.trim() && !/[.!?…:»”"'][\s\u00a0\u202f]*$/.test(before)) {
      const boundary = /[\s\S]*[.!?…:][»”"']*[\s\u00a0\u202f]+/.exec(before);
      const sentenceStart = boundary ? boundary[0].length : 0;
      if (end - sentenceStart <= 220) start = sentenceStart;
    }
  }
  const parts: PhotoTextPart[] = [];
  const body = (s: string) => {
    const sentences = s.match(/[^.!?]+(?:[.!?]+[»”"']*(?:\s+|$)|$)/g);
    const chunks = sentences && sentences.join("") === s ? sentences : [s];
    let paragraph = "";
    for (const chunk of chunks) {
      paragraph += chunk;
      if (paragraph.trim().length >= 125 || /\n/.test(chunk)) {
        parts.push({ text: paragraph, emphasis: false }); paragraph = "";
      }
    }
    if (paragraph) parts.push({ text: paragraph, emphasis: false });
  };
  if (start >= 0) {
    body(text.slice(0, start));
    parts.push({ text: text.slice(start, end), emphasis: true });
    body(text.slice(end));
  } else body(text);
  return parts.length ? parts : [{ text, emphasis: false }];
}
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** One editable source wrapper, independently measured native PPTX fragments. */
export function photoEditorialMarkup(text: string, finale: boolean, preferred?: string | null): string {
  return photoTextParts(text, finale, preferred).map((part, i) =>
    `<span data-photo-text-part="${part.emphasis ? "emphasis" : "body"}" data-pptx-editable="overlay" style="position:relative;display:block;white-space:pre-wrap;overflow-wrap:anywhere;${i ? "margin-top:18px;" : ""}${part.emphasis ? "font-family:var(--photo-title-font);font-size:var(--photo-emphasis-size);line-height:1.12;color:var(--photo-heading);" : ""}">${escape(part.text)}</span>`
  ).join("");
}
