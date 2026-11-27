import { describe, it, expect, vi, beforeEach } from "vitest";

// Lenteur du 27/11/2026 : la bibliothèque à 17 photos lançait 17 signatures,
// et une nouvelle adresse à chaque visite faisait retélécharger chaque image.
// Ce test verrouille : un seul lot par rendu, adresse resservie tant que la
// photo n'a pas changé, nouvelle adresse dès qu'elle change.

const storage = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => storage } },
}));

import { clearSignedPhotoUrlCache, forgetSignedPhotoUrl, getSignedPhotoUrl } from "@/lib/photo-storage";

let serial = 0;
beforeEach(() => {
  clearSignedPhotoUrlCache();
  storage.createSignedUrl.mockReset();
  storage.createSignedUrls.mockReset();
  storage.createSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://x/${path}?t=${++serial}`, error: null })),
    error: null,
  }));
  storage.createSignedUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://x/${path}?seul=${++serial}` },
    error: null,
  }));
});

describe("adresses signées des photos : un lot, gardées une heure", () => {
  it("17 photos demandées dans le même rendu = une seule demande au serveur", async () => {
    const paths = Array.from({ length: 17 }, (_, i) => `u/p${i}.jpg`);
    const urls = await Promise.all(paths.map((p) => getSignedPhotoUrl(p, undefined, { version: "v1" })));
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(urls.every((u, i) => u?.includes(paths[i]))).toBe(true);
  });

  it("ressert la même adresse tant que la photo n'a pas changé, sans rien redemander", async () => {
    const [a] = await Promise.all([
      getSignedPhotoUrl("u/a.jpg", undefined, { version: "v1" }),
      getSignedPhotoUrl("u/b.jpg", undefined, { version: "v1" }),
    ]);
    const again = await getSignedPhotoUrl("u/a.jpg", undefined, { version: "v1" });
    expect(again).toBe(a);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("photo retouchée (date de modification changée) = nouvelle adresse", async () => {
    const a = await getSignedPhotoUrl("u/a.jpg", undefined, { version: "v1" });
    const b = await getSignedPhotoUrl("u/a.jpg", undefined, { version: "v2" });
    expect(b).not.toBe(a);
  });

  it("sans version, rien n'est gardé", async () => {
    const a = await getSignedPhotoUrl("u/a.jpg");
    const b = await getSignedPhotoUrl("u/a.jpg");
    expect(b).not.toBe(a);
  });

  it("« Réessayer » oublie l'adresse gardée", async () => {
    const a = await getSignedPhotoUrl("u/a.jpg", undefined, { version: "v1" });
    forgetSignedPhotoUrl("u/a.jpg");
    const b = await getSignedPhotoUrl("u/a.jpg", undefined, { version: "v1" });
    expect(b).not.toBe(a);
  });

  it("lot en échec : chaque photo retombe sur sa signature seule", async () => {
    storage.createSignedUrls.mockResolvedValue({ data: null, error: new Error("503") });
    const urls = await Promise.all([getSignedPhotoUrl("u/a.jpg"), getSignedPhotoUrl("u/b.jpg")]);
    expect(urls.every((u) => u?.includes("seul="))).toBe(true);
  });

  it("une durée longue (publication) garde sa signature à elle", async () => {
    const url = await getSignedPhotoUrl("u/a.jpg", 365 * 24 * 3600, { version: "v1" });
    expect(url).toContain("seul=");
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
});
