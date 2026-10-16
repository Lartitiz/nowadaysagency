import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fiche 17 de docs/robustesse/gros-fichiers.md, lot T (test 2) : la lecture de
   la réponse de `generate` (JSON abîmé, garde de forme, renumérotation, photos
   d'ambiance, mesure PostHog), figée avant le découpage du hook. */

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), capture: vi.fn(), applyStock: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.invoke }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: vi.fn(), reset: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: mocks.capture } }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: () => false }));
vi.mock("@/lib/image-vision", () => ({ downscalePhotosForVision: async (photos: any[]) => photos }));
vi.mock("@/lib/stock-ambient-photos", () => ({ applyStockAmbientPhotos: mocks.applyStock }));

import { useContentGenerator, type GenerateParams } from "@/hooks/use-content-generator";

beforeEach(() => vi.clearAllMocks());

const ECHEC = "La génération n'a pas fonctionné comme prévu. Réessaie, ça marche en général au deuxième essai 🌸";

async function run(content: unknown, params: Partial<GenerateParams> = {}) {
  mocks.invoke.mockResolvedValue({ data: { content }, error: null });
  const hook = renderHook(useContentGenerator);
  let out: any;
  await act(async () => { out = await hook.result.current.generate({ format: "post", subject: "Sujet", ...params } as GenerateParams); });
  return { out, hook };
}

describe("generate — JSON de l'IA lu avec tolérance", () => {
  const cas: [string, string, unknown][] = [
    ["entouré de ```json", '```json\n{"content":"Bonjour"}\n```', { content: "Bonjour" }],
    ["vrai saut de ligne dans la chaîne", '{"content":"Ligne 1\nLigne 2"}', { content: "Ligne 1\nLigne 2" }],
    ["guillemets droits non échappés : sauvetage du champ content", '```json\n{"content":"Elle a dit "oui"\net voilà", "cta":"Go"}\n```', { content: 'Elle a dit "oui"\net voilà' }],
    ["virgule traînante", '{"content":"Ok", "cta":"Go",}', { content: "Ok", cta: "Go" }],
    ["texte autour de l'objet", 'Voici :\n{"content":"Post"}\nBonne journée', { content: "Post" }],
    ["déjà un objet", { content: "Objet" } as any, { content: "Objet" }],
  ];
  for (const [nom, brut, attendu] of cas) {
    it(nom, async () => {
      const { out, hook } = await run(brut);
      expect(out.raw).toEqual(attendu);
      expect(out.type).toBe("post");
      expect(hook.result.current.result).toEqual(out);
      expect(hook.result.current.error).toBeNull();
    });
  }

  // Corrigé le 16/10/2026 (constat du lot T de la fiche 17) : la liste des
  // hashtags rangée dans l'objet ne remplace plus le texte du post.
  it("JSON cassé avec une liste de hashtags → le texte est sauvé, pas la liste", async () => {
    const { out } = await run('```json\n{"content":"Elle a dit "oui"", "hashtags": ["a"]}\n```');
    expect(out.raw).toEqual({ content: 'Elle a dit "oui"' });
  });

  it("texte autour d'un tableau sans objet → tableau lu", async () => {
    const { out } = await run('Voici :\n["a", "b"]\nFin');
    expect(out.raw).toEqual(["a", "b"]);
  });

  it("tableau JSON accepté tel quel", async () => {
    const { out } = await run('[{"content":"A"}]');
    expect(out.raw).toEqual([{ content: "A" }]);
  });

  it("rien de lisible → message d'échec, aucun résultat", async () => {
    const { out, hook } = await run("pas du json du tout");
    expect(out).toBeNull();
    expect(hook.result.current.result).toBeNull();
    expect(hook.result.current.error).toBe(ECHEC);
    expect(hook.result.current.generating).toBe(false);
  });
});

describe("generate — garde de forme", () => {
  it.each([
    ["carousel", { slides: [] }],
    ["carousel", { title: "sans slides" }],
    ["reel", { sections: [] }],
    ["story", { title: "sans stories" }],
  ] as const)("%s sans contenu exploitable → échec propre", async (format, raw) => {
    const { out, hook } = await run(JSON.stringify(raw), { format });
    expect(out).toBeNull();
    expect(hook.result.current.error).toBe(ECHEC);
  });

  it.each([
    ["reel", { full_text: "Texte seul" }],
    ["story", { sequences: [] }],
    ["story", { slides: [] }],
  ] as const)("%s accepté avec %o", async (format, raw) => {
    const { out } = await run(JSON.stringify(raw), { format });
    expect(out?.raw).toEqual(raw);
  });
});

describe("generate — carrousel", () => {
  it("slides numérotées 1, 4.5, 9 → 1, 2, 3", async () => {
    const { out } = await run(JSON.stringify({ slides: [{ slide_number: 1 }, { slide_number: 4.5 }, { slide_number: 9 }] }), { format: "carousel" });
    expect(out.slides.map((s: any) => s.slide_number)).toEqual([1, 2, 3]);
  });

  it("photos d'ambiance : appliquées et transmises en mode photo (photos envoyées comptées, 10 max)", async () => {
    const added = [{ id: "stock-1" }];
    mocks.applyStock.mockImplementation(async (raw: any) => ({ raw: { ...raw, avec_ambiance: true }, added }));
    const onStock = vi.fn();
    const photos = Array.from({ length: 12 }, (_, i) => ({ base64: `p${i}` }));
    const { out } = await run(JSON.stringify({ slides: [{ slide_number: 1, stock_ambient: { query: "mer" } }] }),
      { format: "carousel", carouselType: "photo", photos, onStockAmbientPhotos: onStock });
    expect(mocks.applyStock).toHaveBeenCalledWith(expect.objectContaining({ slides: expect.any(Array) }), 10);
    expect(out.avec_ambiance).toBe(true);
    expect(out.raw.avec_ambiance).toBe(true);
    expect(onStock).toHaveBeenCalledWith(added);
  });

  it("photos d'ambiance hors mode photo : appliquées avec 10, rappel non appelé", async () => {
    mocks.applyStock.mockImplementation(async (raw: any) => ({ raw, added: [{ id: "x" }] }));
    const onStock = vi.fn();
    await run(JSON.stringify({ slides: [{ slide_number: 1, stock_ambient: { query: "mer" } }] }),
      { format: "carousel", carouselType: "mix", photos: [{ base64: "a" }], onStockAmbientPhotos: onStock });
    expect(mocks.applyStock).toHaveBeenCalledWith(expect.anything(), 10);
    expect(onStock).not.toHaveBeenCalled();
  });

  it("sans photo d'ambiance proposée : rappel appelé avec une liste vide en mode photo", async () => {
    const onStock = vi.fn();
    await run(JSON.stringify({ slides: [{ slide_number: 1 }] }), { format: "carousel", carouselType: "photo", onStockAmbientPhotos: onStock });
    expect(mocks.applyStock).not.toHaveBeenCalled();
    expect(onStock).toHaveBeenCalledWith([]);
  });
});

describe("generate — mesure de durée", () => {
  it("content_generation_timing avec format et quality_max", async () => {
    await run(JSON.stringify({ slides: [{ slide_number: 1 }] }), { format: "carousel", qualityMax: true });
    expect(mocks.capture).toHaveBeenCalledWith("content_generation_timing", { format: "carousel", duration_ms: expect.any(Number), quality_max: true });
  });

  it("pas de mesure sur un échec", async () => {
    await run("illisible");
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

describe("generate — erreurs serveur", () => {
  it("erreur d'appel → message lisible", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Le serveur est occupé, réessaie." } });
    const { result } = renderHook(useContentGenerator);
    await act(async () => { await result.current.generate({ format: "post", subject: "Sujet" }); });
    expect(result.current.error).toBe("Le serveur est occupé, réessaie.");
    expect(result.current.result).toBeNull();
  });

  it("data.error sans quota → message du serveur", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "bad_request", message: "Sujet trop long." }, error: null });
    const { result } = renderHook(useContentGenerator);
    await act(async () => { await result.current.generate({ format: "post", subject: "Sujet" }); });
    expect(result.current.error).toBe("Sujet trop long.");
  });
});
