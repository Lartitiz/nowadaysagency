import { afterEach, expect, it, vi } from "vitest";
import { compressToJpeg } from "@/lib/photo-storage";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => vi.unstubAllGlobals());

it("reduces an upload below the Studio vision limit before keeping it", async () => {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3000, height: 3000, close })));
  class Canvas {
    constructor(public width: number, public height: number) {}
    getContext() { return { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }; }
    async convertToBlob() {
      return { size: this.width === 2048 ? 5_050_000 : 4_800_000 } as Blob;
    }
  }
  vi.stubGlobal("OffscreenCanvas", Canvas);

  const result = await compressToJpeg(new File(["image"], "product.png", { type: "image/png" }));
  expect(result.width).toBe(1536);
  expect(result.height).toBe(1536);
  expect(result.blob.size).toBeLessThan(5_000_000);
  expect(close).toHaveBeenCalledOnce();
});
