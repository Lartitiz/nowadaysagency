import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@/lib/export-carousel-png", () => ({
  renderCarouselSlidesToBlobs: mocks.render,
}));
vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));
import { uploadVisualsToStorage } from "@/features/creer/upload-helpers";
beforeEach(() => vi.clearAllMocks());
function client() {
  const upload = vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl = vi.fn((path: string) => ({
      data: { publicUrl: `https://example.test/${path}` },
    }));
  return {
    upload,
    client: { storage: { from: () => ({ upload, getPublicUrl }) } },
  };
}
describe("carousel calendar rendering", () => {
  it("uses the publication renderer and preserves slide order in versioned URLs", async () => {
    mocks.render.mockResolvedValue(
      [1, 2].map((n) => ({
        slide_number: n,
        blob: new Blob(["test"], { type: "image/jpeg" }),
      })),
    );
    const { client: api, upload } = client();
    const slides = [1, 2].map((n) => ({
      slide_number: n,
      html: `<div>${n}</div>`,
    }));
    const urls = await uploadVisualsToStorage(api, "user", "post", slides);
    expect(mocks.render).toHaveBeenCalledWith(slides);
    expect(urls[0]).toMatch(/slides\/.+\/slide-1.jpg$/);
    expect(urls[1]).toMatch(/slide-2.jpg$/);
    expect(upload.mock.calls[0][2]).toEqual({
      contentType: "image/jpeg",
      upsert: false,
    });
  });
  it("never returns a partial carousel after an upload failure", async () => {
    mocks.render.mockResolvedValue(
      [1, 2].map((n) => ({ slide_number: n, blob: new Blob(["test"]) })),
    );
    const { client: api, upload } = client();
    upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error("offline") });
    await expect(
      uploadVisualsToStorage(api, "user", "post", [
        { slide_number: 1, html: "1" },
        { slide_number: 2, html: "2" },
      ]),
    ).rejects.toThrow("slide 2");
  });
});
