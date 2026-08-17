import { describe, it, expect, vi, beforeEach } from "vitest";

// Couvre handlePublishNowFromDialog côté LinkedIn (CreerUnifie.tsx) : ce fichier
// est le point d'appel réseau réel derrière ce handler. Le composant est trop gros
// (4500+ lignes, tout contexte confondu) pour être monté ; on teste donc la
// frontière testable — l'appel edge et son interprétation succès/échec.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

import { publishTextToLinkedIn, isLinkedInNotConnectedError } from "@/lib/linkedin-publish";

beforeEach(() => {
  mocks.invoke.mockReset();
});

describe("publishTextToLinkedIn — publication réussie", () => {
  it("appelle social-linkedin-publish avec le texte et renvoie le permalien", async () => {
    mocks.invoke.mockResolvedValue({
      data: { permalink: "https://linkedin.com/feed/update/urn:li:activity:123", postId: "urn:li:activity:123" },
      error: null,
    });

    const res = await publishTextToLinkedIn({ text: "Mon post", workspaceId: "ws1", userId: "user1" });

    expect(mocks.invoke).toHaveBeenCalledWith("social-linkedin-publish", {
      body: { text: "Mon post", workspace_id: "ws1" },
    });
    expect(res).toEqual({
      success: true,
      permalink: "https://linkedin.com/feed/update/urn:li:activity:123",
      postId: "urn:li:activity:123",
    });
  });

  it("workspace mono-utilisateur (workspaceId === userId) : n'envoie pas workspace_id", async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    await publishTextToLinkedIn({ text: "Mon post", workspaceId: "user1", userId: "user1" });
    expect(mocks.invoke).toHaveBeenCalledWith("social-linkedin-publish", {
      body: { text: "Mon post", workspace_id: undefined },
    });
  });

  it("images fournies : envoie media_urls en plus du texte", async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    await publishTextToLinkedIn({ text: "Mon post", imageUrls: ["https://x.com/a.jpg"], workspaceId: "ws1", userId: "user1" });
    expect(mocks.invoke).toHaveBeenCalledWith("social-linkedin-publish", {
      body: { text: "Mon post", media_urls: ["https://x.com/a.jpg"], workspace_id: "ws1" },
    });
  });
});

describe("publishTextToLinkedIn — échec : jamais de faux succès", () => {
  it("erreur transport (error non nul) : lève, ne renvoie pas success", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Le service est momentanément indisponible." } });
    await expect(publishTextToLinkedIn({ text: "Mon post" })).rejects.toMatchObject({
      message: "Le service est momentanément indisponible.",
    });
  });

  it("réponse 200 avec data.error (compte non connecté) : lève avec le message métier", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "Aucun compte LinkedIn connecté." }, error: null });
    await expect(publishTextToLinkedIn({ text: "Mon post" })).rejects.toThrow("Aucun compte LinkedIn connecté.");
  });
});

describe("isLinkedInNotConnectedError", () => {
  it("reconnaît le message « aucun compte linkedin » (insensible à la casse)", () => {
    expect(isLinkedInNotConnectedError("Aucun compte LinkedIn connecté.")).toBe(true);
    expect(isLinkedInNotConnectedError("aucun compte linkedin trouvé")).toBe(true);
  });

  it("faux pour un autre message d'erreur", () => {
    expect(isLinkedInNotConnectedError("Le service est momentanément indisponible.")).toBe(false);
    expect(isLinkedInNotConnectedError(undefined)).toBe(false);
  });
});
