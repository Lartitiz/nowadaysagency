import { afterEach, expect, it, vi } from "vitest";
import { fileToResizedDataUrl } from "@/lib/story-photos";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/photo-storage", () => ({ getSignedPhotoUrls: vi.fn(), USER_PHOTOS_BUCKET: "test" }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("prépare le même fond blanc que la bibliothèque et limite aussi la hauteur", async () => {
  const bitmap = { width: 2400, height: 3600, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,test");
  const output = await fileToResizedDataUrl(new File([], "transparent.png", { type: "image/png" }));
  expect(context.fillStyle).toBe("#ffffff");
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1067, 1600);
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1067, 1600);
  expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(output).toBe("data:image/jpeg;base64,test");
});
