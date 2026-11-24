// « Retour au carrousel » depuis le Studio : une erreur technique (base,
// réseau, fonction visual-studio) ne s'affiche jamais brute (PR #2038).
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ read: vi.fn(), request: vi.fn(), idea: vi.fn() }));
vi.mock("@/features/carousel-studio/store", () => ({
  carouselStudioStore: () => ({ read: mock.read, update: vi.fn() }),
}));
vi.mock("@/features/visual-studio/api", () => ({ studioRequest: mock.request }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: mock.idea, eq: () => ({ single: mock.idea }) }) }) }) },
}));
import { useCarouselStudioReturn } from "@/features/carousel-studio/useCarouselStudioReturn";

const TECHNIQUE = /Failed to fetch|Edge Function|non-2xx|TypeError|undefined|internal_boom|PGRST|JWT/i;
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const mount = () => renderHook(() => useCarouselStudioReturn("ticket", "user", "A", "session", () => true), { wrapper });

beforeEach(() => {
  Object.values(mock).forEach((fn) => fn.mockReset());
  localStorage.setItem("carousel-studio:ticket", JSON.stringify({ id: "ticket", userId: "user", workspaceId: "A",
    ideaId: "idea", documentId: "document", slideId: "slide", slideNumber: 2, sessionId: "session",
    fingerprint: "fingerprint", createdAt: Date.now() }));
});

it.each(["internal_boom", "TypeError: Failed to fetch", "Edge Function returned a non-2xx status code"])(
  "retour sans image : « %s » devient une phrase claire",
  async (message) => {
    mock.read.mockRejectedValue(new Error(message));
    const { result } = mount();
    await act(() => result.current.returnToCarousel());
    await waitFor(() => expect(result.current.error).not.toBe(""));
    expect(result.current.error).not.toMatch(TECHNIQUE);
    expect(result.current.busy).toBe(false);
  },
);

it("erreur de base à la lecture du carrousel : pas de code PostgREST affiché", async () => {
  mock.read.mockResolvedValue({ content_data: {} });
  mock.idea.mockResolvedValue({ data: null, error: Object.assign(new Error("JWT expired"), { code: "PGRST301" }) });
  const { result } = mount();
  await act(() => result.current.returnToCarousel());
  await waitFor(() => expect(result.current.error).not.toBe(""));
  expect(result.current.error).not.toMatch(TECHNIQUE);
  expect(result.current.error).toBe("Ta session a expiré. Reconnecte-toi pour continuer.");
});

it("enregistrement de l'image en panne (visual-studio) : pas de code technique", async () => {
  mock.request.mockRejectedValue(new Error("internal_boom"));
  const { result } = mount();
  await act(() => result.current.returnToCarousel({ id: "version", status: "ready", library_photo_id: null } as never));
  await waitFor(() => expect(result.current.error).not.toBe(""));
  expect(result.current.error).not.toMatch(TECHNIQUE);
});

it("garde tel quel un message déjà écrit pour la cliente", async () => {
  mock.read.mockResolvedValue(null);
  const { result } = mount();
  await act(() => result.current.returnToCarousel());
  expect(result.current.error).toBe("Ce carrousel n’est plus accessible dans cet espace.");
});
