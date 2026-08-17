import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Cœur de la génération (doGenerate) : 6 sous-flux selon format/sous-mode.
// Chaque mauvais routage part sur le mauvais moteur (streaming vs classique vs
// Pinterest vs structure) et chaque garde ratée relance une génération
// FACTURÉE. On teste le routage, les gardes, la ré-indexation des réponses
// (q_0 → texte de la question) et les chemins quota.

const mocks = vi.hoisted(() => {
  class PremiumRequiredError extends Error {}
  return {
    PremiumRequiredError,
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
    navigate: vi.fn(),
    invokeWithTimeout: vi.fn(),
    handleQuotaError: vi.fn(),
    runPhotoDump: vi.fn(),
    addDirective: vi.fn(),
    savePhotos: vi.fn(),
    generatePinterestVisual: vi.fn(),
    generatePinterestPhotoBrief: vi.fn(),
    resetPostGenerationState: vi.fn(),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invokeWithTimeout }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: mocks.handleQuotaError }));
vi.mock("@/lib/image-vision", () => ({
  downscalePhotosForVision: async (photos: any[]) => photos.map((p) => ({ ...p, vision: true })),
}));
vi.mock("@/lib/photo-dump", () => ({
  runPhotoDump: mocks.runPhotoDump,
  PremiumRequiredError: mocks.PremiumRequiredError,
}));
vi.mock("@/hooks/use-photo-wishlist", () => ({
  usePhotoWishlistMutations: () => ({ addDirective: mocks.addDirective }),
}));
vi.mock("@/hooks/use-flow-persistence", () => ({ savePhotos: mocks.savePhotos }));
vi.mock("@/lib/demo-auriana-data", () => ({
  AURIANA_DEMO_SUBJECT: "sujet-auriana",
  AURIANA_DEMO_FLOW: { questions: [], result: { type: "carousel" } },
}));
vi.mock("@/features/creer/photo-source", () => ({
  pickNonEmpty: (a: any[], b: any[]) => (a?.length ? a : b?.length ? b : []),
}));
vi.mock("@/features/creer/pinterest-generation", () => ({
  generatePinterestVisual: mocks.generatePinterestVisual,
  generatePinterestPhotoBrief: mocks.generatePinterestPhotoBrief,
}));
vi.mock("@/features/creer/post-generation-reset", () => ({
  resetPostGenerationState: mocks.resetPostGenerationState,
}));

import { useDoGenerate } from "@/hooks/use-do-generate";

// Bag plat en entrée (overrides restent flats — aucun test n'a besoin de
// connaître le regroupement interne) ; makeParams le réassemble dans la forme
// imbriquée { photo, pinterest, carousel, resultSetters } attendue par le hook
// depuis le regroupement du 17/08 (voir CLAUDE.md / audit refactoring).
function makeParams(overrides: Record<string, any> = {}) {
  const f = {
    selectedFormat: "carousel" as string | null,
    generating: false,
    structureLoading: false,
    streaming: false,
    photoDumpResolving: false,
    selectedReelHook: null,
    isTextFirstMix: false,
    textFirstCatalogRows: [] as any[],
    textFirstCatalog: [] as any[],
    questions: [] as any[],
    aurianaDemoActive: false,
    ideaText: "Mon idée",
    carouselSubMode: "text" as any,
    uploadedPhotos: [] as any[],
    isDemoMode: false,
    demoData: null,
    existingCalendarContent: null,
    objective: null,
    editorialAngle: null,
    workspaceId: "u1",
    session: { user: { id: "u1" } },
    photoMode: false,
    photoDescription: "",
    newsjackingContext: null,
    pinterestData: null,
    chosenProposal: null,
    inspirationImageBase64: null,
    photoDumpEnabled: false,
    photoDumpDoneRef: { current: false },
    textFirstRowsSnapshotRef: { current: [] as any[] },
    generatedWithPhotos: [] as any[],
    structureProposal: null,
    lastConfirmedStructure: null,
    lastNarrativeThread: null,
    slideCountChoice: undefined,
    isLinkedInCarousel: false,
    qualityMax: false,
    libraryPhotosForCasting: [] as any[],
    clearQuotaExhausted: vi.fn(),
    markQuotaExhausted: vi.fn(),
    setDemoGenerating: vi.fn(),
    setStep: vi.fn(),
    setResult: vi.fn(),
    setSavedId: vi.fn(),
    setVisualSlides: vi.fn(),
    setCarouselColors: vi.fn(),
    setPinterestPinHtml: vi.fn(),
    setPhotoBriefOverlayHtml: vi.fn(),
    setPhotoBriefResult: vi.fn(),
    generateStream: vi.fn().mockResolvedValue({ ok: true }),
    streamReset: vi.fn(),
    setPinterestVisualGenerating: vi.fn(),
    setPhotoDumpResolving: vi.fn(),
    setPhotoDumpProgress: vi.fn(),
    setUploadedPhotos: vi.fn(),
    setGeneratedWithPhotos: vi.fn(),
    setStructureLoading: vi.fn(),
    setStructureProposal: vi.fn(),
    generate: vi.fn().mockResolvedValue(undefined),
    handleConfirmStructure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return {
    selectedFormat: f.selectedFormat,
    generating: f.generating,
    structureLoading: f.structureLoading,
    streaming: f.streaming,
    photoDumpResolving: f.photoDumpResolving,
    selectedReelHook: f.selectedReelHook,
    questions: f.questions,
    aurianaDemoActive: f.aurianaDemoActive,
    ideaText: f.ideaText,
    isDemoMode: f.isDemoMode,
    demoData: f.demoData,
    existingCalendarContent: f.existingCalendarContent,
    objective: f.objective,
    editorialAngle: f.editorialAngle,
    workspaceId: f.workspaceId,
    session: f.session,
    newsjackingContext: f.newsjackingContext,
    qualityMax: f.qualityMax,
    clearQuotaExhausted: f.clearQuotaExhausted,
    markQuotaExhausted: f.markQuotaExhausted,
    setDemoGenerating: f.setDemoGenerating,
    generateStream: f.generateStream,
    streamReset: f.streamReset,
    generate: f.generate,
    photo: {
      uploadedPhotos: f.uploadedPhotos,
      photoMode: f.photoMode,
      photoDescription: f.photoDescription,
      generatedWithPhotos: f.generatedWithPhotos,
      photoDumpEnabled: f.photoDumpEnabled,
      photoDumpDoneRef: f.photoDumpDoneRef,
      libraryPhotosForCasting: f.libraryPhotosForCasting,
      setUploadedPhotos: f.setUploadedPhotos,
      setGeneratedWithPhotos: f.setGeneratedWithPhotos,
      setPhotoDumpResolving: f.setPhotoDumpResolving,
      setPhotoDumpProgress: f.setPhotoDumpProgress,
    },
    pinterest: {
      pinterestData: f.pinterestData,
      chosenProposal: f.chosenProposal,
      inspirationImageBase64: f.inspirationImageBase64,
      setPinterestPinHtml: f.setPinterestPinHtml,
      setPhotoBriefOverlayHtml: f.setPhotoBriefOverlayHtml,
      setPhotoBriefResult: f.setPhotoBriefResult,
      setPinterestVisualGenerating: f.setPinterestVisualGenerating,
    },
    carousel: {
      carouselSubMode: f.carouselSubMode,
      isTextFirstMix: f.isTextFirstMix,
      textFirstCatalogRows: f.textFirstCatalogRows,
      textFirstCatalog: f.textFirstCatalog,
      textFirstRowsSnapshotRef: f.textFirstRowsSnapshotRef,
      structureProposal: f.structureProposal,
      lastConfirmedStructure: f.lastConfirmedStructure,
      lastNarrativeThread: f.lastNarrativeThread,
      slideCountChoice: f.slideCountChoice,
      isLinkedInCarousel: f.isLinkedInCarousel,
      setStructureLoading: f.setStructureLoading,
      setStructureProposal: f.setStructureProposal,
      handleConfirmStructure: f.handleConfirmStructure,
    },
    resultSetters: {
      setStep: f.setStep,
      setResult: f.setResult,
      setSavedId: f.setSavedId,
      setVisualSlides: f.setVisualSlides,
      setCarouselColors: f.setCarouselColors,
    },
  };
}

async function run(params: any, ans: Record<string, string> = {}, reelHookOverride?: any) {
  const { result } = renderHook(() => useDoGenerate(params));
  await act(() => result.current.doGenerate(ans, reelHookOverride));
}

describe("useDoGenerate — gardes et ré-indexation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
  });

  it("garde anti double-clic / réentrance : tout flux en cours ignore le clic", async () => {
    for (const busy of [
      { generating: true },
      { structureLoading: true },
      { streaming: true },
      { photoDumpResolving: true },
      { selectedFormat: null },
    ]) {
      const params = makeParams(busy);
      await run(params);
      expect(params.clearQuotaExhausted).not.toHaveBeenCalled();
      expect(params.generate).not.toHaveBeenCalled();
      expect(params.generateStream).not.toHaveBeenCalled();
    }
  });

  it("réponses ré-indexées par texte de question (fallback ID), vides écartées", async () => {
    const params = makeParams({
      selectedFormat: "post",
      questions: [{ id: "q_0", question: "Quelle est ta cible ?" }],
    });
    await run(params, { q_0: "Les solopreneuses", q_1: "Réponse orpheline", q_2: "   " });

    expect(params.clearQuotaExhausted).toHaveBeenCalledTimes(1);
    expect(params.generateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: {
          "Quelle est ta cible ?": "Les solopreneuses",
          q_1: "Réponse orpheline",
        },
      }),
    );
  });
});

describe("useDoGenerate — routage par format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
  });

  it("formats texte → streaming SSE (jamais generate), sujet enrichi du contenu calendrier", async () => {
    for (const format of ["post", "linkedin", "newsletter", "pinterest"]) {
      const params = makeParams({
        selectedFormat: format,
        existingCalendarContent: "Ancien brouillon",
        pinterestData: { link: "https://pin", boardName: "Board" },
      });
      await run(params);
      expect(params.streamReset).toHaveBeenCalledTimes(1);
      expect(params.generateStream).toHaveBeenCalledTimes(1);
      expect(params.generate).not.toHaveBeenCalled();
      const args = params.generateStream.mock.calls[0][0];
      expect(args.format).toBe(format);
      expect(args.subject).toBe("Mon idée\n\n[Contenu existant à approfondir]\nAncien brouillon");
      expect(args.workspaceId).toBeUndefined(); // workspace perso
      // Le lien Pinterest ne part QUE pour le format pinterest.
      expect(args.pinterestLink).toBe(format === "pinterest" ? "https://pin" : undefined);
    }
    expect(mocks.resetPostGenerationState).toHaveBeenCalledTimes(4);
  });

  it("échec streaming quota → markQuotaExhausted (écran résultat dit quota, pas « Session expirée »)", async () => {
    mocks.handleQuotaError.mockReturnValue(true);
    const params = makeParams({
      selectedFormat: "post",
      generateStream: vi.fn().mockRejectedValue(new Error("limit_reached")),
    });
    await run(params);

    expect(params.markQuotaExhausted).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("streaming null (échec silencieux) → on RESTE sur l'écran résultat, pas de retour à format", async () => {
    const params = makeParams({
      selectedFormat: "post",
      generateStream: vi.fn().mockResolvedValue(null),
    });
    await run(params);

    expect(params.resultSetters.setStep).not.toHaveBeenCalledWith("format");
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("pinterest_visual → moteur Pinterest dédié (120s), pin_type en cascade proposition → angle → défaut", async () => {
    const params = makeParams({
      selectedFormat: "pinterest_visual",
      editorialAngle: "citation",
      chosenProposal: null,
    });
    await run(params);

    expect(params.generate).not.toHaveBeenCalled();
    expect(mocks.generatePinterestVisual).toHaveBeenCalledTimes(1);
    expect(mocks.generatePinterestVisual.mock.calls[0][0]).toMatchObject({
      pinType: "citation",
      timeoutMs: 120000,
    });

    const params2 = makeParams({ selectedFormat: "pinterest_visual" });
    await run(params2);
    expect(mocks.generatePinterestVisual.mock.calls[1][0].pinType).toBe("infographie");
  });

  it("pinterest_photo → brief photo dédié avec le brief de la proposition choisie", async () => {
    const params = makeParams({
      selectedFormat: "pinterest_photo",
      chosenProposal: { pin_type: "photo_lifestyle", brief: "lumière douce" },
    });
    await run(params);

    expect(mocks.generatePinterestPhotoBrief).toHaveBeenCalledTimes(1);
    expect(mocks.generatePinterestPhotoBrief.mock.calls[0][0]).toMatchObject({
      pinType: "photo_lifestyle",
      briefHint: "lumière douce",
    });
    expect(params.generate).not.toHaveBeenCalled();
  });

  it("reel : le hook choisi en override prime sur le state, « Régénérer » retombe sur le state", async () => {
    const hookState = { id: "h-state", text: "Accroche du state" };
    const hookOverride = { id: "h-override", text: "Accroche choisie" };
    const params = makeParams({ selectedFormat: "reel", selectedReelHook: hookState });
    const { result } = renderHook(() => useDoGenerate(params));

    await act(() => result.current.doGenerate({}, hookOverride));
    expect(params.generate.mock.calls[0][0].selectedHook).toEqual(hookOverride);

    await act(() => result.current.doGenerate({}));
    expect(params.generate.mock.calls[1][0].selectedHook).toEqual(hookState);
    expect(params.resultSetters.setStep).toHaveBeenCalledWith("result");
  });
});

describe("useDoGenerate — carrousels (structure, régénération, mix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
  });

  const photos = [{ base64: "p1", context: "ctx1", mimeType: "image/jpeg" }];

  it("carrousel photo sans structure → proposition auto-validée puis handleConfirmStructure", async () => {
    const structureResult = { slides: [{ slide_number: 1 }], narrative_thread: "fil" };
    mocks.invokeWithTimeout.mockResolvedValue({ data: { result: structureResult }, error: null });
    const params = makeParams({ carouselSubMode: "photo", uploadedPhotos: photos });
    await run(params, {});

    expect(params.carousel.setStructureLoading).toHaveBeenNthCalledWith(1, true);
    const [fn, payload, timeout] = mocks.invokeWithTimeout.mock.calls[0];
    expect(fn).toBe("carousel-ai");
    expect(timeout).toBe(60000); // photos → analyse vision, timeout élargi
    expect(payload.body.type).toBe("structure_proposal");
    expect(payload.body.photos).toEqual([expect.objectContaining({ base64: "p1", vision: true })]);
    expect(params.photo.setGeneratedWithPhotos).toHaveBeenCalledWith(photos); // snapshot anti-reset

    expect(params.carousel.setStructureProposal).toHaveBeenCalledWith(structureResult);
    expect(params.carousel.handleConfirmStructure).toHaveBeenCalledWith(structureResult.slides, structureResult);
    // Pas de double génération : le chemin direct n'est jamais pris.
    expect(params.generate).not.toHaveBeenCalled();
  });

  it("photo_mismatch → erreur actionnable, retour à format, PAS de repli facturé", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { error: "photo_mismatch", message: "Tes photos ne collent pas au sujet" },
      error: null,
    });
    const params = makeParams({ carouselSubMode: "photo", uploadedPhotos: photos });
    await run(params);

    expect(mocks.toast.error).toHaveBeenCalledWith("Tes photos ne collent pas au sujet", { duration: 12000 });
    expect(params.resultSetters.setStep).toHaveBeenCalledWith("format");
    expect(params.generate).not.toHaveBeenCalled();
    expect(params.carousel.handleConfirmStructure).not.toHaveBeenCalled();
  });

  it("quota sur la proposition de structure → markQuotaExhausted, pas de repli", async () => {
    mocks.handleQuotaError.mockReturnValue(true);
    mocks.invokeWithTimeout.mockRejectedValue(new Error("limit_reached"));
    const params = makeParams({ carouselSubMode: "photo", uploadedPhotos: photos });
    await run(params);

    expect(params.markQuotaExhausted).toHaveBeenCalledTimes(1);
    expect(params.generate).not.toHaveBeenCalled();
    expect(params.carousel.setStructureLoading).toHaveBeenLastCalledWith(false);
  });

  it("structure en échec (hors quota) → repli en génération directe photo", async () => {
    mocks.invokeWithTimeout.mockRejectedValue(new Error("boom"));
    const params = makeParams({ carouselSubMode: "photo", uploadedPhotos: photos });
    await run(params);

    expect(mocks.toast.error).toHaveBeenCalledWith("Erreur lors de la proposition de structure. Génération directe...");
    expect(params.generate).toHaveBeenCalledTimes(1);
    expect(params.generate.mock.calls[0][0]).toMatchObject({
      format: "carousel",
      carouselType: "photo",
      photos: [{ base64: "p1", context: "ctx1", mimeType: "image/jpeg" }],
    });
  });

  it("structure déjà confirmée → régénération directe avec la même structure et le snapshot photos", async () => {
    const confirmed = [{ slide_number: 1, role: "hook" }];
    const params = makeParams({
      carouselSubMode: "photo",
      uploadedPhotos: [], // state UI reset…
      generatedWithPhotos: photos, // …le snapshot tient encore les photos
      lastConfirmedStructure: confirmed,
      lastNarrativeThread: "mon fil",
    });
    await run(params);

    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled(); // pas de 2e proposition de structure
    expect(params.resultSetters.setStep).toHaveBeenCalledWith("result");
    expect(params.generate).toHaveBeenCalledTimes(1);
    expect(params.generate.mock.calls[0][0]).toMatchObject({
      confirmedStructure: confirmed,
      narrativeThread: "mon fil",
      carouselType: "photo",
      photos: [expect.objectContaining({ base64: "p1" })],
    });
  });

  it("mix « J'écris d'abord » → textFirst + catalogue photo, snapshot des lignes bibliothèque figé", async () => {
    const rows = [{ id: "r1" }];
    const catalog = [{ index: 1, description: "photo atelier" }];
    const params = makeParams({
      carouselSubMode: "mix",
      isTextFirstMix: true,
      textFirstCatalogRows: rows,
      textFirstCatalog: catalog,
      textFirstRowsSnapshotRef: { current: [] },
    });
    await run(params);

    expect(params.carousel.textFirstRowsSnapshotRef.current).toBe(rows);
    expect(params.generate.mock.calls[0][0]).toMatchObject({
      carouselType: "mix",
      textFirst: true,
      photoCatalog: catalog,
    });
    // Pas de base64 envoyés en régime texte d'abord.
    expect(params.generate.mock.calls[0][0].photos).toBeUndefined();
  });
});

describe("useDoGenerate — photo dump (pure_photo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
  });

  const dumpParams = (overrides: Record<string, any> = {}) =>
    makeParams({
      carouselSubMode: "pure_photo",
      photoDumpEnabled: true,
      photoDumpDoneRef: { current: false },
      uploadedPhotos: [{ base64: "p1", userPhotoId: "lib-1", context: "au marché" }],
      ...overrides,
    });

  it("dump réussi → photos résolues poussées partout, fil narratif dans la description, dump marqué fait", async () => {
    const resolved = [{ base64: "r1", context: "beat matin" }, { base64: "r2", context: "beat soir" }];
    mocks.runPhotoDump.mockResolvedValue({ photos: resolved, narrativeThread: "une journée douce" });
    const params = dumpParams();
    await run(params);

    expect(mocks.runPhotoDump).toHaveBeenCalledWith(
      expect.objectContaining({ sujet: "Mon idée", attachedPhotoIds: ["lib-1"] }),
    );
    expect(params.photo.setUploadedPhotos).toHaveBeenCalledWith(resolved);
    expect(params.photo.setGeneratedWithPhotos).toHaveBeenCalledWith(resolved);
    expect(mocks.savePhotos).toHaveBeenCalledWith(resolved);
    expect(params.photo.photoDumpDoneRef.current).toBe(true);

    // carousel-ai ne VOIT pas les images : fil narratif + beats en texte.
    expect(params.generate).toHaveBeenCalledTimes(1);
    expect(params.generate.mock.calls[0][0]).toMatchObject({
      carouselType: "photo",
      carouselSubMode: "pure_photo",
      photoDescription: "une journée douce ; beat matin · beat soir",
    });
    expect(params.photo.setPhotoDumpResolving).toHaveBeenLastCalledWith(false);
  });

  it("mise en scène réservée Premium → toast avec CTA abonnement, retour à format, rien de facturé", async () => {
    mocks.runPhotoDump.mockRejectedValue(new mocks.PremiumRequiredError("premium"));
    const params = dumpParams();
    await run(params);

    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    const [msg, opts] = mocks.toast.error.mock.calls[0];
    expect(msg).toBe("La mise en scène est réservée au plan Premium");
    opts.action.onClick();
    expect(mocks.navigate).toHaveBeenCalledWith("/abonnement");
    expect(params.resultSetters.setStep).toHaveBeenLastCalledWith("format");
    expect(params.generate).not.toHaveBeenCalled();
  });

  it("échec inattendu du dump → simple bonus raté, la génération continue avec les photos attachées", async () => {
    mocks.runPhotoDump.mockRejectedValue(new Error("plan KO"));
    const params = dumpParams();
    await run(params);

    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(params.generate).toHaveBeenCalledTimes(1);
    // Pas de fil narratif : la description retombe sur les contextes des photos attachées.
    expect(params.generate.mock.calls[0][0].photoDescription).toBe("au marché");
    expect(params.photo.photoDumpDoneRef.current).toBe(false);
  });
});
