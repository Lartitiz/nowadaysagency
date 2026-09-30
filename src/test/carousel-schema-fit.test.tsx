import { beforeEach, expect, it, vi } from "vitest";
import { fitGeneratedSchemaSlides, fitSchemaDocument } from "../lib/carousel-schema-fit";
import { hasClippedElement } from "../lib/carousel-quality";
vi.mock("../lib/carousel-quality", () => ({ hasClippedElement: vi.fn() }));
const clipped = vi.mocked(hasClippedElement);
beforeEach(() => {
  clipped.mockReset();
  document.body.innerHTML = '<div style="display:flex;flex-direction:column;width:1080px;height:1350px;padding:80px;background:#123456"><h1 style="font-size:58px;margin-bottom:56px">Titre complet</h1><div data-pptx-shape="card" style="padding:36px"><p style="font-size:38px;line-height:1.6">Détail et relation conservés</p></div></div>';
  vi.spyOn(document.body.firstElementChild!, "getBoundingClientRect").mockReturnValue({ width:1080,height:1350,left:0,top:0,right:1080,bottom:1350,x:0,y:0,toJSON(){} });
});
it("compacts spacing only after overflow, with text, fonts and relationships unchanged", () => {
  const text = document.body.textContent;
  clipped.mockReturnValueOnce(true).mockReturnValue(false);
  expect(fitSchemaDocument(document)).toBe(true);
  expect(document.body.textContent).toBe(text);
  expect(document.querySelector('p')!.style.fontSize).toBe('38px');
  expect(document.querySelector('[data-pptx-shape="card"]')).not.toBeNull();
  expect(document.querySelector('h1')!.style.marginBottom).toBe('42px');
});
it("leaves a fitting composition untouched", () => {
  const html = document.body.innerHTML; clipped.mockReturnValue(false);
  expect(fitSchemaDocument(document)).toBe(false); expect(document.body.innerHTML).toBe(html);
});
it("restores the exact original styles if all measured candidates still overflow", () => {
  const html = document.body.innerHTML; clipped.mockReturnValue(true);
  expect(fitSchemaDocument(document)).toBe(false); expect(document.body.innerHTML).toBe(html);
});
it("does not move positioned text blindly", () => {
  document.querySelector('h1')!.style.position = 'absolute';
  document.querySelector('h1')!.setAttribute('data-slide-text','title');
  const html = document.body.innerHTML; clipped.mockReturnValue(true);
  expect(fitSchemaDocument(document)).toBe(false); expect(document.body.innerHTML).toBe(html);
});
it("skips ordinary, locked, raw and photo slides without creating a frame", async () => {
  const slides = Array.from({length:4},()=>({html:'original'}));
  const source = [{}, {visual_schema:{},editor_locked:true}, {visual_schema:{},no_overlay:true}, {visual_schema:{},slide_type:'photo_full'}];
  expect(await fitGeneratedSchemaSlides(slides,source)).toEqual(slides);
  expect(document.querySelector('iframe')).toBeNull();
});
