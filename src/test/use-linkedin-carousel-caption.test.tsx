import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Légende LinkedIn des carrousels mix/photo : le prompt carousel-ai laisse la
// légende vide exprès, un second appel « caption-for-carousel » la génère.
// L'auto-déclenchement (body < 200 caractères) part un appel IA FACTURÉ : la
// garde par ref doit empêcher tout re-déclenchement sur le même résultat,
// sinon chaque re-render brûlerait un crédit.

const mocks = vi.hoisted(() => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
  invokeWithTimeout: vi.fn(),
  handleQuotaError: vi.fn(),
  setResult: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invokeWithTimeout }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: mocks.handleQuotaError }));

import { useLinkedInCarouselCaption } from "@/hooks/use-linkedin-carousel-caption";

function makeProps(overrides: Partial<Parameters<typeof useLinkedInCarouselCaption>[0]> = {}) {
  return {
    result: {
      raw: {
        slides: [{ slide_number: 1, overlay_text: "Accroche", title: "Titre", body: "Corps" }],
        caption: { body: "" },
      },
    },
    setResult: mocks.setResult,
    generating: false,
    isLinkedInCarousel: true,
    carouselSubMode: "mix" as string | null,
    ideaText: "Mon idée",
    editorialAngle: null,
    objective: null,
    workspaceId: "u1",
    session: { user: { id: "u1" } },
    ...overrides,
  };
}

describe("useLinkedInCarouselCaption — auto-déclenchement et garde anti-doublon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleQuotaError.mockReturnValue(false);
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { content: { hook: "H", body: "corps généré", cta: "CTA", hashtags: ["#a"] } },
      error: null,
    });
  });

  it("légende vide (<200) → un seul appel, jamais re-déclenché sur le même résultat", async () => {
    const props = makeProps();
    const { rerender } = renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: props,
    });

    await waitFor(() => expect(mocks.invokeWithTimeout).toHaveBeenCalledTimes(1));
    const [fn, payload, timeout] = mocks.invokeWithTimeout.mock.calls[0];
    expect(fn).toBe("linkedin-ai");
    expect(timeout).toBe(60000);
    expect(payload.body.action).toBe("caption-for-carousel");
    expect(payload.body.subject).toBe("Mon idée");
    expect(payload.body.slides_summary).toBe("Slide 1: Accroche ; Titre ; Corps");
    // workspace perso (workspaceId === user.id) → pas de workspace_id envoyé
    expect(payload.body.workspace_id).toBeUndefined();

    // Re-render avec le même résultat : la ref bloque tout second appel facturé.
    rerender({ ...props });
    rerender({ ...props });
    await act(async () => {});
    expect(mocks.invokeWithTimeout).toHaveBeenCalledTimes(1);
  });

  it("légende déjà correcte (body ≥ 200) → aucun appel", async () => {
    renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps({
        result: {
          raw: {
            slides: [{ slide_number: 1, body: "x" }],
            caption: { body: "a".repeat(200) },
          },
        },
      }),
    });
    await act(async () => {});
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });

  it("pas d'auto-déclenchement pendant la génération, hors LinkedIn, ou en sous-mode texte", async () => {
    renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps({ generating: true }),
    });
    renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps({ isLinkedInCarousel: false }),
    });
    renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps({ carouselSubMode: "text" }),
    });
    renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps({ result: { raw: { slides: [], caption: {} } } }),
    });
    await act(async () => {});
    expect(mocks.invokeWithTimeout).not.toHaveBeenCalled();
  });

  it("workspace client (id ≠ user) → workspace_id transmis à l'edge", async () => {
    renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps({ workspaceId: "w-cliente" }),
    });
    await waitFor(() => expect(mocks.invokeWithTimeout).toHaveBeenCalledTimes(1));
    expect(mocks.invokeWithTimeout.mock.calls[0][1].body.workspace_id).toBe("w-cliente");
  });

  it("réponse en bloc ```json → nettoyée, parsée et fusionnée en gardant le hook existant", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { content: '```json\n{"body":"corps généré","cta":"Suis-moi","hashtags":["#solo"]}\n```' },
      error: null,
    });
    renderHook((p) => useLinkedInCarouselCaption(p), { initialProps: makeProps() });

    await waitFor(() => expect(mocks.setResult).toHaveBeenCalledTimes(1));
    const updater = mocks.setResult.mock.calls[0][0];
    const next = updater({ raw: { slides: [], caption: { hook: "Accroche existante" } } });
    expect(next.raw.caption).toEqual({
      hook: "Accroche existante", // pas de hook dans la réponse → l'existant est conservé
      body: "corps généré",
      cta: "Suis-moi",
      hashtags: ["#solo"],
    });
  });

  it("erreur de quota → handleQuotaError prend la main, pas de toast d'erreur ni de merge", async () => {
    mocks.handleQuotaError.mockReturnValue(true);
    mocks.invokeWithTimeout.mockResolvedValue({
      data: { error: "limit_reached", message: "Plus de crédits" },
      error: null,
    });
    const { result } = renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps(),
    });

    await waitFor(() => expect(mocks.handleQuotaError).toHaveBeenCalledTimes(1));
    expect(mocks.handleQuotaError).toHaveBeenCalledWith(
      expect.objectContaining({ error: "limit_reached" }),
    );
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.setResult).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.captionLoading).toBe(false));
  });

  it("erreur edge → toast d'erreur et fin du chargement", async () => {
    mocks.invokeWithTimeout.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps(),
    });

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("boom"));
    expect(mocks.setResult).not.toHaveBeenCalled();
    expect(result.current.captionLoading).toBe(false);
  });

  it("regenerateCaption remet la garde à zéro → un nouvel appel sur le même résultat", async () => {
    const { result } = renderHook((p) => useLinkedInCarouselCaption(p), {
      initialProps: makeProps(),
    });
    await waitFor(() => expect(mocks.invokeWithTimeout).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.regenerateCaption();
    });
    await waitFor(() => expect(mocks.invokeWithTimeout).toHaveBeenCalledTimes(2));
  });
});
