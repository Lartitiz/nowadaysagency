import { afterEach, describe, expect, it, vi } from "vitest";
import { embedExportFonts } from "@/lib/export-font-embedding";
import { embedExportImages, ExportImageError } from "@/lib/export-image-readiness";

afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ""; document.body.innerHTML = ""; });

describe("self-contained Pinterest rendering", () => {
  it("embeds used font weights, resolves relative resources and fetches shared font data once", async () => {
    document.head.innerHTML = '<link rel="stylesheet" href="https://fonts.example.test/css/main.css">';
    document.body.innerHTML = '<p style="font-family:Test">Épingle en trois étapes</p>';
    const fetcher = vi.fn(async (url: string) => url.endsWith("main.css") ? {
      ok: true, text: async () => '@font-face{font-family:Test;font-weight:400;src:url(../font.woff2)} @font-face{font-family:Test;font-weight:700;src:url(../font.woff2)} @font-face{font-family:Unused;src:url(other.woff2)}',
    } : { ok: true, blob: async () => new Blob(["font"], { type: "font/woff2" }) });
    vi.stubGlobal("fetch", fetcher);
    const css = await embedExportFonts(document);
    expect(css).toContain("font-weight:400");
    expect(css).toContain("font-weight:700");
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).not.toContain("Unused");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://fonts.example.test/css/main.css", "https://fonts.example.test/font.woff2"]);
  });

  it("fails when a used font cannot be embedded instead of exporting incorrect line breaks", async () => {
    document.body.innerHTML = '<style>@font-face{font-family:Test;src:url(https://fonts.example.test/missing.woff2)}</style><p style="font-family:Test">Texte</p>';
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(embedExportFonts(document)).rejects.toThrow("police");
  });

  it("preserves both an image and a CSS background with the same embedded resource", async () => {
    document.body.innerHTML = '<img src="https://media.example.test/photo.png" srcset="https://media.example.test/photo.png 1x"><div style="background-image:url(https://media.example.test/photo.png)"></div>';
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["photo"], { type: "image/png" }) }));
    vi.stubGlobal("fetch", fetcher);
    await embedExportImages(document.body);
    expect(document.querySelector("img")!.src).toContain("data:image/png;base64,");
    expect(document.querySelector("img")!.hasAttribute("srcset")).toBe(false);
    expect(document.querySelector("div")!.style.backgroundImage).toContain(document.querySelector("img")!.src);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects an unavailable image so an incomplete visual cannot be downloaded or uploaded", async () => {
    document.body.innerHTML = '<img src="https://media.example.test/missing.png">';
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(embedExportImages(document.body)).rejects.toBeInstanceOf(ExportImageError);
  });
});
