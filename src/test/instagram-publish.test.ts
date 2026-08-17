import { describe, it, expect, vi, beforeEach } from "vitest";

// Vérifie que instagram-publish.ts appelle bien social-instagram-publish avec le bon
// payload, et remonte proprement les erreurs (transport ET applicatives), sans jamais
// renvoyer un faux succès.

const mocks = vi.hoisted(() => ({
  invokeWithTimeout: vi.fn(),
  storageUpload: vi.fn(),
  storageCreateSignedUrl: vi.fn(),
  storageRemove: vi.fn(),
  renderCarouselSlidesToBlobs: vi.fn(),
}));

vi.mock("@/lib/invoke-with-timeout", () => ({
  invokeWithTimeout: mocks.invokeWithTimeout,
}));

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

vi.mock("@/lib/export-carousel-png", () => ({
  renderCarouselSlidesToBlobs: mocks.renderCarouselSlidesToBlobs,
}));

import {
  publishToInstagram,
  publishImageToInstagram,
  publishReelToInstagram,
  publishRenderedCarouselToInstagram,
  resolveWorkspaceParam,
  isNotConnectedError,
} from "@/lib/instagram-publish";

beforeEach(() => {
  mocks.invokeWithTimeout.mockReset();
  mocks.storageUpload.mockReset();
  mocks.storageCreateSignedUrl.mockReset();
  mocks.storageRemove.mockReset();
  mocks.renderCarouselSlidesToBlobs.mockReset();
});

describe("resolveWorkspaceParam", () => {
  it("n'envoie pas de workspace_id en mode mono-utilisateur (workspaceId === userId)", () => {
    expect(resolveWorkspaceParam("u1", "u1")).toBeUndefined();
  });
  it("transmet le workspace actif quand il diffère de l'utilisateur", () => {
    expect(resolveWorkspaceParam("ws1", "u1")).toBe("ws1");
  });
  it("undefined si workspaceId ou userId manquant", () => {
    expect(resolveWorkspaceParam(null, "u1")).toBeUndefined();
    expect(resolveWorkspaceParam("ws1", null)).toBeUndefined();
  });
});

describe("publishToInstagram — appel edge + réponse", () => {
  it("envoie caption, imageUrls, imageUrl (rétro-compat) et workspace_id à l'edge", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { permalink: "https://www.instagram.com/lea/", postId: "post-1" },
      error: null,
    });

    const result = await publishToInstagram({
      caption: "Ma légende",
      imageUrls: ["https://x/a.jpg", "https://x/b.jpg"],
      workspaceId: "ws1",
      userId: "u1",
    });

    expect(mocks.invokeWithTimeout).toHaveBeenCalledWith(
      "social-instagram-publish",
      {
        body: {
          caption: "Ma légende",
          imageUrls: ["https://x/a.jpg", "https://x/b.jpg"],
          imageUrl: "https://x/a.jpg",
          workspace_id: "ws1",
        },
      },
      120000,
    );
    expect(result).toEqual({ success: true, permalink: "https://www.instagram.com/lea/", postId: "post-1" });
  });

  it("erreur de transport (edge injoignable) → l'erreur remonte, pas de faux succès", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: null,
      error: { message: "Le service est momentanément indisponible. Réessaie dans quelques instants.", code: "NETWORK" },
    });

    await expect(
      publishToInstagram({ caption: "", imageUrls: ["https://x/a.jpg"] }),
    ).rejects.toMatchObject({ message: "Le service est momentanément indisponible. Réessaie dans quelques instants." });
  });

  it("erreur applicative dans le corps (ex: compte non connecté) → Error avec le message serveur", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { error: "Aucun compte Instagram connecté. Connecte-le dans Paramètres > Connexions." },
      error: null,
    });

    await expect(publishToInstagram({ caption: "", imageUrls: ["https://x/a.jpg"] })).rejects.toThrow(
      "Aucun compte Instagram connecté. Connecte-le dans Paramètres > Connexions.",
    );
  });
});

describe("publishImageToInstagram — délègue à publishToInstagram avec une seule image", () => {
  it("envoie un tableau à une image", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({ data: { postId: "p1" }, error: null });
    await publishImageToInstagram({ caption: "c", imageUrl: "https://x/a.jpg" });

    const body = mocks.invokeWithTimeout.mock.calls[0][1].body;
    expect(body.imageUrls).toEqual(["https://x/a.jpg"]);
    expect(body.imageUrl).toBe("https://x/a.jpg");
  });
});

describe("publishReelToInstagram", () => {
  it("envoie videoUrl + caption, timeout par défaut long (transcodage)", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({ data: { postId: "reel-1", permalink: "https://ig/x" }, error: null });

    const result = await publishReelToInstagram({ caption: "Mon reel", videoUrl: "https://x/reel.mp4", userId: "u1" });

    expect(mocks.invokeWithTimeout).toHaveBeenCalledWith(
      "social-instagram-publish",
      { body: { caption: "Mon reel", videoUrl: "https://x/reel.mp4", workspace_id: undefined } },
      330000,
    );
    expect(result.postId).toBe("reel-1");
  });

  it("Instagram refuse la vidéo → erreur propre, pas de succès silencieux", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { error: "Instagram a refusé la vidéo. Vérifie qu'elle est en MP4 vertical et dure entre 3 secondes et 15 minutes." },
      error: null,
    });

    await expect(
      publishReelToInstagram({ caption: "", videoUrl: "https://x/reel.mp4" }),
    ).rejects.toThrow("Instagram a refusé la vidéo");
  });
});

describe("publishRenderedCarouselToInstagram", () => {
  function fakeBlob(n: number) {
    return Array.from({ length: n }, (_, i) => ({ slide_number: i + 1, blob: new Blob(["x"], { type: "image/png" }) }));
  }

  it("valide, uploade chaque slide, publie avec les URLs signées, puis nettoie le bucket", async () => {
    mocks.renderCarouselSlidesToBlobs.mockResolvedValue(fakeBlob(2));
    mocks.storageUpload.mockResolvedValue({ error: null });
    mocks.storageCreateSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://signed/1.png" }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: "https://signed/2.png" }, error: null });
    mocks.storageRemove.mockResolvedValue({ error: null });
    mocks.invokeWithTimeout.mockResolvedValue({ data: { postId: "carousel-1" }, error: null });

    const result = await publishRenderedCarouselToInstagram({
      caption: "Carrousel",
      visualSlides: [{ slide_number: 1, html: "<div/>" }, { slide_number: 2, html: "<div/>" }],
      userId: "u1",
    });

    expect(result.postId).toBe("carousel-1");
    const body = mocks.invokeWithTimeout.mock.calls[0][1].body;
    expect(body.imageUrls).toEqual(["https://signed/1.png", "https://signed/2.png"]);
    expect(mocks.storageRemove).toHaveBeenCalled();
  });

  it("moins de 2 visuels valides → erreur avant tout appel réseau", async () => {
    mocks.renderCarouselSlidesToBlobs.mockResolvedValue(fakeBlob(1));

    await expect(
      publishRenderedCarouselToInstagram({ caption: "", visualSlides: [{ slide_number: 1, html: "<div/>" }], userId: "u1" }),
    ).rejects.toThrow("au moins 2 visuels");
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });

  it("plus de 10 visuels → erreur avant tout appel réseau", async () => {
    mocks.renderCarouselSlidesToBlobs.mockResolvedValue(fakeBlob(11));

    await expect(
      publishRenderedCarouselToInstagram({
        caption: "",
        visualSlides: Array.from({ length: 11 }, (_, i) => ({ slide_number: i + 1, html: "<div/>" })),
        userId: "u1",
      }),
    ).rejects.toThrow("limite les carrousels à 10 images");
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });

  it("échec d'upload d'une slide → erreur lisible, pas de publication partielle", async () => {
    mocks.renderCarouselSlidesToBlobs.mockResolvedValue(fakeBlob(2));
    mocks.storageUpload.mockResolvedValue({ error: { message: "quota dépassé" } });

    await expect(
      publishRenderedCarouselToInstagram({
        caption: "",
        visualSlides: [{ slide_number: 1, html: "<div/>" }, { slide_number: 2, html: "<div/>" }],
        userId: "u1",
      }),
    ).rejects.toThrow("quota dépassé");
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });
});

describe("isNotConnectedError", () => {
  it("détecte le message « aucun compte instagram » quelle que soit la casse", () => {
    expect(isNotConnectedError("Aucun compte Instagram connecté.")).toBe(true);
    expect(isNotConnectedError("AUCUN COMPTE INSTAGRAM CONNECTÉ")).toBe(true);
  });
  it("faux pour un autre message d'erreur", () => {
    expect(isNotConnectedError("Publication échouée.")).toBe(false);
    expect(isNotConnectedError(undefined)).toBe(false);
  });
});
