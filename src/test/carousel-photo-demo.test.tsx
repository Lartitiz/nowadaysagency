// CarouselPhotoResult en mode démo : « Générer l'image · 1 crédit » n'appelle
// jamais le serveur (CLAUDE.md : aucun appel IA en démo) ; un message doux
// l'explique. /creer ne passe pas onOpenStudio en démo, mais passe onAddPhoto :
// le bouton est donc bien affiché. Aucun appel réseau.
import React, { useEffect } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import CarouselPhotoResult from "@/components/creer/formatRenderers/CarouselPhotoResult";
import { DemoProvider, useDemoContext } from "@/contexts/DemoContext";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";

vi.mock("@/components/creer/PhotoSwapDialog", () => ({ default: () => null }));
vi.mock("@/components/creer/NewsPhotoPickerDialog", () => ({ default: () => null }));
vi.mock("@/components/photos/PhotoLibraryPickerDialog", () => ({
  PhotoLibraryPickerDialog: () => null,
}));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "ws-test" }));
vi.mock("@/lib/photo-storage", () => ({ userPhotoToBase64: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const invokeMock = vi.mocked(invokeWithTimeout);
const toastMock = vi.mocked(toast);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ data: { image: "data:image/png;base64,AAA" }, error: null } as never);
  toastMock.mockReset();
});
afterEach(cleanup);

const result = {
  slides: [1, 2].map((n) => ({
    slide_number: n,
    slide_type: "photo_full",
    overlay_text: `Texte ${n}`,
    photo_directive: `Directive ${n}`,
  })),
  caption: { hook: "Accroche", body: "Corps", cta: "", hashtags: [] },
};

function Screen({ demo }: { demo: boolean }) {
  const { activateDemo, isDemoMode } = useDemoContext();
  useEffect(() => {
    if (demo) activateDemo();
  }, [demo, activateDemo]);
  if (demo && !isDemoMode) return null;
  return <CarouselPhotoResult result={result} onAddPhoto={() => 1} />;
}

function renderWith(demo: boolean) {
  render(
    <DemoProvider>
      <Screen demo={demo} />
    </DemoProvider>,
  );
}

describe("CarouselPhotoResult — mode démo", () => {
  it("en démo, « Générer l'image » n'appelle pas le serveur et explique pourquoi", async () => {
    renderWith(true);
    fireEvent.click(screen.getAllByRole("button", { name: /Générer l’image/ })[0]);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        "Cette action est disponible dans l'outil complet. Crée ton compte gratuit !",
      ),
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.queryByAltText("Proposition générée")).toBeNull();
  });

  it("hors démo, le bouton appelle bien carousel-slide-image", async () => {
    renderWith(false);
    fireEvent.click(screen.getAllByRole("button", { name: /Générer l’image/ })[0]);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][0]).toBe("carousel-slide-image");
  });
});
