/** Promote a mixed paragraph as one editable frame, retaining inline rich text.
 * Only normal inline text with the same font metrics is eligible; layout wrappers,
 * photos, badges and independently positioned children remain separate.
 */
export function promoteMixedText(doc: Document): void {
  const win = doc.defaultView;
  if (!win) return;
  for (const el of doc.body.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,div,li')) {
    if (el.closest('[data-pptx-editable]')) continue;
    if (!el.querySelector('[data-pptx-editable]')) continue;
    const ownText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent?.trim());
    if (!ownText) continue;
    const parent = win.getComputedStyle(el);
    if (!['block', 'list-item', 'inline'].includes(parent.display)) continue;
    const descendants = Array.from(el.querySelectorAll<HTMLElement>('*'));
    const compatible = descendants.every(child => {
      if (child.tagName === 'BR') return true;
      if (!['SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'A'].includes(child.tagName)) return false;
      const cs = win.getComputedStyle(child);
      return cs.display === 'inline' && cs.position === 'static' &&
        cs.fontSize === parent.fontSize && cs.fontFamily === parent.fontFamily &&
        cs.visibility === 'visible';
    });
    if (!compatible) continue;
    const kind = /^H[1-4]$/.test(el.tagName) ? 'title' : 'body';
    descendants.forEach(child => child.removeAttribute('data-pptx-editable'));
    el.setAttribute('data-pptx-editable', kind);
  }
}

export function charterFontUrl(fonts: Array<string | null | undefined>): string | null {
  const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|Arial|Helvetica|Georgia|Times New Roman|Courier New)$/i;
  const families = [...new Set(fonts.map(f => (f || '').split(',')[0].replace(/["']/g, '').trim()).filter(f => f && !generic.test(f)))];
  return families.length ? 'https://fonts.googleapis.com/css2?' + families.map(f => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800;900`).join('&') + '&display=swap' : null;
}
