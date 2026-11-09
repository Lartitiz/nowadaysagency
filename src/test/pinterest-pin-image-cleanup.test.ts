import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Publication d'épingles (09/11/2026) : le visuel hébergé pour Pinterest est effacé
// du stockage après la publication, au lieu d'y rester indéfiniment.

const mocks = vi.hoisted(() => ({
  storageUpload: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mocks.storageUpload,
        createSignedUrl: mocks.storageCreateSignedUrl,
        remove: mocks.storageRemove,
      }),
    },
  },
}));

import { uploadPinImage, schedulePinImageCleanup, PIN_IMAGE_CLEANUP_DELAY_MS } from "@/lib/pinterest-publish";

beforeEach(() => {
  mocks.storageUpload.mockReset().mockResolvedValue({ error: null });
  mocks.storageCreateSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: "https://x/signe.png" }, error: null });
  mocks.storageRemove.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());

describe("visuel d'épingle : hébergement puis effacement", () => {
  it("renvoie le lien signé et le chemin, rangé dans le dossier de l'utilisatrice", async () => {
    const res = await uploadPinImage(new Blob(["x"], { type: "image/png" }), "u1");
    expect(res.url).toBe("https://x/signe.png");
    expect(res.path).toMatch(/^u1\/pin-.+\.png$/);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it("lien signé introuvable : le fichier envoyé est effacé tout de suite", async () => {
    mocks.storageCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "non" } });
    await expect(uploadPinImage(new Blob(["x"]), "u1")).rejects.toThrow("Lien du visuel introuvable");
    expect(mocks.storageRemove).toHaveBeenCalledWith([expect.stringMatching(/^u1\/pin-/)]);
  });

  it("efface le visuel seulement après le délai, sans lever d'erreur si l'effacement échoue", async () => {
    vi.useFakeTimers();
    mocks.storageRemove.mockRejectedValue(new Error("réseau"));
    schedulePinImageCleanup("u1/pin-a.png");
    vi.advanceTimersByTime(PIN_IMAGE_CLEANUP_DELAY_MS - 1);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.storageRemove).toHaveBeenCalledWith(["u1/pin-a.png"]);
    await Promise.resolve();
  });
});
