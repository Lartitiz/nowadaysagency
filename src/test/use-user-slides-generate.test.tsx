import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Flux « Mes slides » : l'utilisatrice écrit ses slides, l'IA se limite à
// assigner des gabarits aux slides photo (passe fail-open : erreur/timeout →
// slides inchangées, JAMAIS de texte réécrit). Le texte verbatim de
// l'utilisatrice doit toujours reprendre le dessus sur ce que renvoie l'edge.

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  invokeWithTimeout: vi.fn(),
  savePhotos: vi.fn(),
  resetPostGenerationState: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invokeWithTimeout }));
vi.mock("@/hooks/use-flow-persistence", () => ({ savePhotos: mocks.savePhotos }));
vi.mock("@/features/creer/post-generation-reset", () => ({
  resetPostGenerationState: mocks.resetPostGenerationState,
}));
vi.mock("@/lib/user-slides-parse", () => ({
  composeOverlayText: (title: string, body: string) => (title?.trim() ? `${title.trim()}\n${body}` : body),
}));

import { useUserSlidesGenerate } from "@/hooks/use-user-slides-generate";

function makeParams(overrides: Record<string, any> = {}) {
  return {
    generating: false,
    visualLoading: false,
    workspaceId: "u1",
    session: { user: { id: "u1" } },
    setUploadedPhotos: vi.fn(),
    setGeneratedWithPhotos: vi.fn(),
    setSavedId: vi.fn(),
    setVisualSlides: vi.fn(),
    setCarouselColors: vi.fn(),
    setStep: vi.fn(),
    setResult: vi.fn(),
    ...overrides,
  };
}

let draftSeq = 0;
const textDraft = (title: string, body: string) => ({ id: `d${++draftSeq}`, title, body, photoIndex: null });
const photoDraft = (title: string, body: string, photoIndex: number) => ({ id: `d${++draftSeq}`, title, body, photoIndex });
const photo = (base64: string) => ({ base64, preview: `preview-${base64}`, name: `${base64}.jpg` });

describe("useUserSlidesGenerate — « Mes slides » sans réécriture IA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invokeWithTimeout.mockResolvedValue({ data: { result: { slides: [] } }, error: null });
  });

  it("garde anti double-clic : génération ou visuels en cours → clic ignoré", async () => {
    for (const busy of [{ generating: true }, { visualLoading: true }]) {
      const params = makeParams(busy);
      const { result } = renderHook(() => useUserSlidesGenerate(params));
      await act(() =>
        result.current.handleUserSlidesGenerate({
          slides: [textDraft("A", "a"), textDraft("B", "b")],
          photos: [],
          caption: "",
        }),
      );
      expect(params.setUploadedPhotos).not.toHaveBeenCalled();
      expect(params.setResult).not.toHaveBeenCalled();
    }
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });

  it("moins de 2 slides → refus avec message, rien n'est lancé", async () => {
    const params = makeParams();
    const { result } = renderHook(() => useUserSlidesGenerate(params));
    await act(() =>
      result.current.handleUserSlidesGenerate({
        slides: [textDraft("Seule", "slide")],
        photos: [],
        caption: "",
      }),
    );

    expect(mocks.toast.error).toHaveBeenCalledWith("Il faut au moins 2 slides avec du texte.");
    expect(params.setUploadedPhotos).not.toHaveBeenCalled();
    expect(params.setResult).not.toHaveBeenCalled();
  });

  it("carrousel 100% texte → AUCUN appel IA, texte verbatim, rôles hook/point/cta", async () => {
    const params = makeParams();
    const { result } = renderHook(() => useUserSlidesGenerate(params));
    await act(() =>
      result.current.handleUserSlidesGenerate({
        slides: [textDraft("Titre 1", "Corps 1"), textDraft("", "Corps 2"), textDraft("Titre 3", "Corps 3")],
        photos: [],
        caption: "  Ma légende  ",
      }),
    );

    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
    expect(mocks.resetPostGenerationState).toHaveBeenCalledTimes(1);
    expect(params.setStep).toHaveBeenCalledWith("result");
    expect(params.setResult).toHaveBeenCalledTimes(1);
    const res = params.setResult.mock.calls[0][0];
    expect(res.type).toBe("carousel");
    expect(res.raw.carousel_type).toBe("text");
    expect(res.raw.user_slides).toBe(true);
    expect(res.raw.caption).toEqual({ hook: "", body: "Ma légende", cta: "", hashtags: [] });
    expect(res.raw.slides).toEqual([
      { slide_number: 1, role: "hook", slide_type: "text_only", title: "Titre 1", body: "Corps 1" },
      { slide_number: 2, role: "point", slide_type: "text_only", title: "", body: "Corps 2" },
      { slide_number: 3, role: "cta", slide_type: "text_only", title: "Titre 3", body: "Corps 3" },
    ]);
  });

  it("≥2 slides photo → passe gabarits, mais le texte de l'utilisatrice reprend TOUJOURS le dessus", async () => {
    // L'edge tente de réécrire l'overlay (« HACKED ») : seuls les champs de
    // gabarit (template, big_number…) doivent passer.
    mocks.invokeWithTimeout.mockResolvedValue({
      data: {
        result: {
          slides: [
            { slide_number: 1, overlay_text: "HACKED", template: "grand_titre", big_number: "42" },
            { slide_number: 3, overlay_text: "HACKED", template: "citation", attribution: "Coco" },
          ],
        },
      },
      error: null,
    });
    const photos = [photo("p1"), photo("p2")];
    const params = makeParams({ workspaceId: "w-cliente" });
    const { result } = renderHook(() => useUserSlidesGenerate(params));
    await act(() =>
      result.current.handleUserSlidesGenerate({
        slides: [photoDraft("Ouverture", "Texte 1", 1), textDraft("Milieu", "Texte 2"), photoDraft("", "Fin", 2)],
        photos,
        caption: "légende",
      }),
    );

    // Passe gabarits : uniquement les slides photo, 30s, workspace cliente.
    const [fn, payload, timeout] = mocks.invokeWithTimeout.mock.calls[0];
    expect(fn).toBe("carousel-ai");
    expect(timeout).toBe(30000);
    expect(payload.body.type).toBe("assign_templates");
    expect(payload.body.workspace_id).toBe("w-cliente");
    expect(payload.body.slides.map((s: any) => s.slide_number)).toEqual([1, 3]);

    const slides = params.setResult.mock.calls[0][0].raw.slides;
    expect(slides[0]).toMatchObject({
      slide_number: 1,
      slide_type: "photo_full",
      overlay_text: "Ouverture\nTexte 1", // verbatim utilisatrice, pas « HACKED »
      photo_index: 1,
      template: "grand_titre",
      big_number: "42",
    });
    expect(slides[1]).toMatchObject({ slide_type: "text_only", title: "Milieu", body: "Texte 2" });
    expect(slides[2]).toMatchObject({
      slide_number: 3,
      overlay_text: "Fin",
      photo_index: 2,
      template: "citation",
      attribution: "Coco",
    });
    expect(params.setResult.mock.calls[0][0].raw.carousel_type).toBe("mix");

    // Photos poussées vers les states partagés + persistées.
    expect(params.setUploadedPhotos).toHaveBeenCalledWith(photos);
    expect(params.setGeneratedWithPhotos).toHaveBeenCalledWith(photos);
    expect(mocks.savePhotos).toHaveBeenCalledWith(photos);
  });

  it("passe gabarits en échec → fail-open : slides inchangées, résultat quand même posé, pas de toast", async () => {
    mocks.invokeWithTimeout.mockRejectedValue(new Error("timeout"));
    const photos = [photo("p1"), photo("p2")];
    const params = makeParams();
    const { result } = renderHook(() => useUserSlidesGenerate(params));
    await act(() =>
      result.current.handleUserSlidesGenerate({
        slides: [photoDraft("A", "a", 1), photoDraft("B", "b", 2)],
        photos,
        caption: "",
      }),
    );

    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(params.setStep).toHaveBeenCalledWith("result");
    const res = params.setResult.mock.calls[0][0];
    expect(res.raw.carousel_type).toBe("photo");
    expect(res.raw.slides).toEqual([
      expect.objectContaining({ slide_number: 1, slide_type: "photo_full", overlay_text: "A\na", photo_index: 1 }),
      expect.objectContaining({ slide_number: 2, slide_type: "photo_full", overlay_text: "B\nb", photo_index: 2 }),
    ]);
    expect(result.current.userSlidesBuilding).toBe(false);
  });

  it("photoIndex hors limites → la slide redevient texte (pas de photo arbitraire)", async () => {
    const params = makeParams();
    const { result } = renderHook(() => useUserSlidesGenerate(params));
    await act(() =>
      result.current.handleUserSlidesGenerate({
        slides: [photoDraft("A", "a", 3), textDraft("B", "b")], // photoIndex 3 mais 1 seule photo
        photos: [photo("p1")],
        caption: "",
      }),
    );

    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled(); // 0 slide photo valide → pas de passe gabarits
    const res = params.setResult.mock.calls[0][0];
    expect(res.raw.slides[0]).toMatchObject({ slide_type: "text_only", title: "A", body: "a" });
    expect(res.raw.carousel_type).toBe("text");
  });
});
