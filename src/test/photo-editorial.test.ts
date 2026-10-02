import { ensurePptxEditable } from "../../supabase/functions/_shared/verbatim-guard";
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { photoTextParts, photoEditorialMarkup } from "../../supabase/functions/_shared/photo-editorial";
import { prepareSlideHtml, patchElement, getEditorElements, positionPhotoText } from "@/lib/carousel-editor";
import { replaceSlideText } from "@/lib/carousel-html-edit";
const prose = "Pensez à ce souvenir : « la vaisselle de ma grand-mère ». Ce sont des objets de tous les jours. Leur charme vient des années de repas.";
function html(text = prose) { return `<div data-photo-text-layout="bottom_left"><div data-photo-editorial-text="profonde" data-slide-text="overlay" style="--photo-emphasis-size:56px;font-size:42px">${photoEditorialMarkup(text, false)}</div></div>`; }
const read = (markup: string) => new DOMParser().parseFromString(markup, "text/html");
describe("editorial photo typography", () => {
  it.each([prose, "Budget : 3.5 euros. Un autre choix.", "Un seul passage sans ponctuation", "Texte <script> & guillemets. Une fin utile !", "Premier paragraphe.\n\nSecond paragraphe.", "", "Deux phrases… Et une troisième ? Oui !"])("keeps exact source slices: %s", text => {
    for (const finale of [true, false]) {
      expect(photoTextParts(text, finale).map(p => p.text).join("")).toBe(text);
      expect(read(photoEditorialMarkup(text, finale)).body.textContent).toBe(text);
    }
  });
  it("promotes a real quote once, and the final sentence only on a conclusion", () => {
    expect(photoTextParts(prose).filter(p=>p.emphasis).map(p=>p.text)).toEqual(["« la vaisselle de ma grand-mère »."]);
    expect(photoTextParts(prose, true).filter(p=>p.emphasis)[0].text).toBe("Leur charme vient des années de repas.");
  });
  it("edits the whole source without losing remaining prose or the typographic structure", () => {
    const slide = { id:"1", html:prepareSlideHtml(html()), data:{overlay_text:prose} };
    const elements = getEditorElements(slide.html).filter(e=>e.kind==='text');
    expect(elements).toHaveLength(1);
    const next = "Une première idée.\nUn développement complet. Et une fin.";
    const changed = patchElement(slide, elements[0].id, {text:next});
    expect(changed.data.overlay_text).toBe(next);
    expect(read(changed.html).querySelector('[data-slide-text]')?.textContent).toBe(next);
    expect(read(changed.html).querySelectorAll('[data-photo-text-part]').length).toBeGreaterThan(1);
    expect(slide.data.overlay_text).toBe(prose);
  });
  it("preserves hierarchy through the other text-edit path and position controls", () => {
    const edited = replaceSlideText(html(), 'overlay', prose, "Une entrée claire. Une suite complète.")!;
    expect(read(edited).querySelectorAll('[data-photo-text-part]')).toHaveLength(2);
    const slide = positionPhotoText({id:'1',html:edited,data:{}}, 'center');
    expect(read(slide.html).querySelector<HTMLElement>('[data-photo-editorial-text]')?.style.textAlign).toBe('center');
  });
});

it('retains the local veil and scales emphasis when editing the source', () => {
  const source = html().replace('--photo-emphasis-size:56px', '--photo-emphasis-size:1.33em;--photo-veil:linear-gradient(black,transparent)');
  const slide={id:'1',html:prepareSlideHtml(source),data:{overlay_text:prose}};
  const element=getEditorElements(slide.html).find(e=>e.field==='overlay')!;
  const changed=patchElement(slide,element.id,{text:'Une autre phrase. Une suite différente.',styles:{left:'30px',color:'#ffdddd'}});
  const copy=read(changed.html).querySelector<HTMLElement>('[data-photo-editorial-text]')!;
  expect(copy.textContent).toBe('Une autre phrase. Une suite différente.');
  expect(copy.style.left).toBe('30px');
  expect(copy.style.getPropertyValue('--photo-heading')).toBe('#ffdddd');
  expect(copy.style.getPropertyValue('--photo-veil')).toBe('linear-gradient(black,transparent)');
  expect(copy.style.getPropertyValue('--photo-emphasis-size')).toBe('1.33em');
});

it('server export annotation keeps editorial frames separate, with exact AI-selected emphasis', () => {
  const source="La première phrase. Une deuxième idée à mettre en avant. Une fin.";
  const markup='<div data-photo-editorial-text="profonde" data-photo-emphasis="Une deuxième idée à mettre en avant." data-slide-text="overlay">'+photoEditorialMarkup(source,false,"Une deuxième idée à mettre en avant.")+'</div>';
  const guarded=ensurePptxEditable(markup,'overlay');
  const doc=read(guarded);
  expect(doc.querySelector('[data-slide-text]')?.hasAttribute('data-pptx-editable')).toBe(false);
  expect(doc.querySelector('[data-photo-text-part="emphasis"]')?.textContent).toBe('Une deuxième idée à mettre en avant.');
  expect(doc.querySelector('[data-slide-text]')?.textContent).toBe(source);
});

it("keeps the punctuation after an emphasis with it (no paragraph starting with ':' or ',')", () => {
  for (const [text, emphasis] of [
    ["Tout commence par le pétrissage de l'argile : un geste qui ne laisse aucune trace.", "Tout commence par le pétrissage de l'argile"],
    ["Vient ensuite le tournage. La forme naît entre les mains, au tour, et c'est là que tout se joue.", "La forme naît entre les mains, au tour"],
    ["Une seule laisse une trace : le carnet où je note chaque cuisson. La prochaine fois, pensez-y.", "le carnet où je note chaque cuisson"],
  ] as const) {
    const parts = photoTextParts(text, false, emphasis);
    expect(parts.map(p => p.text).join("")).toBe(text);
    for (const p of parts.filter(p => !p.emphasis)) expect(p.text).not.toMatch(/^[\s,;:.]/);
  }
});
