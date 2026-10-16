// CarouselPhotoResult : refus de quota sur « Générer l'image · 1 crédit ».
// Le bouton du toast Premium dit « Passer à Premium » (règle CLAUDE.md) et le
// plafond d'images atteint passe par le message de quota standard du projet
// (handleQuotaError), avec l'ancien message en secours. Aucun appel réseau.
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import CarouselPhotoResult from "@/components/creer/formatRenderers/CarouselPhotoResult";
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
const toastMock = vi.mocked(toast) as unknown as ReturnType<typeof vi.fn> & { error: ReturnType<typeof vi.fn> };

beforeEach(() => {
  invokeMock.mockReset();
  toastMock.mockReset();
  toastMock.error.mockReset();
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

async function generateWith(data: unknown) {
  invokeMock.mockResolvedValue({ data, error: null } as never);
  render(<CarouselPhotoResult result={result} onAddPhoto={() => 1} />);
  fireEvent.click(screen.getAllByRole("button", { name: /Générer l’image/ })[0]);
  await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(toastMock.mock.calls.length + toastMock.error.mock.calls.length).toBe(1));
}

describe("CarouselPhotoResult — refus de quota de l'image IA", () => {
  it("plan gratuit : le bouton du toast dit « Passer à Premium »", async () => {
    await generateWith({ error: "premium_required" });
    const [, options] = toastMock.error.mock.calls[0];
    expect(options.action.label).toBe("Passer à Premium");
  });

  it("plafond d'images atteint : message de quota standard qui nomme la limite", async () => {
    await generateWith({
      error: "limit_reached",
      quota: {
        reason: "category",
        category: "photo_retouch",
        plan: "outil",
        usage: { photo_retouch: { used: 30, limit: 30 } },
      },
    });
    expect(toastMock.error).not.toHaveBeenCalled();
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe("Plafond du mois atteint 🌸");
    expect(options.description).toContain("tes 30 images du mois");
    // Plan payant : pas de lien vers les tarifs.
    expect(options.action).toBeUndefined();
  });

  it("quota illisible : l'ancien message reste en secours", async () => {
    await generateWith({ error: "limit_reached" });
    expect(toastMock.error).toHaveBeenCalledWith("Tu as utilisé toutes tes images du mois", {
      description: "Elles se rechargent au début du mois prochain.",
    });
  });
});
