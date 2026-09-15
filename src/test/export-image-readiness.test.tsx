import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportImageError, waitForExportImages } from '@/lib/export-image-readiness';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML=''; });
function imageMock(outcome: 'load' | 'error' | 'pending' | 'decode-error') {
  const requested: string[]=[];
  class ImageMock {
    naturalWidth=100; naturalHeight=200; onload: (()=>void)|null=null; onerror:(()=>void)|null=null;
    decode=() => outcome==='decode-error' ? Promise.reject(new Error('decode')) : Promise.resolve();
    set src(url: string) { requested.push(url); queueMicrotask(()=>outcome==='error' ? this.onerror?.() : outcome!=='pending' && this.onload?.()); }
  }
  vi.stubGlobal('Image',ImageMock);return requested;
}
describe('export requires all source images',()=>{
  it('waits for img and CSS background resources, preserving relative URLs',async()=>{
    const urls=imageMock('load');document.body.innerHTML='<img src="/photo.jpg"><div style="background-image:url(/fond.jpg)"></div>';
    await waitForExportImages(document.body);
    expect(urls).toEqual([new URL('/photo.jpg',document.baseURI).href,new URL('/fond.jpg',document.baseURI).href]);
  });
  it.each(['error','decode-error'] as const)('rejects an image %s instead of an apparently complete export',async kind=>{
    imageMock(kind);document.body.innerHTML='<img src="/missing.jpg">';
    await expect(waitForExportImages(document.body)).rejects.toBeInstanceOf(ExportImageError);
  });
  it('bounds a pending image and keeps the source DOM unchanged',async()=>{
    vi.useFakeTimers();imageMock('pending');document.body.innerHTML='<img src="/slow.jpg">';const before=document.body.innerHTML;
    const checked=expect(waitForExportImages(document.body,50)).rejects.toThrow('image');
    await vi.advanceTimersByTimeAsync(50);await checked;expect(document.body.innerHTML).toBe(before);
  });
  it('does not require an image when the slide has only text',async()=>{
    const urls=imageMock('error');document.body.innerHTML='<h1>Texte entier</h1>';
    await waitForExportImages(document.body);expect(urls).toEqual([]);
  });
});
