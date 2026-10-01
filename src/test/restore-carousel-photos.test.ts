// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { restoreCarouselPhotos, savedCarouselPhotoSources } from "@/lib/restore-carousel-photos";
const a = 'data:image/png;base64,YQ==';
const b = 'data:image/jpeg;base64,Yg==';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('restores actual photo layers once, including edited backgrounds, and excludes logos and scripts', async () => {
  const slides = [{html:`<img src="https://example.com/logo.png"><img data-pptx-photo="5" src="${a}"><script>throw 1</script>`},
    {html:`<div data-editor-photo style="background-image:url('${b}')"></div><img data-pptx-photo="1" src="${a}">`}];
  expect(savedCarouselPhotoSources(slides)).toEqual([a,b]);
  const result = await restoreCarouselPhotos(slides);
  expect(result.map(p=>p.base64)).toEqual([a,b]);
  expect(result.map(p=>p.mimeType)).toEqual(['image/png','image/jpeg']);
});
it('does not use stale blob links or placeholders as photo evidence', () => {
  expect(savedCarouselPhotoSources([{html:'<img data-pptx-photo="1" src="{{PHOTO_1}}"><img data-editor-photo src="blob:expired">'}])).toEqual([]);
});
it('fails the entire recovery on a missing remote photo', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('',{status:404}));
  vi.stubGlobal('fetch', fetcher);
  await expect(restoreCarouselPhotos([{html:`<img data-pptx-photo src="${a}"><img data-pptx-photo src="https://example.com/photo.jpg">`}])).rejects.toThrow('Photo inaccessible');
  expect(fetcher.mock.calls[0][1].credentials).toBe('omit');
});
it('bounds a hung image read and aborts it', async () => {
  vi.useFakeTimers(); const fetcher = vi.fn((_url: string, _options: RequestInit)=>new Promise(()=>{})); vi.stubGlobal('fetch',fetcher);
  const pending=expect(restoreCarouselPhotos([{html:'<img data-pptx-photo src="https://example.com/photo.jpg">'}])).rejects.toThrow('interrompu');
  await vi.advanceTimersByTimeAsync(15000); await pending;
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});
