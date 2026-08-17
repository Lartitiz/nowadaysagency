import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Routage de l'étape « format » : chaque branche qui évite un appel IA est une
// garde qui évite une génération FACTURÉE (double-clic, « Mes slides », démo,
// script Auriana). On vérifie ici que chaque raccourci part vers la bonne
// étape SANS toucher à l'IA, et que le flux normal prépare bien l'état que
// doGenerate lira ensuite.

const mocks = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  invokeWithTimeout: vi.fn(),
  handleQuotaError: vi.fn(),
  savePhotos: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invokeWithTimeout }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: mocks.handleQuotaError }));
vi.mock("@/hooks/use-flow-persistence", () => ({ savePhotos: mocks.savePhotos }));
vi.mock("@/lib/demo-auriana-data", () => ({
  AURIANA_DEMO_SUBJECT: "sujet-auriana",
  AURIANA_DEMO_FLOW: { questions: [{ question: "Q1" }] },
}));

import { useFormatNext } from "@/hooks/use-format-next";

function makeParams(overrides: Record<string, any> = {}) {
  return {
    loadingQuestions: false,
    generating: false,
    structureLoading: false,
    isDemoMode: false,
    demoData: null,
    ideaText: "Mon idée",
    editorialAngle: null,
    existingCalendarContent: null,
    aurianaDemoActive: false,
    carouselSubMode: null,
    uploadedPhotos: [],
    photoDescription: "",
    photoMode: false,
    newsjackingContext: null,
    isLinkedInCarousel: false,
    objective: null,
    session: { user: { id: "u1" } },
    workspaceId: "u1",
    photoDumpDoneRef: { current: true },
    setSlideLength: vi.fn(),
    setExplicitTextFirstMix: vi.fn(),
    setPhotoDumpEnabled: vi.fn(),
    setSelectedFormat: vi.fn(),
    setEditorialAngle: vi.fn(),
    setPinterestData: vi.fn(),
    setCarouselSubMode: vi.fn(),
    setUploadedPhotos: vi.fn(),
    setPhotoDescription: vi.fn(),
    setPhotoMode: vi.fn(),
    setStep: vi.fn(),
    setDemoGenerating: vi.fn(),
    setResult: vi.fn(),
    setInspirationImageBase64: vi.fn(),
    setInspirationImagePreview: vi.fn(),
    setInspirationAnalysis: vi.fn(),
    setInspirationProposals: vi.fn(),
    setInspirationLoading: vi.fn(),
    setQuestions: vi.fn(),
    resetGenerator: vi.fn(),
    generateQuestions: vi.fn().mockResolvedValue(undefined),
    handleLaunchSequence: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function run(params: any, ...args: Parameters<ReturnType<typeof useFormatNext>["handleFormatNext"]>) {
  const { result } = renderHook(() => useFormatNext(params));
  await act(() => result.current.handleFormatNext(...args));
}

describe("useFormatNext — gardes et routage par format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("garde anti double-clic : un flux déjà en cours ignore tout nouveau clic", async () => {
    for (const busy of [
      { loadingQuestions: true },
      { generating: true },
      { structureLoading: true },
    ]) {
      const params = makeParams(busy);
      await run(params, "carousel", undefined, { carouselSubMode: "text" });
      expect(params.setSlideLength).not.toHaveBeenCalled();
      expect(params.setStep).not.toHaveBeenCalled();
      expect(params.generateQuestions).not.toHaveBeenCalled();
    }
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });

  it("« Mes slides » → saisie directe, AUCUN appel IA", async () => {
    const params = makeParams();
    await run(params, "carousel", undefined, { carouselSubMode: "user_slides" });

    expect(params.setCarouselSubMode).toHaveBeenCalledWith("user_slides");
    expect(params.setStep).toHaveBeenCalledWith("user_slides");
    expect(params.generateQuestions).not.toHaveBeenCalled();
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
    // Nouveau parcours : la longueur revient à "auto" et le dump se re-résout.
    expect(params.setSlideLength).toHaveBeenCalledWith("auto");
    expect(params.photoDumpDoneRef.current).toBe(false);
  });

  it("flux normal LinkedIn → questions, avec l'angle hérité du coach d'idées", async () => {
    const params = makeParams({ editorialAngle: "storytelling", objective: "visibilite" });
    await run(params, "linkedin");

    expect(params.resetGenerator).toHaveBeenCalledTimes(1);
    expect(params.setStep).toHaveBeenCalledWith("questions");
    // Pas d'angle cliqué → l'angle déjà validé côté coach n'est PAS effacé.
    expect(params.setEditorialAngle).toHaveBeenCalledWith("storytelling");
    expect(params.generateQuestions).toHaveBeenCalledTimes(1);
    expect(params.generateQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "linkedin",
        subject: "Mon idée",
        editorialAngle: "storytelling",
        objective: "visibilite",
        channel: "linkedin",
      }),
    );
  });

  it("sujet vide en flux photo → jamais \"\" envoyé à l'IA (fallback description puis placeholder)", async () => {
    const params = makeParams({ ideaText: "  " });
    await run(params, "carousel", undefined, {
      carouselSubMode: "photo",
      photos: [{ base64: "b64", preview: "p" }],
    });
    expect(params.generateQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Carrousel basé sur les photos uploadées" }),
    );
    expect(mocks.savePhotos).toHaveBeenCalledTimes(1);

    const params2 = makeParams({ ideaText: "" });
    await run(params2, "carousel", undefined, {
      carouselSubMode: "photo",
      photos: [{ base64: "b64" }],
      photoDescription: "Mes photos d'atelier",
    });
    expect(params2.generateQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Mes photos d'atelier" }),
    );
  });

  it("angle « lancement » → séquence de lancement directe, pas de questions", async () => {
    const params = makeParams();
    await run(params, "instagram", "lancement");

    expect(params.setStep).toHaveBeenCalledWith("result");
    expect(params.handleLaunchSequence).toHaveBeenCalledWith("instagram", "lancement");
    expect(params.generateQuestions).not.toHaveBeenCalled();
    expect(params.resetGenerator).not.toHaveBeenCalled();
  });

  it("inspiration Pinterest → analyse lancée (180s), résultats posés", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { result: { analysis: { style: "épuré" }, proposals: [{ id: 1 }] } },
      error: null,
    });
    const params = makeParams({ workspaceId: "w-cliente" });
    await run(params, "pinterest_inspiration", undefined, { photos: [{ base64: "img-b64", preview: "p" }] });

    expect(params.setStep).toHaveBeenCalledWith("inspiration_proposals");
    const [fn, payload, timeout] = mocks.invokeWithTimeout.mock.calls[0];
    expect(fn).toBe("pinterest-inspiration");
    expect(payload.body).toEqual({ image_base64: "img-b64", workspace_id: "w-cliente" });
    expect(timeout).toBe(180000);
    expect(params.setInspirationAnalysis).toHaveBeenLastCalledWith({ style: "épuré" });
    expect(params.setInspirationProposals).toHaveBeenLastCalledWith([{ id: 1 }]);
    expect(params.setInspirationLoading).toHaveBeenLastCalledWith(false);
    expect(params.generateQuestions).not.toHaveBeenCalled();
  });

  it("inspiration Pinterest : image trop lourde → refus AVANT tout appel", async () => {
    const params = makeParams();
    await run(params, "pinterest_inspiration", undefined, {
      photos: [{ base64: "a".repeat(5_500_001) }],
    });

    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
    expect(params.setInspirationLoading).not.toHaveBeenCalled();
  });

  it("inspiration Pinterest : quota épuisé → retour à l'étape format, sans toast d'erreur brut", async () => {
    mocks.handleQuotaError.mockReturnValue(true);
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { error: "limit_reached" },
      error: null,
    });
    const params = makeParams();
    await run(params, "pinterest_inspiration", undefined, { photos: [{ base64: "img" }] });

    expect(mocks.handleQuotaError).toHaveBeenCalledTimes(1);
    expect(params.setStep).toHaveBeenLastCalledWith("format");
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(params.setInspirationLoading).toHaveBeenLastCalledWith(false);
  });

  it("mode démo, sujet pré-rempli → résultat instantané sans IA", async () => {
    vi.useFakeTimers();
    const demoResult = { slides: [{ slide_number: 1 }] };
    const params = makeParams({
      isDemoMode: true,
      ideaText: "sujet démo",
      demoData: { carousel_photo_demo: { subject: "sujet démo", result: demoResult } },
    });
    const { result } = renderHook(() => useFormatNext(params));
    await act(() => result.current.handleFormatNext("carousel", undefined, { carouselSubMode: "photo" }));

    expect(params.setStep).toHaveBeenCalledWith("result");
    expect(params.setDemoGenerating).toHaveBeenCalledWith(true);
    expect(params.generateQuestions).not.toHaveBeenCalled();
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(params.setResult).toHaveBeenCalledWith(
      expect.objectContaining({ type: "carousel", raw: demoResult }),
    );
    expect(params.setDemoGenerating).toHaveBeenLastCalledWith(false);
  });

  it("script Auriana suivi à la lettre → questions pré-écrites injectées, pas d'appel IA", async () => {
    const params = makeParams({ aurianaDemoActive: true, ideaText: "sujet-auriana" });
    await run(params, "carousel", undefined, { carouselSubMode: "text" });

    expect(params.setQuestions).toHaveBeenCalledWith([{ question: "Q1" }]);
    expect(params.generateQuestions).not.toHaveBeenCalled();
    expect(params.setStep).toHaveBeenCalledWith("questions");
  });

  it("le choix de longueur de slides est resynchronisé à chaque passage", async () => {
    const params = makeParams();
    await run(params, "carousel", undefined, { carouselSubMode: "text", slideLength: "short" });
    expect(params.setSlideLength).toHaveBeenCalledWith("short");

    const params2 = makeParams();
    await run(params2, "carousel", undefined, { carouselSubMode: "pure_photo" });
    expect(params2.setSlideLength).toHaveBeenCalledWith("auto");
  });
});
