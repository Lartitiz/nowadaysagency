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

  it("visuels prêts, carrousel pas encore ouvert : converti tout de suite pour la sauvegarde continue (Loom 28/11)", () => {
    const visuals = [1, 2].map((n) => ({ slide_number: n, html: `<html><body><div style="position:relative;width:1080px;height:1350px"><p>Slide ${n}</p></div></body></html>` }));
    const onImport = vi.fn();
    function Gate(p: { generating: boolean; raw?: any; visualSlides?: typeof visuals }) {
      const gate = useCarouselReadyGate({ format: "carousel", generating: p.generating, raw: p.raw, visualCount: p.visualSlides?.length ?? 0, visualLoading: false, photos: [], visualSlides: p.visualSlides, onImport });
      return <>{gate ?? <p>écran habituel</p>}</>;
    }
    const view = render(<Gate generating />);
    view.rerender(<Gate generating={false} raw={raw} />);
    expect(onImport).not.toHaveBeenCalled();
    view.rerender(<Gate generating={false} raw={raw} visualSlides={visuals} />);
    expect(screen.getByTestId("carousel-ready-open")).toBeTruthy();
    expect(onImport).toHaveBeenCalledTimes(1);
    const [out, slides] = onImport.mock.calls[0];
    expect(out.carousel_editor_version).toBe(1);
    expect(out.carousel_retouched).toBe(false);
    expect(slides).toHaveLength(2);
    // Une fois converti, plus rien à refaire.
    view.rerender(<Gate generating={false} raw={out} visualSlides={slides} />);
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

