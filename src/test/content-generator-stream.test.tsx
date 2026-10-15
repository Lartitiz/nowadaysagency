import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fiche 17 de docs/robustesse/gros-fichiers.md, lot T (tests 5 et 6) :
   `generateStream` (corps envoyé, angle cherché dans les 4 catalogues, lecture
   du texte reçu) et le contrat des 24 clés rendues par le hook, figés avant
   le découpage. Régénérer : npx vitest run src/test/content-generator-stream.test.tsx -u */

const mocks = vi.hoisted(() => ({ stream: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: vi.fn() }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: mocks.stream, reset: mocks.reset }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: () => false }));
vi.mock("@/lib/image-vision", () => ({
  downscalePhotosForVision: async (photos: any[]) => photos?.map((p) => ({ ...p, base64: `allégée(${p.base64})` })),
}));

import { useContentGenerator, type GenerateStreamParams } from "@/hooks/use-content-generator";

beforeEach(() => { vi.clearAllMocks(); mocks.stream.mockResolvedValue('{"content":"Post"}'); });

const lisible = (v: any) => JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined ? "<undefined>" : x)));

async function flux(params: GenerateStreamParams) {
  const hook = renderHook(useContentGenerator);
  let out: any;
  await act(async () => { out = await hook.result.current.generateStream(params); });
  const [fn, body] = mocks.stream.mock.calls[0] ?? [];
  return { out, hook, fn, body };
}

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ base64: `px${i + 1}`, context: `contexte ${i + 1}` }));

describe("generateStream — corps envoyé à creative-flow", () => {
  const cas: Record<string, GenerateStreamParams> = {
    "post Instagram, angle du catalogue Instagram, réponses": {
      format: "post", subject: "Sujet\n\n[Contenu existant à approfondir]\nTexte", editorialAngle: "mythe", objective: "vente",
      answers: { "Ton anecdote ?": "A", "Ton émotion ?": "B", "Ta conviction ?": "C" },
    },
    "LinkedIn, angle du catalogue LinkedIn, recherche, actu": {
      format: "linkedin", subject: "Sujet", editorialAngle: "decryptage_expert", deepResearch: true, newsContext: "Actu", workspaceId: "espace-explicite",
    },
    "newsletter sans réponses ni angle": { format: "newsletter", subject: "Sujet" },
    "Pinterest, angle visuel, lien et tableau, photos": {
      format: "pinterest", subject: "Sujet", editorialAngle: "infographie", pinterestLink: "https://exemple.fr", pinterestBoard: "Tableau",
      photoMode: true, photos: photos(12), photoDescription: "Desc",
    },
    "réponses déjà nommées anecdote / émotion / conviction": {
      format: "post", subject: "Sujet", answers: { conviction: "Conv", anecdote: "Anec", emotion: "Émo" },
    },
  };
  for (const [nom, params] of Object.entries(cas)) {
    it(nom, async () => {
      const { fn, body } = await flux(params);
      expect(fn).toBe("creative-flow");
      if (nom.startsWith("Pinterest")) expect(body.photos).toHaveLength(10);
      expect(lisible(body)).toMatchSnapshot();
    });
  }

  it("format inconnu → post_instagram", async () => {
    const { body } = await flux({ format: "autre" as any, subject: "Sujet" });
    expect(body.contentType).toBe("post_instagram");
  });

  it("lien Pinterest ignoré hors Pinterest", async () => {
    const { body } = await flux({ format: "post", subject: "Sujet", pinterestLink: "https://exemple.fr" });
    expect(body.pinterest_link).toBeUndefined();
  });

  it("mode photo sans image : photo_mode posé, aucune photo envoyée", async () => {
    const { body } = await flux({ format: "post", subject: "Sujet", photoMode: true, photos: [{ base64: "" }] });
    expect(body.photo_mode).toBe(true);
    expect(body.photos).toBeUndefined();
  });

  it("photos sans mode photo : rien d'envoyé", async () => {
    const { body } = await flux({ format: "post", subject: "Sujet", photos: photos(1) });
    expect(body.photo_mode).toBeUndefined();
    expect(body.photos).toBeUndefined();
  });

  it("angle absent des 4 catalogues → pas d'angle", async () => {
    const { body } = await flux({ format: "post", subject: "Sujet", editorialAngle: "angle-maison" });
    expect(body.angle).toBeUndefined();
    expect(body.editorialFormat).toBe("angle-maison");
  });

  it("le flux est remis à zéro avant l'envoi", async () => {
    await flux({ format: "post", subject: "Sujet" });
    expect(mocks.reset).toHaveBeenCalled();
  });
});

describe("generateStream — lecture du texte reçu", () => {
  it("JSON entouré de ```json → objet lu", async () => {
    mocks.stream.mockResolvedValue('```json\n{"content":"Bonjour"}\n```');
    const { out, hook } = await flux({ format: "linkedin", subject: "Sujet" });
    expect(out).toEqual({ type: "linkedin", raw: { content: "Bonjour" } });
    expect(hook.result.current.result).toEqual(out);
  });

  it("texte non JSON → { content: texte }", async () => {
    mocks.stream.mockResolvedValue("Un post écrit en clair.");
    const { out } = await flux({ format: "post", subject: "Sujet" });
    expect(out.raw).toEqual({ content: "Un post écrit en clair." });
  });

  it("flux vide → « La génération a échoué. Réessaie. »", async () => {
    mocks.stream.mockResolvedValue("");
    const { out, hook } = await flux({ format: "post", subject: "Sujet" });
    expect(out).toBeNull();
    expect(hook.result.current.error).toBe("La génération a échoué. Réessaie.");
    expect(hook.result.current.result).toBeNull();
  });
});

describe("useContentGenerator — contrat des clés rendues", () => {
  it("exactement les 24 clés lues par /creer", () => {
    const { result } = renderHook(useContentGenerator);
    expect(Object.keys(result.current).sort()).toEqual([
      "clearQuotaExhausted", "draftSlides", "error", "generate", "generateQuestions", "generateStream",
      "generating", "generationStage", "loadingQuestions", "markQuotaExhausted", "outlineTitles", "questions",
      "questionsError", "quotaExhausted", "reset", "result", "setQuestions", "setResult", "streamDone",
      "streamError", "streamReset", "streamStage", "streaming", "streamingContent",
    ]);
  });
});
