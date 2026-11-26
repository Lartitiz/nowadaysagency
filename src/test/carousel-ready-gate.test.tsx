import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { READY_GATE_GRACE_MS, useCarouselReadyGate } from "@/components/creer/CarouselReadyGate";

const raw = { slides: [{ title: "Ce salon, personne n'en voulait." }, { title: "Une pièce sombre", body: "La cloison mangeait la lumière.", photo_index: 1 }] };

function Screen(props: { generating: boolean; raw?: any; visualCount?: number; visualLoading?: boolean; visualsError?: string | null }) {
  const gate = useCarouselReadyGate({ format: "carousel", generating: props.generating, raw: props.raw, visualCount: props.visualCount ?? 0, visualLoading: !!props.visualLoading, visualsError: props.visualsError, photos: [{ preview: "blob:p1" }] });
  return <>{gate ?? <p>écran habituel</p>}</>;
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("fin de création d'un carrousel : annonce et bouton, rien ne bascule tout seul", () => {
  it("création vue en direct : slides lisibles pendant la mise en page, puis « prêt » et le bouton ouvre", () => {
    const view = render(<Screen generating />);
    expect(screen.getByText("écran habituel")).toBeTruthy();
    view.rerender(<Screen generating={false} raw={raw} />);
    expect(screen.getByRole("status").textContent).toBe("Je mets en page tes slides…");
    expect(screen.getByText("La cloison mangeait la lumière.")).toBeTruthy();
    expect(document.querySelector("img")?.getAttribute("src")).toBe("blob:p1");
    expect(screen.queryByTestId("carousel-ready-open")).toBeNull();
    view.rerender(<Screen generating={false} raw={raw} visualLoading />);
    expect(screen.getByRole("status").textContent).toBe("Je mets en page tes slides…");
    view.rerender(<Screen generating={false} raw={raw} visualCount={2} />);
    expect(screen.getByRole("status").textContent).toBe("Ton carrousel est prêt · 2 slides");
    expect(screen.queryByText("écran habituel")).toBeNull();
    fireEvent.click(screen.getByTestId("carousel-ready-open"));
    expect(screen.getByText("écran habituel")).toBeTruthy();
    // « Refaire les visuels » ensuite : pas de nouveau sas.
    view.rerender(<Screen generating={false} raw={raw} visualLoading />);
    expect(screen.getByText("écran habituel")).toBeTruthy();
  });

  it("carrousel rouvert (jamais vu en écriture ici) : écran habituel tout de suite", () => {
    render(<Screen generating={false} raw={raw} visualCount={2} />);
    expect(screen.getByText("écran habituel")).toBeTruthy();
  });

  it("mise en page qui ne part pas ou qui échoue : l'écran habituel revient, sans rester bloqué", () => {
    vi.useFakeTimers();
    const view = render(<Screen generating />);
    view.rerender(<Screen generating={false} raw={raw} />);
    expect(screen.getByTestId("carousel-ready-gate")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(READY_GATE_GRACE_MS + 50); });
    expect(screen.getByText("écran habituel")).toBeTruthy();
    cleanup();
    const second = render(<Screen generating />);
    second.rerender(<Screen generating={false} raw={raw} visualLoading />);
    second.rerender(<Screen generating={false} raw={raw} visualsError="Les visuels n'ont pas pu être créés." />);
    expect(screen.getByText("écran habituel")).toBeTruthy();
  });

  it("photos brutes (aucun texte à montrer) : pas de sas", () => {
    const view = render(<Screen generating />);
    view.rerender(<Screen generating={false} raw={{ slides: [{ photo_index: 1 }] }} visualLoading />);
    expect(screen.getByText("écran habituel")).toBeTruthy();
  });
});
