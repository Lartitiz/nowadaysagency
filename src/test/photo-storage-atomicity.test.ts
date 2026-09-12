import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadPhotosToStorage } from "@/features/creer/upload-helpers";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ blob: async () => new Blob(["photo"], { type: "image/png" }) }));
  const upload = vi.fn().mockResolvedValue({ error: null });
  const client = { storage: { from: () => ({ upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://test/${path}` } }) }) } };
  return { client, upload };
}

describe("photos calendrier : échec bloquant et version précédente préservée", () => {
  it("refuse une liste partielle si la deuxième photo échoue", async () => {
    const { client, upload } = fixture();
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("offline") });
    await expect(uploadPhotosToStorage(client, "user", "post", [{ base64: "1" }, { base64: "2" }])).rejects.toThrow("photo 2");
  });

  it("signale une photo perdue lors de la restauration", async () => {
    const { client, upload } = fixture();
    await expect(uploadPhotosToStorage(client, "user", "post", [{}])).rejects.toThrow("indisponible");
    expect(upload).not.toHaveBeenCalled();
  });

  it("deux sauvegardes du même post utilisent des fichiers distincts sans écrasement", async () => {
    const { client, upload } = fixture();
    const first = await uploadPhotosToStorage(client, "user", "post", [{ base64: "1" }]);
    const second = await uploadPhotosToStorage(client, "user", "post", [{ base64: "2" }]);
    expect(first[0]).not.toBe(second[0]);
    for (const call of upload.mock.calls) expect(call[2]).toEqual({ contentType: "image/png", upsert: false });
  });
});
