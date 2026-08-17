import { describe, it, expect, vi, beforeEach } from "vitest";

// Couvre handlePublishNowFromDialog côté Instagram (CreerUnifie.tsx) : ce fichier
// est le point d'appel réseau réel derrière handlePublishInstagram. Comme pour
// LinkedIn, on teste la frontière réseau plutôt que de monter le composant page.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, storage: { from: vi.fn() } },
}));

import { publishImageToInstagram, isNotConnectedError, resolveWorkspaceParam } from "@/lib/instagram-publish";

beforeEach(() => {
  mocks.invoke.mockReset();
});

describe("publishImageToInstagram — publication réussie", () => {
  it("appelle social-instagram-publish avec la légende et l'image, renvoie le permalien", async () => {
    mocks.invoke.mockResolvedValue({
      data: { permalink: "https://instagram.com/p/abc123", postId: "abc123" },
      error: null,
    });

    const res = await publishImageToInstagram({
      caption: "Ma légende",
      imageUrl: "https://x.com/photo.jpg",
      workspaceId: "ws1",
      userId: "user1",
    });

    expect(mocks.invoke).toHaveBeenCalledWith("social-instagram-publish", {
      body: {
        caption: "Ma légende",
        imageUrls: ["https://x.com/photo.jpg"],
        imageUrl: "https://x.com/photo.jpg",
        workspace_id: "ws1",
      },
    });
    expect(res).toEqual({ success: true, permalink: "https://instagram.com/p/abc123", postId: "abc123" });
  });
});

describe("publishImageToInstagram — échec : jamais de faux succès", () => {
  it("erreur transport (error non nul) : lève, ne renvoie pas success", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Le service est momentanément indisponible." } });
    await expect(
      publishImageToInstagram({ caption: "c", imageUrl: "https://x.com/a.jpg" }),
    ).rejects.toMatchObject({ message: "Le service est momentanément indisponible." });
  });

  it("réponse 200 avec data.error (compte non connecté) : lève avec le message métier", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "Aucun compte Instagram connecté." }, error: null });
    await expect(
      publishImageToInstagram({ caption: "c", imageUrl: "https://x.com/a.jpg" }),
    ).rejects.toThrow("Aucun compte Instagram connecté.");
  });
});

describe("isNotConnectedError", () => {
  it("reconnaît le message « aucun compte instagram »", () => {
    expect(isNotConnectedError("Aucun compte Instagram connecté.")).toBe(true);
  });

  it("faux pour un autre message", () => {
    expect(isNotConnectedError("Erreur réseau")).toBe(false);
    expect(isNotConnectedError(undefined)).toBe(false);
  });
});

describe("resolveWorkspaceParam", () => {
  it("mono-utilisateur (workspaceId === userId) : n'envoie pas de workspace_id", () => {
    expect(resolveWorkspaceParam("user1", "user1")).toBeUndefined();
  });

  it("workspace distinct de l'utilisateur : transmis tel quel", () => {
    expect(resolveWorkspaceParam("ws1", "user1")).toBe("ws1");
  });

  it("workspaceId absent : undefined", () => {
    expect(resolveWorkspaceParam(null, "user1")).toBeUndefined();
  });
});
