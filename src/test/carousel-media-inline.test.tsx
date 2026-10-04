import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { inlineCarouselMedia, inlineSlidesMedia } from "@/lib/carousel-media";

const url = (n: string) => `https://x.supabase.co/storage/v1/object/public/calendar-visuals/u/carousel-media/${n.repeat(64)}.jpg`;
afterEach(() => vi.unstubAllGlobals());

it("puts stored photos back into the slide for exports, fetching each one once", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(["photo"], { type: "image/jpeg" }) }));
  vi.stubGlobal("fetch", fetchMock);
  const slides = await inlineSlidesMedia([
    { html: `<img src="${url("a")}"><div style="background-image:url(&quot;${url("a")}&quot;)"></div>`, slide_number: 1 },
    { html: `<p>Texte seul</p><img src="https://example.com/autre.jpg">`, slide_number: 2 },
  ]);
  expect(slides[0].html).not.toContain("carousel-media");
  expect(slides[0].html.match(/data:image\/jpeg;base64,/g)).toHaveLength(2);
  expect(slides[1].html).toContain("https://example.com/autre.jpg");
  expect(slides[1].slide_number).toBe(2);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("keeps the link when a photo cannot be fetched (the renderer can still load it)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, blob: async () => new Blob([]) })));
  const html = `<img src="${url("b")}">`;
  expect(await inlineCarouselMedia(html)).toBe(html);
});
