import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Sélection d'une proposition Pinterest (flux inspiration). Deux chemins
// facturés selon recommended_output : visuel de référence (pinterest-visual)
// ou brief photo + overlay (pinterest-photo-brief). La garde anti double-clic
// évite une 2e génération facturée ; en cas de quota épuisé à step="result",
// markQuotaExhausted doit être posé pour afficher « quota » et non « Session
// expirée ».

const mocks = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
  invokeWithTimeout: vi.fn(),
  handleQuotaError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invokeWithTimeout }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: mocks.handleQuotaError }));

import { useSelectInspirationProposal } from "@/hooks/use-select-inspiration-proposal";

function makeParams(overrides: Record<string, any> = {}) {
  return {
    pinterestVisualGenerating: false,
    inspirationImageBase64: "ref-b64",
    pinterestData: { link: "https://pin.link", boardId: "b1", boardName: "Mon board" },
    workspaceId: "u1",
    session: { user: { id: "u1" } },
    clearQuotaExhausted: vi.fn(),
    markQuotaExhausted: vi.fn(),
    setChosenProposal: vi.fn(),
    setStep: vi.fn(),
    setResult: vi.fn(),
    setSelectedFormat: vi.fn(),
    setIdeaText: vi.fn(),
    setPinterestPinHtml: vi.fn(),
    setPinterestVisualGenerating: vi.fn(),
    setPhotoBriefOverlayHtml: vi.fn(),
    setPhotoBriefResult: vi.fn(),
    ...overrides,
  };
}

async function run(params: any, proposal: any) {
  const { result } = renderHook(() => useSelectInspirationProposal(params));
  await act(() => result.current.handleSelectInspirationProposal(proposal));
}

describe("useSelectInspirationProposal — deux chemins Pinterest et gardes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
  });

  it("garde anti double-clic : génération en cours → clic ignoré, rien n'est lancé", async () => {
    const params = makeParams({ pinterestVisualGenerating: true });
    await run(params, { recommended_output: "visual", subject: "S" });

    expect(params.clearQuotaExhausted).not.toHaveBeenCalled();
    expect(params.setChosenProposal).not.toHaveBeenCalled();
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });

  it("chemin A « visual » → pinterest-visual (180s), pin posé, format pinterest_visual", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: {
        result: {
          pin_html: "<div>pin</div>",
          title: "Titre",
          description: "Desc",
          pin_data: { a: 1 },
        },
      },
      error: null,
    });
    const params = makeParams({ workspaceId: "w-cliente" });
    const proposal = { recommended_output: "visual", subject: "Mon épingle", pin_type: "citation" };
    await run(params, proposal);

    // Appel direct hors generate() : l'ancien état quota ne doit pas coller.
    expect(params.clearQuotaExhausted).toHaveBeenCalledTimes(1);
    expect(params.setChosenProposal).toHaveBeenCalledWith(proposal);
    expect(params.setStep).toHaveBeenCalledWith("result");

    const [fn, payload, timeout] = mocks.invokeWithTimeout.mock.calls[0];
    expect(fn).toBe("pinterest-visual");
    expect(timeout).toBe(180000);
    expect(payload.body).toEqual({
      subject: "Mon épingle",
      pin_type: "citation",
      reference_image_base64: "ref-b64",
      pinterest_link: "https://pin.link",
      pinterest_board: "Mon board",
      workspace_id: "w-cliente",
    });

    expect(params.setPinterestPinHtml).toHaveBeenLastCalledWith("<div>pin</div>");
    expect(params.setSelectedFormat).toHaveBeenCalledWith("pinterest_visual");
    expect(params.setResult).toHaveBeenCalledWith({
      type: "pinterest_visual",
      raw: { pin_html: "<div>pin</div>", title: "Titre", description: "Desc", pin_data: { a: 1 } },
    });
    expect(params.setIdeaText).toHaveBeenCalledWith("Mon épingle");
    // Spinner ouvert puis refermé
    expect(params.setPinterestVisualGenerating).toHaveBeenNthCalledWith(1, true);
    expect(params.setPinterestVisualGenerating).toHaveBeenLastCalledWith(false);
  });

  it("chemin B (autre recommandation) → pinterest-photo-brief, overlay + brief posés", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: {
        result: {
          overlay_html: "<div>overlay</div>",
          photo_brief: { what: "Portrait" },
          title: "T",
          description: "D",
        },
      },
      error: null,
    });
    const params = makeParams();
    const proposal = { recommended_output: "photo", subject: "Ma photo", pin_type: "photo", brief: "lumineux" };
    await run(params, proposal);

    const [fn, payload] = mocks.invokeWithTimeout.mock.calls[0];
    expect(fn).toBe("pinterest-photo-brief");
    expect(payload.body.brief_hint).toBe("lumineux");
    // workspace perso → pas de workspace_id
    expect(payload.body.workspace_id).toBeUndefined();

    expect(params.setPhotoBriefOverlayHtml).toHaveBeenLastCalledWith("<div>overlay</div>");
    expect(params.setPhotoBriefResult).toHaveBeenCalledWith(
      expect.objectContaining({ photo_brief: { what: "Portrait" } }),
    );
    expect(params.setSelectedFormat).toHaveBeenCalledWith("pinterest_photo");
    expect(params.setResult).toHaveBeenCalledWith({
      type: "pinterest_photo",
      raw: {
        overlay_html: "<div>overlay</div>",
        photo_brief: { what: "Portrait" },
        title: "T",
        description: "D",
      },
    });
  });

  it("quota épuisé → markQuotaExhausted (affiche « quota », pas « Session expirée »), pas de toast brut", async () => {
    mocks.handleQuotaError.mockReturnValue(true);
    mocks.invokeWithTimeout.mockResolvedValue({ data: { error: "limit_reached" }, error: null });
    const params = makeParams();
    await run(params, { recommended_output: "visual", subject: "S" });

    expect(params.markQuotaExhausted).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(params.setPinterestVisualGenerating).toHaveBeenLastCalledWith(false);
  });

  it("erreur classique → toast d'erreur, quota non marqué", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({ data: null, error: { message: "réseau KO" } });
    const params = makeParams();
    await run(params, { recommended_output: "photo", subject: "S" });

    expect(mocks.toast.error).toHaveBeenCalledWith("réseau KO");
    expect(params.markQuotaExhausted).not.toHaveBeenCalled();
    expect(params.setPinterestVisualGenerating).toHaveBeenLastCalledWith(false);
  });
});
