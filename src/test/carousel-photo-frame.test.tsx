// Remplacer la photo d'un cadre depuis la barre flottante, ou en la glissant dessus (04/10/2026).
import { useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CarouselEditor from "@/components/creer/CarouselEditor";
import { readCarouselDocument } from "@/lib/carousel-editor";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/creer/PhotoSwapDialog", () => ({
  default: ({ onSelect }: any) => (
    <button onClick={() => onSelect({ name: "Nouvelle", base64: "data:image/jpeg;base64,NEW", preview: "data:image/jpeg;base64,NEW", mimeType: "image/jpeg" })}>
      Choisir la nouvelle photo
    </button>
  ),
}));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(cleanup);

const raw = { slides: [{ slide_number: 1, title: "Les mains", body: "Texte" }], caption: { body: "L" } };
const visuals = [
  {
    slide_number: 1,
    html: '<div style="position:relative;width:1080px;height:1350px"><div data-pptx-photo="1" style="position:absolute;left:0;top:0;width:540px;height:1350px;background-image:url(&quot;data:image/jpeg;base64,OLD&quot;);background-size:cover;background-position:20% 70%"></div><h1 data-slide-text="title" style="position:absolute;left:600px">Les mains</h1><p data-slide-text="body" style="position:absolute;left:600px;top:400px">Texte</p></div>',
  },
];
function Harness() {
  const [r, setR] = useState<any>(raw), [v, setV] = useState(visuals);
  return (
    <>
      <output data-testid="saved">{JSON.stringify({ v })}</output>
      <CarouselEditor result={r} visualSlides={v} photos={[]} onAddPhoto={() => 2} onChange={(a, b) => { setR(a); setV(b); }} />
    </>
  );
}

it("replaces the photo of the selected frame from the floating toolbar and resets its framing", () => {
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);
  try {
    render(<Harness />);
    const iframe = screen.getByTitle("Éditeur de la slide 1") as HTMLIFrameElement;
    const doc = iframe.contentDocument!;
    doc.body.innerHTML = readCarouselDocument(raw, visuals).slides[0].html;
    fireEvent.load(iframe);
    const photo = doc.querySelector<HTMLElement>("[data-pptx-photo]")!;
    photo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 540, height: 1350, right: 540, bottom: 1350, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(photo, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(photo, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Remplacer/ }));
    fireEvent.click(screen.getByText("Choisir la nouvelle photo"));
    const saved = JSON.parse(screen.getByTestId("saved").textContent!);
    const frame = new DOMParser().parseFromString(saved.v[0].html, "text/html").querySelector<HTMLElement>("[data-pptx-photo]")!;
    expect(frame.style.backgroundImage).toContain("NEW");
    expect(frame.style.width).toBe("540px");
    expect(frame.style.backgroundPosition).toBe("50% 50%");
    expect(frame.getAttribute("data-pptx-photo")).toBe("2");
  } finally {
    width.mockRestore();
  }
});
