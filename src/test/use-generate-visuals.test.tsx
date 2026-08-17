import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Génération des visuels du carrousel (edge carousel-visual) + pré-génération
// en arrière-plan. Deux contrats critiques :
// 1. En mode background, JAMAIS de toast ni de mur quota surgissant sans clic —
//    l'état d'échec passe par setVisualsAutoError, près du bouton.
// 2. L'auto-déclenchement est borné à 2 tentatives par résultat (1 essai +
//    1 retry), chaque tentative étant un rendu FACTURÉ côté edge.

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  invokeWithHeartbeat: vi.fn(),
  handleQuotaError: vi.fn(),
  capture: vi.fn(),
  dbInsert: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.invokeWithHeartbeat }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: mocks.handleQuotaError }));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: mocks.capture } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mocks.dbInsert }) },
}));
vi.mock("@/lib/strip-font-import-leak", () => ({
  stripFontImportLeakFromSlides: (s: any) => s,
}));
vi.mock("@/lib/image-vision", () => ({
  downscalePhotosForVision: async (photos: any[]) => photos.map((p) => ({ ...p, vision: true })),
}));
vi.mock("@/lib/demo-auriana-data", () => ({
  AURIANA_DEMO_SUBJECT: "sujet-auriana",
  getAurianaDemoVisualSlides: () => [],
}));
vi.mock("@/features/creer/photo-source", () => ({
  pickNonEmpty: (a: any[], b: any[]) => (a?.length ? a : b?.length ? b : []),
}));
vi.mock("@/lib/resolve-photo-index", () => ({
  resolvePhotoIndexes: (slides: any[]) => slides,
}));
vi.mock("@/lib/photo-luminance", () => ({
  measureLuminanceZones: async () => null,
}));

import { useGenerateVisuals } from "@/hooks/use-generate-visuals";

function makeTextResult() {
  return {
    raw: {
      slides: [
        { slide_number: 1, role: "hook", slide_type: "text_only", title: "T1", body: "B1" },
        { slide_number: 2, role: "cta", slide_type: "text_only", title: "T2", body: "B2" },
      ],
      carousel_type: "text",
    },
  };
}

function makeParams(overrides: Record<string, any> = {}) {
  return {
    result: makeTextResult(),
    visualLoading: false,
    aurianaDemoActive: false,
    ideaText: "Mon idée",
    carouselSubMode: "text" as const,
    uploadedPhotos: [] as any[],
    generatedWithPhotos: [] as any[],
    workspaceId: "u1",
    session: { user: { id: "u1" } },
    carouselColors: null,
    charterData: null,
    qualityMax: false,
    coverIllustration: false,
    selectedFormat: "carousel" as string | null,
    visualSlides: [] as { slide_number: number; html: string }[],
    // step "questions" par défaut : l'effet d'auto-génération reste inerte,
    // on teste handleGenerateVisuals par appel direct.
    step: "questions",
    setVisualsAutoError: vi.fn(),
    setVisualLoading: vi.fn(),
    setVisualSlides: vi.fn(),
    setPhotoMissingDialog: vi.fn(),
    setVisualChunkProgress: vi.fn(),
    refreshPlan: vi.fn(),
    ...overrides,
  };
}

const okVisuals = {
  data: { result: { slides_html: [{ html: "<div>1</div>" }, { html: "<div>2</div>" }] } },
  error: null,
};

describe("useGenerateVisuals — appel manuel (avant-plan)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
    mocks.invokeWithHeartbeat.mockResolvedValue(okVisuals);
    mocks.dbInsert.mockResolvedValue({ error: null });
  });

  it("succès → slides normalisées posées, toast, compteur de crédits resynchronisé", async () => {
    const params = makeParams();
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals());

    const [fn, opts, timeout] = mocks.invokeWithHeartbeat.mock.calls[0];
    expect(fn).toBe("carousel-visual");
    expect(timeout).toBe(180000);
    expect(opts.body.slides).toEqual([
      expect.objectContaining({ slide_number: 1, slide_type: "text_only", title: "T1", body: "B1" }),
      expect.objectContaining({ slide_number: 2, slide_type: "text_only", title: "T2", body: "B2" }),
    ]);
    // Pas de photos → pas de payload photos, style neutre.
    expect(opts.body.photos).toBeUndefined();
    expect(opts.body).toHaveProperty("template_style", null);

    // En fin de flux, la progression est remise à zéro (finally).
    expect(params.setVisualChunkProgress).toHaveBeenLastCalledWith(null);
    // Le heartbeat remonte l'avancement des chunks pendant le vol.
    opts.onStatus("visuals", { done: 1, total: 4 });
    expect(params.setVisualChunkProgress).toHaveBeenLastCalledWith({ done: 1, total: 4 });

    expect(params.setVisualSlides).toHaveBeenCalledWith([
      { slide_number: 1, html: "<div>1</div>" },
      { slide_number: 2, html: "<div>2</div>" },
    ]);
    expect(mocks.toast.success).toHaveBeenCalledWith("Visuels générés !");
    expect(params.setVisualLoading).toHaveBeenNthCalledWith(1, true);
    expect(params.setVisualLoading).toHaveBeenLastCalledWith(false);
    // Le débit vient d'être tranché côté serveur → resynchroniser les crédits.
    expect(params.refreshPlan).toHaveBeenCalledTimes(1);
  });

  it("résultat amputé (1 slide sur 2) → jamais « Visuels générés ! », erreur réessayable", async () => {
    mocks.invokeWithHeartbeat.mockResolvedValue({
      data: { result: { slides_html: [{ html: "<div>1</div>" }] } },
      error: null,
    });
    const params = makeParams();
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals());

    expect(params.setVisualSlides).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error.mock.calls[0][0]).toContain("slides manquantes ou vides");
  });

  it("quota épuisé en avant-plan → mur quota (handleQuotaError), pas de toast brut", async () => {
    mocks.handleQuotaError.mockReturnValue(true);
    mocks.invokeWithHeartbeat.mockResolvedValue({
      data: { error: "limit_reached", quota: { plan: "free" } },
      error: null,
    });
    const params = makeParams();
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals());

    expect(mocks.handleQuotaError).toHaveBeenCalledWith({
      data: { error: "limit_reached", quota: { plan: "free" } },
    });
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(params.setVisualsAutoError).not.toHaveBeenCalledWith(expect.stringContaining("crédits"));
    expect(params.setVisualLoading).toHaveBeenLastCalledWith(false);
    expect(params.refreshPlan).toHaveBeenCalledTimes(1);
  });

  it("carrousel photo sans photo dispo → dialog de décision, AUCUN rendu lancé", async () => {
    const params = makeParams({
      result: { raw: { slides: [{ slide_number: 1, slide_type: "photo_full" }], carousel_type: "photo" } },
    });
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals());

    expect(params.setPhotoMissingDialog).toHaveBeenCalledWith({ open: true, rawType: "photo" });
    expect(mocks.invokeWithHeartbeat).not.toHaveBeenCalled();
    expect(params.setVisualLoading).toHaveBeenLastCalledWith(false);
  });

  it("forceText après le dialog → rendu en mode texte assumé, toast dédié", async () => {
    const params = makeParams({
      result: {
        raw: {
          slides: [
            { slide_number: 1, slide_type: "photo_full", overlay_text: "O1" },
            { slide_number: 2, slide_type: "text_only", title: "T2", body: "B2" },
          ],
          carousel_type: "photo",
        },
      },
    });
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals({ forceText: true }));

    expect(params.setPhotoMissingDialog).not.toHaveBeenCalled();
    // Downgrade explicite : tout est rendu text_only.
    const body = mocks.invokeWithHeartbeat.mock.calls[0][1].body;
    expect(body.slides.every((s: any) => s.slide_type === "text_only")).toBe(true);
    expect(mocks.toast.success).toHaveBeenCalledWith("Carrousel généré en mode texte (aucune photo disponible).");
  });

  it("slide photo non castée (photo_directive sans image) → refus AVANT l'edge ; silencieux en background", async () => {
    const uncast = {
      raw: {
        slides: [
          { slide_number: 1, slide_type: "photo_full", photo_directive: "une main", overlay_text: "O" },
          { slide_number: 2, slide_type: "text_only", title: "T", body: "B" },
        ],
        carousel_type: "mix",
      },
    };
    const params = makeParams({ result: uncast });
    const { result } = renderHook(() => useGenerateVisuals(params));

    await act(() => result.current.handleGenerateVisuals());
    expect(mocks.toast).toHaveBeenCalledWith("Choisis d'abord une image pour la slide photo restante.");
    expect(mocks.invokeWithHeartbeat).not.toHaveBeenCalled();

    mocks.toast.mockClear();
    await act(() => result.current.handleGenerateVisuals({ background: true }));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.invokeWithHeartbeat).not.toHaveBeenCalled();
  });
});

describe("useGenerateVisuals — pré-génération background silencieuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
    mocks.invokeWithHeartbeat.mockResolvedValue(okVisuals);
    mocks.dbInsert.mockResolvedValue({ error: null });
  });

  it("quota épuisé en background → PAS de mur ni de toast, message posé près du bouton", async () => {
    mocks.invokeWithHeartbeat.mockResolvedValue({
      data: { error: "limit_reached", quota: { plan: "free" } },
      error: null,
    });
    const params = makeParams();
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals({ background: true }));

    expect(params.setVisualsAutoError).toHaveBeenLastCalledWith(
      "Tes crédits sont épuisés : les visuels n'ont pas pu être créés automatiquement.",
    );
    expect(mocks.handleQuotaError).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(params.setVisualLoading).toHaveBeenLastCalledWith(false);
  });

  it("échec réseau en background → pas de toast, état honnête « réseau a flanché »", async () => {
    mocks.invokeWithHeartbeat.mockRejectedValue(new Error("network timeout"));
    const params = makeParams();
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals({ background: true }));

    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.handleQuotaError).not.toHaveBeenCalled(); // pas de mur quota surgissant
    expect(params.setVisualsAutoError).toHaveBeenLastCalledWith(
      "Le réseau a flanché pendant la création des visuels.",
    );
  });

  it("échec non-réseau en background → message générique, jamais de retour muet", async () => {
    mocks.invokeWithHeartbeat.mockRejectedValue(new Error("boom interne"));
    const params = makeParams();
    const { result } = renderHook(() => useGenerateVisuals(params));
    await act(() => result.current.handleGenerateVisuals({ background: true }));

    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(params.setVisualsAutoError).toHaveBeenLastCalledWith(
      "La création automatique des visuels n'a pas abouti.",
    );
  });

  it("auto-déclenchement borné : 2 tentatives max par résultat, puis main au bouton manuel", async () => {
    mocks.invokeWithHeartbeat.mockRejectedValue(new Error("edge lente"));
    const params = makeParams({ step: "result" });
    const { rerender } = renderHook((p) => useGenerateVisuals(p), { initialProps: params });

    // Tentative 1 au montage (le texte du carrousel est prêt).
    await waitFor(() => expect(mocks.invokeWithHeartbeat).toHaveBeenCalledTimes(1));

    // Cycle loading → idle (comme en réel après un échec) : retry unique.
    rerender({ ...params, visualLoading: true });
    rerender({ ...params, visualLoading: false });
    await waitFor(() => expect(mocks.invokeWithHeartbeat).toHaveBeenCalledTimes(2));

    // Budget épuisé : plus aucune tentative auto sur ce résultat.
    rerender({ ...params, visualLoading: true });
    rerender({ ...params, visualLoading: false });
    await act(async () => {});
    expect(mocks.invokeWithHeartbeat).toHaveBeenCalledTimes(2);
    // Et toujours aucun toast : les échecs auto restent silencieux.
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("l'auto-déclenchement ne court-circuite jamais le dialog photos manquantes", async () => {
    const params = makeParams({
      step: "result",
      result: { raw: { slides: [{ slide_number: 1, slide_type: "photo_full" }], carousel_type: "mix" } },
    });
    renderHook(() => useGenerateVisuals(params));
    await act(async () => {});

    expect(mocks.invokeWithHeartbeat).not.toHaveBeenCalled();
    expect(params.setPhotoMissingDialog).not.toHaveBeenCalled(); // la décision reste à l'utilisatrice, au clic
  });

  it("pas d'auto-déclenchement hors carrousel ou quand les visuels existent déjà", async () => {
    renderHook(() => useGenerateVisuals(makeParams({ step: "result", selectedFormat: "post" })));
    renderHook(() =>
      useGenerateVisuals(makeParams({ step: "result", visualSlides: [{ slide_number: 1, html: "<div/>" }] })),
    );
    await act(async () => {});
    expect(mocks.invokeWithHeartbeat).not.toHaveBeenCalled();
  });
});
