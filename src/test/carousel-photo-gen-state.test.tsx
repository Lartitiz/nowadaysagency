// CarouselPhotoResult : une proposition d'image IA suit sa slide quand on la
// monte, la descend ou qu'on supprime une autre slide (avant, elle restait
// attachée à la position, donc à une autre slide). Aucun appel réseau.
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
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

beforeEach(() => invokeMock.mockReset());
afterEach(cleanup);

// Trois slides « Image à choisir », chacune avec sa directive.
const slides = ["A", "B", "C"].map((l, i) => ({
  slide_number: i + 1,
  slide_type: "photo_full",
  overlay_text: `Texte ${l}`,
  photo_directive: `Directive ${l}`,
}));
const result = { slides, caption: { hook: "Accroche", body: "Corps", cta: "", hashtags: [] } };

function cards(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[class*="bg-card"]')).filter((c) =>
    /SLIDE \d+ \/ \d+/.test(c.textContent || ""),
  );
}

/** Position (0-based) de la carte qui affiche la proposition générée. */
function proposalPosition(container: HTMLElement) {
  return cards(container).findIndex((c) => within(c).queryByAltText("Proposition générée"));
}

function renderScreen() {
  return render(<CarouselPhotoResult result={result} onAddPhoto={() => 1} />);
}

describe("CarouselPhotoResult — la proposition d'image suit sa slide", () => {
  it("descendre la slide emporte sa proposition", async () => {
    invokeMock.mockResolvedValue({ data: { image: "data:image/png;base64,AAA" }, error: null } as any);
    const { container } = renderScreen();
    fireEvent.click(within(cards(container)[0]).getByRole("button", { name: /Générer l’image/ }));
    await waitFor(() => expect(proposalPosition(container)).toBe(0));

    fireEvent.click(within(cards(container)[0]).getByRole("button", { name: "Descendre la slide" }));

    expect(within(cards(container)[1]).getByText(/Directive A/)).toBeTruthy();
    expect(proposalPosition(container)).toBe(1);
  });

  it("supprimer une slide avant elle garde la proposition sur la bonne slide", async () => {
    invokeMock.mockResolvedValue({ data: { image: "data:image/png;base64,CCC" }, error: null } as any);
    const { container } = renderScreen();
    fireEvent.click(within(cards(container)[2]).getByRole("button", { name: /Générer l’image/ }));
    await waitFor(() => expect(proposalPosition(container)).toBe(2));

    fireEvent.click(within(cards(container)[0]).getByRole("button", { name: "Supprimer la slide" }));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer cette slide" }));

    await waitFor(() => expect(cards(container)).toHaveLength(2));
    expect(within(cards(container)[1]).getByText(/Directive C/)).toBeTruthy();
    expect(proposalPosition(container)).toBe(1);
  });

  it("une génération en cours atterrit sur sa slide même si elle a bougé entre-temps", async () => {
    let resolve: (v: any) => void = () => {};
    invokeMock.mockReturnValue(new Promise((r) => { resolve = r; }) as any);
    const { container } = renderScreen();
    fireEvent.click(within(cards(container)[0]).getByRole("button", { name: /Générer l’image/ }));
    fireEvent.click(within(cards(container)[0]).getByRole("button", { name: "Descendre la slide" }));

    resolve({ data: { image: "data:image/png;base64,AAA" }, error: null });

    await waitFor(() => expect(proposalPosition(container)).toBe(1));
    expect(within(cards(container)[1]).getByText(/Directive A/)).toBeTruthy();
  });
});
