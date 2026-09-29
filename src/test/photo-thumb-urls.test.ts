import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrl = vi.fn();
const createSignedUrls = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl, createSignedUrls }) } },
}));

import { getSignedPhotoThumbUrls } from "@/lib/photo-storage";

beforeEach(() => {
  createSignedUrl.mockReset();
  createSignedUrls.mockReset();
});

describe("getSignedPhotoThumbUrls : vignettes réduites côté serveur", () => {
  it("demande une version redimensionnée, pas l'original", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/render/image/sign/a" }, error: null });
    const map = await getSignedPhotoThumbUrls(["u/a.jpg"], { width: 200, height: 240 });
    expect(createSignedUrl).toHaveBeenCalledWith("u/a.jpg", 3600, {
      transform: { width: 200, height: 240, resize: "cover", quality: 70 },
    });
    expect(map.get("u/a.jpg")).toBe("https://x/render/image/sign/a");
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("retombe sur l'URL pleine taille pour le seul chemin dont la réduction échoue", async () => {
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://x/thumb-a" }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("too large") });
    createSignedUrls.mockResolvedValue({ data: [{ path: "u/b.jpg", signedUrl: "https://x/full-b" }], error: null });
    const map = await getSignedPhotoThumbUrls(["u/a.jpg", "u/b.jpg"], { width: 200, height: 240 });
    expect(map.get("u/a.jpg")).toBe("https://x/thumb-a");
    expect(map.get("u/b.jpg")).toBe("https://x/full-b");
    expect(createSignedUrls).toHaveBeenCalledWith(["u/b.jpg"], 3600);
  });

  it("ne plante pas si la signature jette une exception", async () => {
    createSignedUrl.mockRejectedValue(new Error("network"));
    createSignedUrls.mockResolvedValue({ data: [{ path: "u/a.jpg", signedUrl: "https://x/full-a" }], error: null });
    const map = await getSignedPhotoThumbUrls(["u/a.jpg"], { width: 200, height: 240 });
    expect(map.get("u/a.jpg")).toBe("https://x/full-a");
  });
});
