import { describe, it, expect, vi, beforeEach } from "vitest";

// Vérifie que linkedin-publish.ts appelle bien social-linkedin-publish avec le bon
// payload, et remonte proprement les erreurs (transport ET applicatives).

const mocks = vi.hoisted(() => ({
  invokeWithTimeout: vi.fn(),
}));

vi.mock("@/lib/invoke-with-timeout", () => ({
  invokeWithTimeout: mocks.invokeWithTimeout,
}));

// linkedin-publish.ts importe resolveWorkspaceParam depuis instagram-publish.ts, qui importe
// le client Supabase réel (localStorage indisponible en environnement "node" de test).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({}) } },
}));

import { publishTextToLinkedIn, isLinkedInNotConnectedError } from "@/lib/linkedin-publish";

beforeEach(() => {
  mocks.invokeWithTimeout.mockReset();
});

describe("publishTextToLinkedIn — appel edge + réponse", () => {
  it("envoie le texte et workspace_id, sans media_urls si aucune image", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { permalink: "https://www.linkedin.com/feed/update/urn:li:share:1/", postId: "urn:li:share:1" },
      error: null,
    });

    const result = await publishTextToLinkedIn({ text: "Mon post", workspaceId: "ws1", userId: "u1" });

    expect(mocks.invokeWithTimeout).toHaveBeenCalledWith(
      "social-linkedin-publish",
      { body: { text: "Mon post", workspace_id: "ws1" } },
      60000,
    );
    expect(result).toEqual({
      success: true,
      permalink: "https://www.linkedin.com/feed/update/urn:li:share:1/",
      postId: "urn:li:share:1",
    });
  });

  it("ajoute media_urls uniquement si des images sont fournies", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({ data: { postId: "p1" }, error: null });

    await publishTextToLinkedIn({ text: "Avec images", imageUrls: ["https://x/a.jpg", "https://x/b.jpg"] });

    const body = mocks.invokeWithTimeout.mock.calls[0][1].body;
    expect(body.media_urls).toEqual(["https://x/a.jpg", "https://x/b.jpg"]);
  });

  it("n'ajoute pas media_urls si le tableau d'images est vide", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({ data: { postId: "p1" }, error: null });
    await publishTextToLinkedIn({ text: "Texte seul", imageUrls: [] });
    const body = mocks.invokeWithTimeout.mock.calls[0][1].body;
    expect(body.media_urls).toBeUndefined();
  });

  it("erreur de transport (edge injoignable) → l'erreur remonte, pas de faux succès", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: null,
      error: { message: "Le service est momentanément indisponible. Réessaie dans quelques instants.", code: "NETWORK" },
    });

    await expect(publishTextToLinkedIn({ text: "x" })).rejects.toMatchObject({
      message: "Le service est momentanément indisponible. Réessaie dans quelques instants.",
    });
  });

  it("erreur applicative dans le corps (ex: compte non connecté) → Error avec le message serveur", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { error: "Aucun compte LinkedIn connecté. Connecte-le dans Paramètres > Connexions." },
      error: null,
    });

    await expect(publishTextToLinkedIn({ text: "x" })).rejects.toThrow(
      "Aucun compte LinkedIn connecté. Connecte-le dans Paramètres > Connexions.",
    );
  });

  it("jeton LinkedIn expiré remonté par l'edge → erreur propagée telle quelle", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { error: "Jeton LinkedIn expiré ou invalide. Reconnecte LinkedIn dans Paramètres > Connexions." },
      error: null,
    });

    await expect(publishTextToLinkedIn({ text: "x" })).rejects.toThrow("Jeton LinkedIn expiré ou invalide");
  });
});

describe("isLinkedInNotConnectedError", () => {
  it("détecte le message « aucun compte linkedin » quelle que soit la casse", () => {
    expect(isLinkedInNotConnectedError("Aucun compte LinkedIn connecté.")).toBe(true);
    expect(isLinkedInNotConnectedError("AUCUN COMPTE LINKEDIN CONNECTÉ")).toBe(true);
  });
  it("faux pour un autre message d'erreur", () => {
    expect(isLinkedInNotConnectedError("Publication LinkedIn échouée.")).toBe(false);
    expect(isLinkedInNotConnectedError(undefined)).toBe(false);
  });
});
